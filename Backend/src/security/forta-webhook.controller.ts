import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { FlashLoanService } from './flash-loan.service';
import { FortaAlertDto } from './dto/forta-alert.dto';

@Controller('security')
export class SecurityController {
  constructor(private readonly flashLoanService: FlashLoanService) {}

  @Post('forta-webhook')
  async handleFortaAlert(@Body() alert: FortaAlertDto) {
    return this.flashLoanService.processFortaAlert(alert);
  }

  @Get('attacks')
  async getHistoricalAttacks() {
    return this.flashLoanService.getHistoricalAttacks();
  }

  @Get('attacks/:id')
  async getDetection(@Param('id') id: string) {
    return this.flashLoanService.getDetectionForensics(id);
  }
}
