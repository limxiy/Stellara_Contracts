import { Module } from '@nestjs/common';
import { CompetitionController } from './controllers/competition.controller';
import { CompetitionService } from './services/competition.service';
import { LeaderboardService } from './services/leaderboard.service';
import { AntiCheatService } from './services/anti-cheat.service';
import { PrizeDistributionService } from './services/prize-distribution.service';
import { LeaderboardGateway } from './gateways/leaderboard.gateway';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [CompetitionController],
  providers: [
    CompetitionService, 
    LeaderboardService, 
    AntiCheatService, 
    PrizeDistributionService,
    LeaderboardGateway,
    PrismaService
  ],
  exports: [CompetitionService, LeaderboardService, AntiCheatService, PrizeDistributionService],
})
export class CompetitionModule {}
