import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rateLimit';
export const RateLimit = (limit: number, ttlSeconds: number) =>
  Reflect.metadata(RATE_LIMIT_KEY, { limit, ttlSeconds });

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly store = new Map<string, RateLimitEntry>();

  // Default: 100 req / 60s per user+IP
  private readonly defaultLimit = 100;
  private readonly defaultTtl = 60_000;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<{ limit: number; ttlSeconds: number }>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const limit = meta?.limit ?? this.defaultLimit;
    const ttl = (meta?.ttlSeconds ?? 60) * 1000;

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const ip = req.ip ?? req.connection?.remoteAddress ?? 'unknown';
    const userId = req.user?.id ?? 'anon';
    const key = `${userId}:${ip}:${req.route?.path ?? req.path}`;

    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + ttl };
      this.store.set(key, entry);
    }

    entry.count++;
    const remaining = Math.max(0, limit - entry.count);
    const resetSec = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSec);

    if (entry.count > limit) {
      res.setHeader('Retry-After', resetSec);
      throw new HttpException(
        { message: 'Too Many Requests', retryAfter: resetSec },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
