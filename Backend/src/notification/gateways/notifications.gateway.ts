import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MetricsService } from '../../metrics/metrics.service';
import { NotificationsStreamService } from '../streams/notifications-stream.service';

interface SocketRateState {
  windowStartedAt: number;
  count: number;
}

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly maxEventsPerMinute = 120;
  private readonly socketRate = new Map<string, SocketRateState>();

  constructor(
    private readonly metricsService: MetricsService,
    private readonly notificationsStream: NotificationsStreamService,
  ) {}

  afterInit(): void {
    this.logger.log('Notifications gateway initialized');
  }

  handleConnection(client: Socket): void {
    const userId = this.extractUserId(client);
    if (!userId) {
      client.emit('error', { message: 'Unauthorized websocket connection' });
      client.disconnect(true);
      return;
    }

    client.join(this.userRoom(userId));
    this.metricsService.incrementWsConnections();
    client.emit('connected', {
      userId,
      reconnectHint: 'Client should reconnect with the same userId if connection drops',
    });
  }

  handleDisconnect(client: Socket): void {
    this.socketRate.delete(client.id);
    this.metricsService.decrementWsConnections();
  }

  @SubscribeMessage('notifications.subscribeProject')
  handleSubscribeProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { projectId: string },
  ): { ok: boolean } {
    this.enforceRateLimit(client);
    if (!body?.projectId) {
      return { ok: false };
    }

    client.join(this.projectRoom(body.projectId));
    return { ok: true };
  }

  @SubscribeMessage('notifications.unsubscribeProject')
  handleUnsubscribeProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { projectId: string },
  ): { ok: boolean } {
    this.enforceRateLimit(client);
    if (!body?.projectId) {
      return { ok: false };
    }

    client.leave(this.projectRoom(body.projectId));
    return { ok: true };
  }

  @SubscribeMessage('notifications.joinAnnouncements')
  handleJoinAnnouncements(@ConnectedSocket() client: Socket): { ok: boolean } {
    this.enforceRateLimit(client);
    client.join('announcements');
    return { ok: true };
  }

  emitToUser(userId: string, event: string, payload: Record<string, unknown>): void {
    this.server.to(this.userRoom(userId)).emit(event, payload);
    this.notificationsStream.publishToUser(userId, event, payload);
  }

  broadcastContribution(projectId: string, payload: Record<string, unknown>): void {
    this.server.to(this.projectRoom(projectId)).emit('project.contribution', payload);
  }

  broadcastMilestone(projectId: string, payload: Record<string, unknown>): void {
    this.server.to(this.projectRoom(projectId)).emit('project.milestone', payload);
  }

  broadcastDeadline(projectId: string, payload: Record<string, unknown>): void {
    this.server.to(this.projectRoom(projectId)).emit('project.deadline', payload);
  }

  broadcastReputation(userId: string, payload: Record<string, unknown>): void {
    this.emitToUser(userId, 'user.reputation', payload);
  }

  broadcastAnnouncement(payload: Record<string, unknown>): void {
    this.server.to('announcements').emit('system.announcement', payload);
  }

  private enforceRateLimit(client: Socket): void {
    const now = Date.now();
    const existing = this.socketRate.get(client.id);

    if (!existing || now - existing.windowStartedAt >= 60000) {
      this.socketRate.set(client.id, { windowStartedAt: now, count: 1 });
      return;
    }

    existing.count += 1;
    if (existing.count > this.maxEventsPerMinute) {
      client.emit('error', { message: 'Rate limit exceeded' });
      throw new Error('Websocket client rate limit exceeded');
    }
  }

  private extractUserId(client: Socket): string | null {
    const authUser = client.handshake.auth?.userId;
    const queryUser = client.handshake.query?.userId;
    const userId = typeof authUser === 'string' ? authUser : typeof queryUser === 'string' ? queryUser : '';
    return userId || null;
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private projectRoom(projectId: string): string {
    return `project:${projectId}`;
  }
}
