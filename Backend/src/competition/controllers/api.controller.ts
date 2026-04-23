import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CompetitionService } from '../services/competition.service';
import { CreateCompetitionDto } from '../dto/create-competition.dto';
import { JoinCompetitionDto } from '../dto/join-competition.dto';
import { RecordTradeDto } from '../dto/record-trade.dto';

@ApiTags('Competition API')
@Controller('api/competitions')
export class ApiController {
  constructor(private readonly competitionService: CompetitionService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List competitions' })
  @ApiResponse({ status: 200, description: 'Competitions returned' })
  async listCompetitions() {
    return this.competitionService.listCompetitions();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create competition' })
  @ApiResponse({ status: 201, description: 'Competition created' })
  async createCompetition(@Body() createCompetitionDto: CreateCompetitionDto) {
    return this.competitionService.createCompetition(createCompetitionDto);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get competition by id' })
  async getCompetition(@Param('id') id: string) {
    return this.competitionService.getCompetition(id);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join competition' })
  async joinCompetition(
    @Param('id') id: string,
    @Body() joinCompetitionDto: JoinCompetitionDto,
  ) {
    return this.competitionService.joinCompetition({
      ...joinCompetitionDto,
      competitionId: id,
    });
  }

  @Post(':id/trades')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record competition trade' })
  async recordTrade(
    @Param('id') id: string,
    @Body() recordTradeDto: RecordTradeDto,
  ) {
    return this.competitionService.recordTrade({
      ...recordTradeDto,
      competitionId: id,
    });
  }

  @Get(':id/leaderboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get competition leaderboard' })
  async getLeaderboard(@Param('id') id: string) {
    return this.competitionService.getLeaderboard(id);
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish competition and lock final ranking' })
  async finishCompetition(@Param('id') id: string) {
    return this.competitionService.finishCompetition(id);
  }
}
