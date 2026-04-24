import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      map((data) => {
        // If data already has the envelope format (e.g. from a legacy endpoint or another interceptor), return it as is
        if (data && typeof data === 'object' && 'success' in data && 'meta' in data) {
          return data;
        }

        const requestId =
          request.headers['x-request-id'] ||
          request.headers['request-id'] ||
          (request as any).correlationId ||
          `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        return {
          success: true,
          data: data === undefined ? null : data,
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
          },
        };
      }),
    );
  }
}
