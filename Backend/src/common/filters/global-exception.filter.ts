import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { BaseHttpException } from '../exceptions/http.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly configService: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      request.headers['x-request-id'] ||
      request.headers['request-id'] ||
      (request as any).correlationId ||
      'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_SERVER_ERROR';
    let details: any = undefined;

    if (exception instanceof BaseHttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      code = res.error?.code || 'ERROR';
      message = exception.message;
      details = res.error?.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      message = typeof res === 'string' ? res : res.message || exception.message;
      code = this.getErrorCodeFromStatus(status);
      details = typeof res === 'object' ? res : undefined;
    } else if (exception instanceof Error) {
      const isProduction = this.configService.get('NODE_ENV') === 'production';
      message = isProduction ? 'Internal server error' : exception.message;
      if (!isProduction) {
        details = { stack: exception.stack };
      }
    }

    const errorResponse = {
      success: false,
      error: {
        code,
        message: Array.isArray(message) ? message[0] : message,
        details: details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        path: request.url,
      },
    };

    // Security headers
    this.addSecurityHeaders(response);

    // Logging
    this.logError(exception, request, status);

    response.status(status).json(errorResponse);
  }

  private addSecurityHeaders(response: Response): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-XSS-Protection', '1; mode=block');
  }

  private logError(exception: any, request: Request, status: number): void {
    const logData = {
      url: request.url,
      method: request.method,
      status,
      message: exception.message || 'Unknown error',
      stack: exception.stack,
    };

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} - ${status}`, exception.stack);
    } else {
      this.logger.warn(`${request.method} ${request.url} - ${status} - ${logData.message}`);
    }
  }

  private getErrorCodeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
