import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { EsopService } from './esop.service';
import { CreateGrantDto } from './dto/create-grant.dto';
import { ExerciseGrantDto } from './dto/exercise-grant.dto';

@Controller('esop')
export class EsopController {
  constructor(private readonly esopService: EsopService) {}

  @Post('grants')
  async createGrant(@Body() data: CreateGrantDto) {
    return this.esopService.createGrant(data);
  }

  @Get('grants/:userId')
  async getGrants(@Param('userId') userId: string) {
    return this.esopService.getGrants(userId);
  }

  @Post('grants/:grantId/exercise')
  async exerciseGrant(
    @Param('grantId') grantId: string, 
    @Body() data: ExerciseGrantDto,
    @Body('userId') userId: string // Assuming userId is passed for now, ideally from JWT
  ) {
    return this.esopService.exerciseGrant(grantId, data, userId);
  }

  @Post('organization/:orgId/valuation')
  async updateValuation(
    @Param('orgId') orgId: string,
    @Body() data: { valuation: number, effectiveDate: string }
  ) {
    return this.esopService.update409AValuation(orgId, data.valuation, new Date(data.effectiveDate));
  }

  @Post('grants/:grantId/tokenize')
  async tokenizeOption(@Param('grantId') grantId: string) {
    return this.esopService.mintOptionNFT(grantId);
  }

  @Get('organization/:orgId/cap-table')
  async getCapTable(@Param('orgId') orgId: string) {
    return this.esopService.getCapTable(orgId);
  }
}
