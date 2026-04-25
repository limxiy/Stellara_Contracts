import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface HeaderCheckResult {
  name: string;
  expected: string;
  present: boolean;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export interface SecurityHeadersReport {
  overall: 'pass' | 'fail' | 'warn';
  headers: HeaderCheckResult[];
  recommendations: string[];
}

@Injectable()
export class SecurityHeadersService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Check a response headers object against expected security headers.
   */
  checkHeaders(responseHeaders: Record<string, string | string[]>): SecurityHeadersReport {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const results: HeaderCheckResult[] = [];
    const recommendations: string[] = [];

    // Content-Security-Policy
    const csp = this.getHeaderValue(responseHeaders, 'content-security-policy');
    results.push({
      name: 'Content-Security-Policy',
      expected: 'Present with strict directives',
      present: !!csp,
      status: csp ? 'pass' : 'fail',
      message: csp ? 'CSP header is set' : 'CSP header is missing - critical for XSS prevention',
    });
    if (!csp) {
      recommendations.push('Add Content-Security-Policy header to prevent XSS and data injection');
    }

    // Strict-Transport-Security
    const hsts = this.getHeaderValue(responseHeaders, 'strict-transport-security');
    const hstsOk = hsts && hsts.includes('max-age=');
    results.push({
      name: 'Strict-Transport-Security',
      expected: isProduction ? 'max-age=31536000' : 'max-age=0',
      present: !!hsts,
      status: hstsOk ? 'pass' : isProduction ? 'fail' : 'warn',
      message: hsts
        ? `HSTS set: ${hsts}`
        : 'HSTS header missing - connections may be downgraded to HTTP',
    });
    if (isProduction && !hstsOk) {
      recommendations.push('Enable HSTS in production with max-age=31536000; includeSubDomains; preload');
    }

    // X-Frame-Options
    const xFrame = this.getHeaderValue(responseHeaders, 'x-frame-options');
    results.push({
      name: 'X-Frame-Options',
      expected: 'DENY or SAMEORIGIN',
      present: !!xFrame,
      status: xFrame && (xFrame === 'DENY' || xFrame === 'SAMEORIGIN') ? 'pass' : 'fail',
      message: xFrame
        ? `X-Frame-Options set to ${xFrame}`
        : 'X-Frame-Options missing - site may be vulnerable to clickjacking',
    });
    if (!xFrame) {
      recommendations.push('Add X-Frame-Options: DENY to prevent clickjacking');
    }

    // X-Content-Type-Options
    const xContentType = this.getHeaderValue(responseHeaders, 'x-content-type-options');
    results.push({
      name: 'X-Content-Type-Options',
      expected: 'nosniff',
      present: !!xContentType,
      status: xContentType === 'nosniff' ? 'pass' : 'fail',
      message: xContentType === 'nosniff'
        ? 'MIME sniffing is disabled'
        : 'MIME sniffing protection missing',
    });
    if (xContentType !== 'nosniff') {
      recommendations.push('Add X-Content-Type-Options: nosniff to prevent MIME confusion attacks');
    }

    // X-XSS-Protection
    const xss = this.getHeaderValue(responseHeaders, 'x-xss-protection');
    results.push({
      name: 'X-XSS-Protection',
      expected: '1; mode=block',
      present: !!xss,
      status: xss ? 'pass' : 'warn',
      message: xss
        ? `Legacy XSS protection enabled: ${xss}`
        : 'Legacy XSS protection header missing (low impact if CSP is present)',
    });

    // Referrer-Policy
    const referrer = this.getHeaderValue(responseHeaders, 'referrer-policy');
    results.push({
      name: 'Referrer-Policy',
      expected: 'strict-origin-when-cross-origin or stricter',
      present: !!referrer,
      status: referrer ? 'pass' : 'warn',
      message: referrer
        ? `Referrer policy set: ${referrer}`
        : 'Referrer-Policy missing - referrer data may leak',
    });
    if (!referrer) {
      recommendations.push('Add Referrer-Policy: strict-origin-when-cross-origin');
    }

    // Permissions-Policy
    const permissions = this.getHeaderValue(responseHeaders, 'permissions-policy');
    results.push({
      name: 'Permissions-Policy',
      expected: 'Present with restricted features',
      present: !!permissions,
      status: permissions ? 'pass' : 'warn',
      message: permissions
        ? 'Feature permissions are restricted'
        : 'Permissions-Policy missing - browser features may be abused',
    });
    if (!permissions) {
      recommendations.push('Add Permissions-Policy to restrict browser features');
    }

    // Cross-Origin policies
    const coep = this.getHeaderValue(responseHeaders, 'cross-origin-embedder-policy');
    results.push({
      name: 'Cross-Origin-Embedder-Policy',
      expected: 'require-corp',
      present: !!coep,
      status: coep === 'require-corp' ? 'pass' : 'warn',
      message: coep === 'require-corp'
        ? 'Cross-origin embedding restricted'
        : 'COEP missing - cross-origin isolation not enforced',
    });

    const coop = this.getHeaderValue(responseHeaders, 'cross-origin-opener-policy');
    results.push({
      name: 'Cross-Origin-Opener-Policy',
      expected: 'same-origin',
      present: !!coop,
      status: coop === 'same-origin' ? 'pass' : 'warn',
      message: coop === 'same-origin'
        ? 'Cross-origin opener isolated'
        : 'COOP missing - cross-origin window manipulation possible',
    });

    const corp = this.getHeaderValue(responseHeaders, 'cross-origin-resource-policy');
    results.push({
      name: 'Cross-Origin-Resource-Policy',
      expected: 'same-origin',
      present: !!corp,
      status: corp === 'same-origin' ? 'pass' : 'warn',
      message: corp === 'same-origin'
        ? 'Cross-origin resource sharing restricted'
        : 'CORP missing - resources may be loaded by other origins',
    });

    // Determine overall status
    const failures = results.filter((r) => r.status === 'fail').length;
    const warns = results.filter((r) => r.status === 'warn').length;
    const overall: 'pass' | 'fail' | 'warn' =
      failures > 0 ? 'fail' : warns > 0 ? 'warn' : 'pass';

    return { overall, headers: results, recommendations };
  }

  /**
   * Get the expected security headers configuration.
   */
  getExpectedHeaders(): Record<string, string> {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    return {
      'Content-Security-Policy': "default-src 'self'",
      'Strict-Transport-Security': isProduction
        ? 'max-age=31536000; includeSubDomains; preload'
        : 'max-age=0',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=()',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin',
    };
  }

  private getHeaderValue(
    headers: Record<string, string | string[]>,
    name: string,
  ): string | undefined {
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    if (!key) return undefined;
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
}
