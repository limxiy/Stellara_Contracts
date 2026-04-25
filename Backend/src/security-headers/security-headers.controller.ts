import { Controller, Get, Post, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { SecurityHeadersService, SecurityHeadersReport } from './security-headers.service';
import { SecurityHeadersMiddleware } from './security-headers.middleware';

@ApiTags('Security Headers')
@Controller('security')
export class SecurityHeadersController {
  constructor(
    private readonly securityHeadersService: SecurityHeadersService,
    private readonly securityHeadersMiddleware: SecurityHeadersMiddleware,
  ) {}

  @Get('headers-check')
  @ApiOperation({ summary: 'Check security headers on current response' })
  @ApiResponse({ status: 200, description: 'Security headers report' })
  async checkHeaders(@Res({ passthrough: true }) res: Response): Promise<SecurityHeadersReport> {
    // Ensure security headers are set first
    this.securityHeadersMiddleware.use(
      {} as never,
      res,
      () => { /* noop */ },
    );

    const headers: Record<string, string | string[]> = {};
    res.getHeaderNames().forEach((name) => {
      const value = res.getHeader(name);
      if (value !== undefined) {
        headers[name] = Array.isArray(value) ? value : String(value);
      }
    });

    return this.securityHeadersService.checkHeaders(headers);
  }

  @Get('expected-headers')
  @ApiOperation({ summary: 'Get expected security headers configuration' })
  @ApiResponse({ status: 200, description: 'Expected headers' })
  getExpectedHeaders(): Record<string, string> {
    return this.securityHeadersService.getExpectedHeaders();
  }

  @Post('csp-report')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Receive CSP violation reports' })
  @ApiResponse({ status: 204, description: 'Report received' })
  async receiveCspReport(@Res() res: Response): Promise<void> {
    // In a real implementation, parse and log the CSP report
    res.status(204).send();
  }
}
