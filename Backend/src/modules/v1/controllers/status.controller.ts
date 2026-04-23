import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('API Status (v1)')
@Controller('v1/status')
export class V1StatusController {
  @Get()
  @ApiOperation({ summary: 'API status for v1' })
  @ApiResponse({ status: 200, description: 'API version and sunset metadata' })
  getStatus() {
    return {
      version: 'v1',
      status: 'stable',
      message: 'Version 1 is supported with deprecation headers and a migration path to v2.',
      nextVersion: '/api/v2',
    };
  }
}
