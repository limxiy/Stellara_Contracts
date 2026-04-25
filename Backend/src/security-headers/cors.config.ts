import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';

/**
 * Build hardened CORS configuration based on environment.
 */
export function buildCorsConfig(configService: ConfigService): CorsOptions {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const allowedOrigins = configService.get<string>('CORS_ALLOWED_ORIGINS');

  const origins: string[] | boolean = isProduction
    ? allowedOrigins
      ? allowedOrigins.split(',').map((o) => o.trim())
      : []
    : true; // Allow all in dev for convenience

  return {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Correlation-Id',
      'X-Api-Version',
      'Accept',
      'Origin',
    ],
    exposedHeaders: [
      'X-Correlation-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };
}
