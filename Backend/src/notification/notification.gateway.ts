import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private userSockets: Map<string, string[]> = new Map(); // userId -> socketIds[]

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      const sockets = this.userSockets.get(userId) || [];
      this.userSockets.set(userId, [...sockets, client.id]);
      this.logger.log(`Client connected: ${client.id} (User: ${userId})`);
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.includes(client.id)) {
        const remaining = sockets.filter((id) => id !== client.id);
        if (remaining.length > 0) {
          this.userSockets.set(userId, remaining);
        } else {
          this.userSockets.delete(userId);
        }
        break;
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendToUser(userId: string, event: string, payload: any): boolean {
    const sockets = this.userSockets.get(userId);
    if (sockets && sockets.length > 0) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, payload);
      });
      return true;
    }
    return false;
  }
}
