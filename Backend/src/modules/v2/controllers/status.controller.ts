import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('API Status (v2)')
@Controller('v2/status')
export class V2StatusController {
  @Get()
  @ApiOperation({ summary: 'API status for v2' })
  @ApiResponse({ status: 200, description: 'API version and compatibility metadata' })
  getStatus() {
    return {
      version: 'v2',
      status: 'experimental',
      message: 'Version 2 is available for gradual rollout and backwards-compatible testing.',
      migration: {
        recommended: '/api/v2/users',
        compareWith: '/api/v1/users',
      },
    };
  }
}
