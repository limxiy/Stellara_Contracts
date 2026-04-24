import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

// Global mock for Stellar SDK
jest.mock('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: jest.fn().mockResolvedValue({ events: [], cursor: undefined }),
    })),
  },
}));

export let app: INestApplication;
export let prisma: PrismaService;

export const setupTestApp = async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  await app.init();

  prisma = app.get<PrismaService>(PrismaService);
  
  // Set globals for convenience in tests
  (global as any).app = app;
  (global as any).prisma = prisma;
  
  // Clean up database before tests
  await cleanDatabase();

  return { app, prisma };
};

export const cleanDatabase = async () => {
  if (prisma) {
    // Delete in reverse order of dependencies
    await prisma.indexerLog.deleteMany();
    await prisma.processedEvent.deleteMany();
    await prisma.contribution.deleteMany();
    await prisma.milestone.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
    await prisma.ledgerCursor.deleteMany();
  }
};

export const teardownTestApp = async () => {
  if (app) {
    await app.close();
  }
};
