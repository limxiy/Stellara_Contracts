import { Body, Controller, Get, MessageEvent, Param, Post, Put, Query, Sse } from '@nestjs/common';
import {
    ApiBody,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { Observable, map } from 'rxjs';
import { PrismaService } from '../prisma.service';
import { PaginationDto, paginate } from '../common/dto/pagination.dto';
import { EmailRetryTask } from './tasks/email-retry.task';
import { NotificationService } from './services/notification.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import { NotificationsStreamService } from './streams/notifications-stream.service';

@ApiTags('Notifications')
@Controller('notifications')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class NotificationController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly emailRetryTask: EmailRetryTask,
    ) { }

    @Get('email-retry/dashboard')
    async getEmailRetryDashboard() {
        return this.emailRetryTask.getRetryDashboard();
    }
        constructor(
            private readonly prisma: PrismaService,
            private readonly notificationService: NotificationService,
            private readonly notificationsStream: NotificationsStreamService,
        ) { }

    @Get(':userId')
        @ApiOperation({ summary: 'List notifications for a user' })
        @ApiResponse({ status: 200, description: 'Paginated notifications returned' })
    async listNotifications(
        @Param('userId') userId: string,
        @Query() query: PaginationDto,
    ) {
        const { page, limit } = query;
        const skip = (page - 1) * limit;
        const [notifications, total] = await this.prisma.$transaction([
            this.prisma.notification.findMany({
                where: { userId },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.notification.count({ where: { userId } }),
        ]);
        return paginate(notifications, total, page, limit);
    }

    @Get('settings/:userId')
    @ApiOperation({ summary: 'Get or initialize notification settings' })
    @ApiResponse({ status: 200, description: 'Notification settings returned' })
    async getSettings(@Param('userId') userId: string) {
        return this.prisma.notificationSetting.upsert({
            where: { userId },
            update: {},
            create: { userId },
        });
    }

    @Put('settings/:userId')
    @ApiOperation({ summary: 'Update notification settings' })
    @ApiBody({ type: UpdateSettingsDto })
    @ApiResponse({ status: 200, description: 'Settings updated' })
    async updateSettings(
        @Param('userId') userId: string,
        @Body() settings: UpdateSettingsDto,
    ) {
        return this.prisma.notificationSetting.upsert({
            where: { userId },
            update: settings,
            create: {
                userId,
                ...settings,
            },
        });
    }

    @Post('subscribe/:userId')
        @ApiOperation({ summary: 'Save push subscription for user' })
        @ApiBody({ type: PushSubscriptionDto })
        @ApiResponse({ status: 201, description: 'Push subscription saved' })
    async subscribeToPush(
        @Param('userId') userId: string,
                @Body() subscription: PushSubscriptionDto,
    ) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { pushSubscription: subscription as unknown as Prisma.InputJsonValue },
        });
        return { success: true };
    }

        @Sse('stream/:userId')
        @ApiOperation({ summary: 'SSE fallback stream for notification events' })
        @ApiResponse({ status: 200, description: 'SSE stream established' })
        streamNotifications(@Param('userId') userId: string): Observable<MessageEvent> {
            return this.notificationsStream.subscribe(userId).pipe(
                map((event) => ({
                    type: event.event,
                    data: event.payload,
                })),
            );
        }

        @Get('admin/failed')
        @ApiOperation({ summary: 'List failed notification deliveries' })
        @ApiQuery({ name: 'limit', required: false, example: 100 })
        @ApiResponse({ status: 200, description: 'Failed delivery outbox rows returned' })
        async getFailedDeliveries(@Query('limit') limit?: string) {
            const parsedLimit = limit ? parseInt(limit, 10) : 100;
            return this.notificationService.getFailedDeliveries(parsedLimit);
        }

        @Post('admin/retry')
        @ApiOperation({ summary: 'Trigger immediate notification outbox retry' })
        @ApiQuery({ name: 'limit', required: false, example: 50 })
        @ApiResponse({ status: 201, description: 'Retry batch executed' })
        async retryFailedDeliveries(@Query('limit') limit?: string) {
            const parsedLimit = limit ? parseInt(limit, 10) : 50;
            return this.notificationService.retryOutboxBatch(parsedLimit);
        }
}
