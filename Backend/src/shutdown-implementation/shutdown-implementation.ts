import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('ShutdownHandler');
  const app = await NestFactory.create(AppModule);

  // 1. MUST: Enable NestJS Lifecycle hooks (onModuleDestroy, onApplicationShutdown)
  // This allows services to close DB connections or cleanup files internally.
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application running on: ${port}`);

  // 2. Handle Shutdown Signals
  const handleShutdown = async (signal: string) => {
    logger.warn(`Received ${signal}. Starting graceful shutdown...`);

    // 3. Set a safety timeout (30s) to force exit if hanging
    const forceExitTimeout = setTimeout(() => {
      logger.error('Shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 30000);

    try {
      // 4. Close the app: stops accepting requests & triggers onApplicationShutdown
      await app.close();
      logger.log('Graceful shutdown complete.');
      clearTimeout(forceExitTimeout);
      process.exit(0);
    } catch (error) {
      logger.error(`Error during shutdown: ${error.message}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

bootstrap();