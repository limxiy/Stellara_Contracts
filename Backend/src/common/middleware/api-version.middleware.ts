import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';

const SUPPORTED_VERSIONS = ['v1', 'v2'];
const DEFAULT_SUNSET_DATE = 'Sat, 01 Jan 2027 00:00:00 GMT';
const SUCCESSOR_LINK = '</api/v2>; rel="successor-version"';

@Injectable()
export class ApiVersionMiddleware implements NestMiddleware {
  private defaultVersion: string;
  private sunsetDate: string;

  constructor(private readonly configService: ConfigService) {
    this.defaultVersion = this.configService.get<string>('DEFAULT_API_VERSION', 'v1');
    this.sunsetDate = this.configService.get<string>('API_VERSION_SUNSET', DEFAULT_SUNSET_DATE);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    const pathVersion = this.extractVersionFromPath(req.originalUrl || req.url);
    let apiVersion = pathVersion || this.extractVersionFromHeaders(req);

    if (!apiVersion) {
      apiVersion = this.defaultVersion;
    }

    if (!SUPPORTED_VERSIONS.includes(apiVersion)) {
      throw new BadRequestException(
        `Unsupported API version \"${apiVersion}\". Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
      );
    }

    if (!pathVersion) {
      const rewritten = (req.url || '').replace(/^\/api\/?/, `/api/${apiVersion}/`);
      req.url = rewritten;
      if (req.originalUrl) {
        req.originalUrl = req.originalUrl.replace(/^\/api\/?/, `/api/${apiVersion}/`);
      }
    }

    res.setHeader('X-API-Version', apiVersion);

    if (apiVersion === 'v1') {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', this.sunsetDate);
      res.setHeader('Link', SUCCESSOR_LINK);
    }

    next();
  }

  private extractVersionFromPath(url: string): string | undefined {
    const matches = url.match(/^\/api\/(v[0-9]+)(?:\/|$)/);
    return matches ? matches[1] : undefined;
  }

  private extractVersionFromHeaders(req: Request): string | undefined {
    const versionHeader =
      (req.headers['x-api-version'] as string) ||
      (req.headers['api-version'] as string);

    if (versionHeader) {
      return versionHeader.trim().toLowerCase();
    }

    const accept = req.headers.accept as string;
    if (!accept) {
      return undefined;
    }

    const vendorVersion = this.parseVendorAcceptHeader(accept);
    if (vendorVersion) {
      return vendorVersion;
    }

    const parameterMatch = accept.match(/version=(\d+)/i);
    if (parameterMatch) {
      return `v${parameterMatch[1]}`;
    }

    return undefined;
  }

  private parseVendorAcceptHeader(accept: string): string | undefined {
    const match = accept.match(/application\/vnd\.stellara\.v([0-9]+)\+json/i);
    if (match) {
      return `v${match[1]}`;
    }
    return undefined;
  }
}
