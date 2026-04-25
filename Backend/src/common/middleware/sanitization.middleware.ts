import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { deepSanitizeXss } from '../utils/xss.util';
import { sanitizeUnknown } from '../utils/sanitize.util';

@Injectable()
export class SanitizationMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.body && typeof req.body === 'object') {
      // First apply legacy sanitization
      let sanitized = sanitizeUnknown(req.body);
      // Then apply enhanced XSS protection
      sanitized = deepSanitizeXss(sanitized);
      req.body = sanitized;
    }
    next();
  }
}
