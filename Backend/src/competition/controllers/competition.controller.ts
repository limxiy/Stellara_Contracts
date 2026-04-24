import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CompetitionService } from '../services/competition.service';
import { LeaderboardService } from '../services/leaderboard.service';
import { CreateCompetitionDto } from '../dto/create-competition.dto';
import { JoinCompetitionDto } from '../dto/join-competition.dto';
import { RecordTradeDto } from '../dto/record-trade.dto';
import { CompetitionStatus, CompetitionType } from '../enums/competition-type.enum';

@ApiTags('Competitions')
@Controller('competitions')
export class CompetitionController {
  constructor(
    private readonly competitionService: CompetitionService,
    private readonly leaderboardService: LeaderboardService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a competition' })
  @ApiResponse({ status: 201, description: 'Competition created' })
  async createCompetition(@Body() createCompetitionDto: CreateCompetitionDto) {
    return this.competitionService.createCompetition(createCompetitionDto);
  }

  @Get()
  @ApiOperation({ summary: 'List competitions with optional filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type', required: false })
  async listCompetitions(
    @Query('status') status?: CompetitionStatus,
    @Query('type') type?: CompetitionType,
  ) {
    return this.competitionService.listCompetitions(status, type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get competition details' })
  async getCompetition(@Param('id') id: string) {
    return this.competitionService.getCompetition(id);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join a competition' })
  async joinCompetition(@Param('id') competitionId: string, @Body() joinCompetitionDto: JoinCompetitionDto) {
    return this.competitionService.joinCompetition({
      ...joinCompetitionDto,
      competitionId,
    });
  }

  @Post(':id/trades')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a participant trade' })
  async recordTrade(@Param('id') competitionId: string, @Body() recordTradeDto: RecordTradeDto) {
    return this.competitionService.recordTrade({
      ...recordTradeDto,
      competitionId,
    });
  }

  @Get(':id/leaderboard')
  @ApiOperation({ summary: 'Get leaderboard with optional user context' })
  async getLeaderboard(
    @Param('id') competitionId: string,
    @Query('limit') limit?: string,
    @Query('userId') userId?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.leaderboardService.getLeaderboardWithMetrics(competitionId, userId);
  }

  @Get(':id/leaderboard/realtime')
  @ApiOperation({ summary: 'Get real-time leaderboard snapshot' })
  async getRealTimeLeaderboard(
    @Param('id') competitionId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.leaderboardService.getRealTimeLeaderboard(competitionId, limitNum);
  }

  @Get(':id/leaderboard/stats')
  @ApiOperation({ summary: 'Get leaderboard aggregate stats' })
  async getLeaderboardStats(@Param('id') competitionId: string) {
    return this.leaderboardService.getLeaderboardStats(competitionId);
  }

  @Get(':id/leaderboard/top')
  @ApiOperation({ summary: 'Get top performers by metric' })
  async getTopPerformers(
    @Param('id') competitionId: string,
    @Query('metric') metric: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.leaderboardService.getTopPerformers(competitionId, metric, limitNum);
  }

  @Get(':id/anti-cheat')
  @ApiOperation({ summary: 'Get anti-cheat flags for competition' })
  async getAntiCheatFlags(
    @Param('id') competitionId: string,
    @Query('status') status?: string,
  ) {
    return this.competitionService.getAntiCheatFlags(competitionId, status);
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish an active competition' })
  async finishCompetition(@Param('id') competitionId: string) {
    return this.competitionService.finishCompetition(competitionId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get competitions for a user' })
  async getUserCompetitions(
    @Param('userId') userId: string,
    @Query('status') status?: CompetitionStatus,
  ) {
    return this.competitionService.getUserCompetitions(userId, status);
  }

  @Get('user/:userId/achievements')
  @ApiOperation({ summary: 'Get competition achievements for a user' })
  async getUserAchievements(@Param('userId') userId: string) {
    return this.competitionService.getUserAchievements(userId);
  }
}
