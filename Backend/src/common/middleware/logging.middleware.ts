import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppLogger } from '../logger/app.logger';
import { CORRELATION_ID_HEADER } from './correlation-id.middleware';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: AppLogger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const correlationId = req.headers[CORRELATION_ID_HEADER] as string;

    res.on('finish', () => {
      this.logger.logRequest(
        correlationId,
        req.method,
        req.originalUrl,
        res.statusCode,
        Date.now() - start,
      );
    });

    next();
  }
}
