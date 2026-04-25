import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import { SecurityEventType } from './enums/security-event-type.enum';

/**
 * Interceptor that automatically logs security-relevant HTTP requests.
 * Attach to controllers or routes to audit access.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id ?? request.user?.sub;
    const ipAddress = request.ip ?? request.headers['x-forwarded-for'];
    const userAgent = request.headers['user-agent'];
    const method = request.method;
    const path = request.path ?? request.url;

    // Log data access for destructive or sensitive methods
    if (['DELETE', 'PATCH', 'PUT'].includes(method)) {
      this.auditLogService.log({
        eventType: SecurityEventType.DATA_MODIFIED,
        userId,
        description: `${method} ${path}`,
        ipAddress,
        userAgent,
        metadata: { method, path, params: request.params, body: this.sanitizeBody(request.body) },
      });
    }

    if (method === 'DELETE') {
      this.auditLogService.log({
        eventType: SecurityEventType.DATA_DELETED,
        userId,
        targetId: request.params?.id,
        description: `DELETE ${path}`,
        ipAddress,
        userAgent,
        metadata: { path, params: request.params },
      });
    }

    return next.handle();
  }

  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const sanitized = { ...body as Record<string, unknown> };
    const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'privateKey', 'mfaSecret'];
    for (const field of sensitiveFields) {
      if (field in sanitized) sanitized[field] = '***REDACTED***';
    }
    return sanitized;
  }
}
