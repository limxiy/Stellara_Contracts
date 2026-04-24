import { Injectable, NestMiddleware, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class TimeoutMiddleware implements NestMiddleware {
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = this.configService.get<number>('HTTP_REQUEST_TIMEOUT_MS', 30000);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        throw new RequestTimeoutException(`Request timeout after ${this.timeoutMs}ms`);
      }
    }, this.timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  }
}