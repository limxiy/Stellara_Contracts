import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

export interface SecurityHeadersConfig {
  contentSecurityPolicy: string;
  strictTransportSecurity: string;
  xFrameOptions: string;
  xContentTypeOptions: string;
  xXssProtection: string;
  referrerPolicy: string;
  permissionsPolicy: string;
  crossOriginEmbedderPolicy: string;
  crossOriginOpenerPolicy: string;
  crossOriginResourcePolicy: string;
}

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityHeadersMiddleware.name);
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
  }

  use(_req: Request, res: Response, next: NextFunction): void {
    const headers = this.buildHeaders();

    for (const [key, value] of Object.entries(headers)) {
      if (value) {
        res.setHeader(key, value);
      }
    }

    next();
  }

  private buildHeaders(): Record<string, string> {
    const nonce = this.generateNonce();

    return {
      // Content Security Policy - strict default
      'Content-Security-Policy': this.buildCsp(nonce),

      // HTTP Strict Transport Security
      'Strict-Transport-Security': this.isProduction
        ? 'max-age=31536000; includeSubDomains; preload'
        : 'max-age=0',

      // Prevent clickjacking
      'X-Frame-Options': 'DENY',

      // Prevent MIME type sniffing
      'X-Content-Type-Options': 'nosniff',

      // Legacy XSS protection for older browsers
      'X-XSS-Protection': '1; mode=block',

      // Control referrer information
      'Referrer-Policy': 'strict-origin-when-cross-origin',

      // Feature policy / permissions policy
      'Permissions-Policy': this.buildPermissionsPolicy(),

      // Cross-origin isolation policies
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
  }

  private buildCsp(nonce: string): string {
    const directives: Record<string, string[]> = {
      'default-src': ["'self'"],
      'script-src': ["'self'", `'nonce-${nonce}'`],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'media-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'base-uri': ["'self'"],
      'upgrade-insecure-requests': [],
    };

    // In non-production, allow eval for debugging
    if (!this.isProduction) {
      directives['script-src'].push("'unsafe-eval'");
      directives['connect-src'].push('ws:', 'wss:', 'http://localhost:*');
    }

    return Object.entries(directives)
      .map(([key, values]) => (values.length > 0 ? `${key} ${values.join(' ')}` : key))
      .join('; ');
  }

  private buildPermissionsPolicy(): string {
    const policies = [
      'accelerometer=()',
      'camera=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
      'vr=()',
      'clipboard-read=()',
      'clipboard-write=(self)',
      'display-capture=()',
    ];
    return policies.join(', ');
  }

  private generateNonce(): string {
    return Buffer.from(Math.random().toString()).toString('base64').slice(0, 16);
  }
}
