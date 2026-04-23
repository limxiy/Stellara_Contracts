import { Controller, Get, Post, Param, NotFoundException } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReputationService } from './reputation.service';
import { PrismaService } from '../prisma.service';

@ApiTags('Reputation')
@Controller('users')
export class ReputationController {
  constructor(
    private readonly reputationService: ReputationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id/reputation')
  @ApiOperation({ summary: 'Get current reputation for user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Reputation payload returned' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getReputation(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const reputation = await this.reputationService.getReputation(id);
    return {
      userId: id,
      reputation,
    };
  }

  @Get(':id/reputation/history')
  @ApiOperation({ summary: 'Get historical reputation entries for user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'Reputation history returned' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getReputationHistory(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const history = await this.reputationService.getReputationHistory(id);
    return {
      userId: id,
      history,
    };
  }

  @Post(':id/reputation/recalculate')
  @ApiOperation({ summary: 'Recalculate user reputation score' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 201, description: 'Reputation recalculated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async recalculateReputation(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const breakdown = await this.reputationService.updateReputationScore(id);
    return {
      userId: id,
      message: 'Reputation recalculated successfully',
      breakdown,
    };
  }
}
