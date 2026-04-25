import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AnalyticsService } from './analytics.service';
import { MetricsService } from '../metrics/metrics.service';

@WebSocketGateway({
  namespace: 'analytics',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class AnalyticsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(AnalyticsGateway.name);
  private readonly connectedClients = new Set<string>();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly metrics: MetricsService,
  ) {}

  afterInit(): void {
    this.logger.log('Analytics WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    this.connectedClients.add(client.id);
    this.metrics.incrementWsConnections();
    this.logger.debug(`Client connected: ${client.id}. Total: ${this.connectedClients.size}`);

    // Send initial snapshot
    this.sendSnapshot(client);

    // Subscribe client to realtime room
    client.join('realtime');
  }

  handleDisconnect(client: Socket): void {
    this.connectedClients.delete(client.id);
    this.metrics.decrementWsConnections();
    this.logger.debug(`Client disconnected: ${client.id}. Total: ${this.connectedClients.size}`);
  }

  /**
   * Broadcast real-time analytics snapshot to all connected clients
   * every 30 seconds
   */
  @Interval(30000)
  async broadcastRealtimeMetrics(): Promise<void> {
    if (this.connectedClients.size === 0) return;

    try {
      const snapshot = await this.analyticsService.getRealtimeSnapshot();
      this.server.to('realtime').emit('metrics', snapshot);
      this.logger.debug(`Broadcasted metrics to ${this.connectedClients.size} clients`);
    } catch (error) {
      this.logger.error('Failed to broadcast realtime metrics', error);
    }
  }

  /**
   * Broadcast a specific event to all realtime subscribers
   */
  broadcastEvent(event: string, data: unknown): void {
    this.server.to('realtime').emit('event', {
      event,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send snapshot to a specific client
   */
  private async sendSnapshot(client: Socket): Promise<void> {
    try {
      const snapshot = await this.analyticsService.getRealtimeSnapshot();
      client.emit('snapshot', snapshot);
    } catch (error) {
      this.logger.error(`Failed to send snapshot to ${client.id}`, error);
    }
  }

  /**
   * Get current active connection count
   */
  getConnectionCount(): number {
    return this.connectedClients.size;
  }
}
