import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WsJwtGuard } from '../../websocket/ws-jwt.guard';
import { ConnectionStateService } from '../../websocket/connection-state.service';
import { OrderBookSnapshot, OrderBookUpdate, Trade } from '../types/order-book.types';

/**
 * WebSocket gateway for real-time order book updates
 * Provides sub-millisecond broadcast latency (<1ms)
 */
@WebSocketGateway({
  namespace: '/orderbook',
  cors: { origin: '*', credentials: true },
  pingInterval: 10000,
  pingTimeout: 5000,
})
export class OrderBookGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrderBookGateway.name);
  
  // Track subscriptions per client
  private clientSubscriptions: Map<string, Set<string>> = new Map();

  constructor(
    private readonly connectionState: ConnectionStateService,
    private eventEmitter: EventEmitter2,
  ) {
    this.setupEventListeners();
  }

  async handleConnection(client: Socket) {
    try {
      const userId = client.handshake.query?.userId as string;
      if (userId) {
        await this.connectionState.register(userId, client.id, 'orderbook');
      }
      
      this.clientSubscriptions.set(client.id, new Set());
      this.logger.debug(`Client ${client.id} connected to orderbook namespace`);
    } catch (error) {
      this.logger.error(`Connection error for ${client.id}:`, error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    await this.connectionState.unregister(client.id);
    this.clientSubscriptions.delete(client.id);
    this.logger.debug(`Client ${client.id} disconnected from orderbook namespace`);
  }

  /**
   * Subscribe to order book updates for a symbol
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('subscribe:orderbook')
  async subscribeOrderBook(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string; depth?: number },
  ) {
    if (!data?.symbol) {
      throw new WsException('symbol is required');
    }

    const room = `orderbook:${data.symbol.toUpperCase()}`;
    await client.join(room);
    this.connectionState.addRoom(client.id, room);
    
    // Track subscription
    const subs = this.clientSubscriptions.get(client.id)!;
    subs.add(data.symbol.toUpperCase());

    // Send current snapshot immediately
    const depth = data.depth || 25;
    const snapshot = await this.getCurrentSnapshot(data.symbol, depth);
    
    if (snapshot) {
      client.emit('orderbook:snapshot', snapshot);
    }

    this.logger.log(`Socket ${client.id} subscribed to ${room}`);
    return { event: 'subscribed', room, depth };
  }

  /**
   * Unsubscribe from order book updates
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('unsubscribe:orderbook')
  async unsubscribeOrderBook(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string },
  ) {
    if (!data?.symbol) {
      throw new WsException('symbol is required');
    }

    const room = `orderbook:${data.symbol.toUpperCase()}`;
    await client.leave(room);
    this.connectionState.removeRoom(client.id, room);
    
    // Remove from tracking
    const subs = this.clientSubscriptions.get(client.id)!;
    subs.delete(data.symbol.toUpperCase());

    this.logger.log(`Socket ${client.id} unsubscribed from ${room}`);
    return { event: 'unsubscribed', room };
  }

  /**
   * Subscribe to trade executions for a symbol
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('subscribe:trades')
  async subscribeTrades(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string },
  ) {
    if (!data?.symbol) {
      throw new WsException('symbol is required');
    }

    const room = `trades:${data.symbol.toUpperCase()}`;
    await client.join(room);
    this.connectionState.addRoom(client.id, room);

    this.logger.log(`Socket ${client.id} subscribed to trades ${room}`);
    return { event: 'subscribed', room };
  }

  /**
   * Unsubscribe from trade updates
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('unsubscribe:trades')
  async unsubscribeTrades(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string },
  ) {
    if (!data?.symbol) {
      throw new WsException('symbol is required');
    }

    const room = `trades:${data.symbol.toUpperCase()}`;
    await client.leave(room);
    this.connectionState.removeRoom(client.id, room);

    this.logger.log(`Socket ${client.id} unsubscribed from trades ${room}`);
    return { event: 'unsubscribed', room };
  }

  /**
   * Request specific depth level
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('request:depth')
  async requestDepth(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbol: string; depth: number },
  ) {
    if (!data?.symbol || !data?.depth) {
      throw new WsException('symbol and depth are required');
    }

    const validDepths = [10, 25, 50, 100];
    if (!validDepths.includes(data.depth)) {
      throw new WsException(`Depth must be one of: ${validDepths.join(', ')}`);
    }

    const snapshot = await this.getCurrentSnapshot(data.symbol, data.depth);
    
    if (snapshot) {
      client.emit('orderbook:snapshot', snapshot);
      return { event: 'snapshot_sent', depth: data.depth };
    }
    
    throw new WsException('Failed to retrieve snapshot');
  }

  /**
   * Broadcast order book update to all subscribers
   * Target: <1ms latency
   */
  broadcastUpdate(symbol: string, update: OrderBookUpdate): void {
    const startTime = performance.now();
    
    const room = `orderbook:${symbol.toUpperCase()}`;
    this.server.to(room).emit('orderbook:update', update);
    
    const latency = performance.now() - startTime;
    
    if (latency > 1) {
      this.logger.warn(`Broadcast latency ${latency.toFixed(2)}ms exceeds 1ms target`);
    }
  }

  /**
   * Broadcast trade execution
   */
  broadcastTrade(symbol: string, trade: Trade): void {
    const room = `trades:${symbol.toUpperCase()}`;
    this.server.to(room).emit('trade:execution', trade);
    
    // Also broadcast to orderbook room
    const orderBookRoom = `orderbook:${symbol.toUpperCase()}`;
    this.server.to(orderBookRoom).emit('trade:execution', trade);
  }

  /**
   * Broadcast snapshot to specific room
   */
  broadcastSnapshot(symbol: string, snapshot: OrderBookSnapshot): void {
    const room = `orderbook:${symbol.toUpperCase()}`;
    this.server.to(room).emit('orderbook:snapshot', snapshot);
  }

  /**
   * Send order status update to user
   */
  notifyUser(userId: string, data: any): void {
    const room = `user:${userId}`;
    this.server.to(room).emit('order:user_update', data);
  }

  /**
   * Get current order book snapshot from manager
   */
  private async getCurrentSnapshot(symbol: string, depth: number): Promise<OrderBookSnapshot | null> {
    // This would typically call the OrderBookManagerService
    // For now, return a placeholder - will be integrated via module
    return null;
  }

  // Private helper methods

  private setupEventListeners() {
    // Listen for order book updates from manager service
    this.eventEmitter.on('websocket.orderbook.update', (update: OrderBookUpdate) => {
      this.broadcastUpdate(update.symbol, update);
    });

    // Listen for trade executions
    this.eventEmitter.on('websocket.trade.update', (trade: Trade) => {
      this.broadcastTrade(trade.symbol, trade);
    });
  }

  /**
   * Get subscriber count for a symbol
   */
  getSubscriberCount(symbol: string): number {
    const room = `orderbook:${symbol.toUpperCase()}`;
    const socketRoom = this.server.sockets.adapter.rooms.get(room);
    return socketRoom ? socketRoom.size : 0;
  }

  /**
   * Get all active subscriptions
   */
  getAllSubscriptions(): Map<string, number> {
    const subscriptions = new Map<string, number>();
    
    for (const [roomId, room] of this.server.sockets.adapter.rooms) {
      if (roomId.startsWith('orderbook:')) {
        const symbol = roomId.replace('orderbook:', '');
        subscriptions.set(symbol, room.size);
      }
    }
    
    return subscriptions;
  }

  /**
   * Force disconnect misbehaving clients
   */
  disconnectClient(clientId: string, reason?: string): void {
    const client = this.server.sockets.sockets.get(clientId);
    if (client) {
      client.disconnect(true);
      this.logger.warn(`Disconnected client ${clientId}: ${reason}`);
    }
  }

  /**
   * Rate limit check (to be enhanced with Redis)
   */
  private checkRateLimit(clientId: string): boolean {
    // TODO: Implement Redis-based rate limiting
    // For now, always allow
    return true;
  }
}
