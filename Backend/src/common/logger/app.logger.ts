import { Injectable, LoggerService } from '@nestjs/common';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'verbose';

@Injectable()
export class AppLogger implements LoggerService {
  private write(level: LogLevel, message: string, context?: string, meta?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      ...meta,
    };
    if (level === 'error') {
      process.stderr.write(JSON.stringify(entry) + '\n');
    } else {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
  }

  log(message: string, context?: string): void {
    this.write('info', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    this.write('error', message, context, trace ? { trace } : undefined);
  }

  warn(message: string, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.write('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.write('verbose', message, context);
  }

  logRequest(
    correlationId: string,
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): void {
    this.write('info', 'HTTP Request', 'HTTP', {
      [CORRELATION_ID_HEADER]: correlationId,
      method,
      path,
      statusCode,
      durationMs,
    });
  }
}
