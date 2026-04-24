import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as yaml from 'js-yaml';
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

  // OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Stellara Backend API')
    .setDescription('REST API documentation for Stellara backend services')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide JWT access token',
      },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    deepScanRoutes: true,
  });

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    jsonDocumentUrl: '/api/docs-json',
  });

  const httpServer = app.getHttpAdapter().getInstance();
  httpServer.get('/api/docs-yaml', (_req, res) => {
    res.type('application/x-yaml');
    res.send(yaml.dump(document));
  });

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
