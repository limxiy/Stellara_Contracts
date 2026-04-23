import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';
import { AppLogger } from './common/logger/app.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(AppLogger);
  app.useLogger(logger);
  const configService = app.get(ConfigService);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API prefix and version normalization
  const rawPrefix = configService.get<string>('API_PREFIX', 'api');
  const apiPrefix = rawPrefix.replace(/\/?v[0-9]+$/, '').replace(/^\/|\/$/g, '') || 'api';
  app.setGlobalPrefix(apiPrefix);

  // CORS
  app.enableCors();

  // Database connection validation
  const prismaService = app.get(PrismaService);
  try {
    await prismaService.$connect();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Failed to connect to database:', error.message);
    process.exit(1);
  }

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}/${apiPrefix}`);
}

bootstrap();
