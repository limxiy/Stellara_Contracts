import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { LeaderboardService } from '../services/leaderboard.service';
import { CompetitionService } from '../services/competition.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  namespace: '/competitions',
})
export class LeaderboardGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('LeaderboardGateway');

  constructor(
    private readonly leaderboardService: LeaderboardService,
    private readonly competitionService: CompetitionService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribeLeaderboard')
  async handleSubscribeLeaderboard(
    @MessageBody() data: { competitionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { competitionId } = data;
    
    // Join competition-specific room
    client.join(`competition-${competitionId}`);
    
    // Send initial leaderboard data
    const leaderboard = await this.leaderboardService.getRealTimeLeaderboard(
      competitionId,
      50,
    );
    
    client.emit('leaderboardUpdate', {
      competitionId,
      leaderboard,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('unsubscribeLeaderboard')
  handleUnsubscribeLeaderboard(
    @MessageBody() data: { competitionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { competitionId } = data;
    client.leave(`competition-${competitionId}`);
  }

  @SubscribeMessage('subscribeUserTrades')
  async handleSubscribeUserTrades(
    @MessageBody() data: { competitionId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { competitionId, userId } = data;
    
    // Join user-specific room
    client.join(`user-${userId}-competition-${competitionId}`);
  }

  // Methods to broadcast updates
  async broadcastLeaderboardUpdate(competitionId: string) {
    const leaderboard = await this.leaderboardService.getRealTimeLeaderboard(
      competitionId,
      50,
    );
    
    this.server.to(`competition-${competitionId}`).emit('leaderboardUpdate', {
      competitionId,
      leaderboard,
      timestamp: new Date(),
    });
  }

  async broadcastTradeUpdate(
    competitionId: string,
    userId: string,
    tradeData: any,
  ) {
    // Broadcast to competition room
    this.server.to(`competition-${competitionId}`).emit('newTrade', {
      competitionId,
      trade: tradeData,
      timestamp: new Date(),
    });

    // Broadcast to user-specific room
    this.server
      .to(`user-${userId}-competition-${competitionId}`)
      .emit('userTradeUpdate', {
        competitionId,
        userId,
        trade: tradeData,
        timestamp: new Date(),
      });
  }

  async broadcastCompetitionUpdate(competitionId: string, updateData: any) {
    this.server.to(`competition-${competitionId}`).emit('competitionUpdate', {
      competitionId,
      ...updateData,
      timestamp: new Date(),
    });
  }

  async broadcastAntiCheatAlert(
    competitionId: string,
    alertData: any,
  ) {
    this.server.to(`competition-${competitionId}`).emit('antiCheatAlert', {
      competitionId,
      alert: alertData,
      timestamp: new Date(),
    });
  }

  async broadcastCompetitionFinished(competitionId: string, results: any) {
    this.server.to(`competition-${competitionId}`).emit('competitionFinished', {
      competitionId,
      results,
      timestamp: new Date(),
    });
  }

  async broadcastAchievementEarned(
    competitionId: string,
    userId: string,
    achievement: any,
  ) {
    this.server
      .to(`user-${userId}-competition-${competitionId}`)
      .emit('achievementEarned', {
        competitionId,
        userId,
        achievement,
        timestamp: new Date(),
      });

    // Also broadcast to competition room for public achievements
    if (achievement.type === 'FIRST_PLACE' || achievement.type === 'TOP_THREE') {
      this.server.to(`competition-${competitionId}`).emit('publicAchievement', {
        competitionId,
        userId,
        achievement,
        timestamp: new Date(),
      });
    }
  }
}
