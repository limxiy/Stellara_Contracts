import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from './notification.controller';
import { PrismaService } from '../prisma.service';
import { EmailRetryTask } from './tasks/email-retry.task';

describe('NotificationController', () => {
  let controller: NotificationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            notificationSetting: {
              upsert: jest.fn(),
            },
            user: {
              update: jest.fn(),
            },
          },
        },
        {
          provide: EmailRetryTask,
          useValue: {
            getRetryDashboard: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
