import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get service welcome message' })
  @ApiResponse({ status: 200, description: 'Service welcome payload returned' })
  getHello(): string {
    return this.appService.getHello();
  }
}
