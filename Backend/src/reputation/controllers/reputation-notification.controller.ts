import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReputationNotificationService } from '../services/reputation-notification.service';
import { PrismaService } from '../../prisma.service';

@ApiTags('reputation-notifications')
@Controller('reputation/notifications')
@UseGuards(JwtAuthGuard)
export class ReputationNotificationController {
  constructor(
    private readonly reputationNotificationService: ReputationNotificationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get user notification settings' })
  @ApiResponse({ status: 200, description: 'Notification settings retrieved successfully' })
  async getNotificationSettings(@Request() req: any) {
    const userId = req.user.id;
    
    let settings = await this.prisma.notificationSetting.findUnique({
      where: { userId },
    });

    if (!settings) {
      // Create default settings
      settings = await this.prisma.notificationSetting.create({
        data: {
          userId,
          emailEnabled: true,
          pushEnabled: false,
          notifyContributions: true,
          notifyMilestones: true,
          notifyDeadlines: true,
          notifyReputationChanges: true,
          notifyLevelUps: true,
          notifyWeeklySummary: true,
          reputationChangeThreshold: 50,
        },
      });
    }

    return {
      emailEnabled: settings.emailEnabled,
      pushEnabled: settings.pushEnabled,
      notifyContributions: settings.notifyContributions,
      notifyMilestones: settings.notifyMilestones,
      notifyDeadlines: settings.notifyDeadlines,
      notifyReputationChanges: settings.notifyReputationChanges,
      notifyLevelUps: settings.notifyLevelUps,
      notifyWeeklySummary: settings.notifyWeeklySummary,
      reputationChangeThreshold: settings.reputationChangeThreshold,
    };
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update user notification settings' })
  @ApiResponse({ status: 200, description: 'Notification settings updated successfully' })
  async updateNotificationSettings(
    @Request() req: any,
    @Body() updateData: {
      emailEnabled?: boolean;
      pushEnabled?: boolean;
      notifyContributions?: boolean;
      notifyMilestones?: boolean;
      notifyDeadlines?: boolean;
      notifyReputationChanges?: boolean;
      notifyLevelUps?: boolean;
      notifyWeeklySummary?: boolean;
      reputationChangeThreshold?: number;
    },
  ) {
    const userId = req.user.id;

    const settings = await this.prisma.notificationSetting.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        emailEnabled: updateData.emailEnabled ?? true,
        pushEnabled: updateData.pushEnabled ?? false,
        notifyContributions: updateData.notifyContributions ?? true,
        notifyMilestones: updateData.notifyMilestones ?? true,
        notifyDeadlines: updateData.notifyDeadlines ?? true,
        notifyReputationChanges: updateData.notifyReputationChanges ?? true,
        notifyLevelUps: updateData.notifyLevelUps ?? true,
        notifyWeeklySummary: updateData.notifyWeeklySummary ?? true,
        reputationChangeThreshold: updateData.reputationChangeThreshold ?? 50,
      },
    });

    return {
      message: 'Notification settings updated successfully',
      settings: {
        emailEnabled: settings.emailEnabled,
        pushEnabled: settings.pushEnabled,
        notifyContributions: settings.notifyContributions,
        notifyMilestones: settings.notifyMilestones,
        notifyDeadlines: settings.notifyDeadlines,
        notifyReputationChanges: settings.notifyReputationChanges,
        notifyLevelUps: settings.notifyLevelUps,
        notifyWeeklySummary: settings.notifyWeeklySummary,
        reputationChangeThreshold: settings.reputationChangeThreshold,
      },
    };
  }

  @Get('tips')
  @ApiOperation({ summary: 'Get reputation improvement tips' })
  @ApiResponse({ status: 200, description: 'Improvement tips retrieved successfully' })
  async getImprovementTips(@Request() req: any) {
    const userId = req.user.id;
    
    const reputation = await this.prisma.reputationScore.findUnique({
      where: { subjectId: userId },
    });

    if (!reputation) {
      return {
        tips: [],
        message: 'No reputation data available',
      };
    }

    const tips = await this.reputationNotificationService.getImprovementTips(userId, reputation);

    return {
      tips,
      currentScore: Math.round(reputation.compositeScore),
      level: await this.prisma.user.findUnique({
        where: { id: userId },
        select: { reputationLevel: true },
      }).then(user => user?.reputationLevel || 'BRONZE'),
    };
  }

  @Get('weekly-summaries')
  @ApiOperation({ summary: 'Get weekly reputation summaries' })
  @ApiResponse({ status: 200, description: 'Weekly summaries retrieved successfully' })
  async getWeeklySummaries(@Request() req: any) {
    const userId = req.user.id;
    
    const summaries = await this.prisma.weeklyReputationSummary.findMany({
      where: { userId },
      orderBy: { weekStartDate: 'desc' },
      take: 12, // Last 12 weeks
    });

    return {
      summaries: summaries.map(summary => ({
        id: summary.id,
        weekStartDate: summary.weekStartDate,
        previousScore: summary.previousScore,
        currentScore: summary.currentScore,
        scoreChange: summary.scoreChange,
        level: summary.level,
        activitiesCount: summary.activitiesCount,
        topActivityType: summary.topActivityType,
        improvementTips: summary.improvementTips,
        emailSent: summary.emailSent,
      })),
    };
  }

  @Post('test-reputation-change')
  @ApiOperation({ summary: 'Test reputation change notification (for development)' })
  @ApiResponse({ status: 200, description: 'Test notification sent successfully' })
  async testReputationChange(
    @Request() req: any,
    @Body() testData: {
      previousScore: number;
      newScore: number;
      reason: string;
    },
  ) {
    const userId = req.user.id;

    await this.reputationNotificationService.notifyReputationChange(
      userId,
      testData.previousScore,
      testData.newScore,
      testData.reason,
    );

    return {
      message: 'Test reputation change notification sent',
      userId,
      previousScore: testData.previousScore,
      newScore: testData.newScore,
      scoreChange: testData.newScore - testData.previousScore,
    };
  }

  @Post('test-level-up')
  @ApiOperation({ summary: 'Test level up notification (for development)' })
  @ApiResponse({ status: 200, description: 'Test notification sent successfully' })
  async testLevelUp(
    @Request() req: any,
    @Body() testData: {
      previousLevel: string;
      newLevel: string;
      score: number;
    },
  ) {
    const userId = req.user.id;

    await this.reputationNotificationService.notifyLevelUp(
      userId,
      testData.previousLevel,
      testData.newLevel,
      testData.score,
    );

    return {
      message: 'Test level up notification sent',
      userId,
      previousLevel: testData.previousLevel,
      newLevel: testData.newLevel,
      score: testData.score,
    };
  }

  @Post('initialize-tips')
  @ApiOperation({ summary: 'Initialize default reputation tips (admin only)' })
  @ApiResponse({ status: 200, description: 'Default tips initialized successfully' })
  async initializeTips() {
    await this.reputationNotificationService.createDefaultReputationTips();

    return {
      message: 'Default reputation tips initialized successfully',
    };
  }
}
