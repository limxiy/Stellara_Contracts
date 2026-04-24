import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { MfaService } from './mfa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetupMfaDto, SetupMfaResponseDto } from './dto/setup-mfa.dto';
import { VerifyMfaDto, VerifyMfaResponseDto } from './dto/verify-mfa.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { RecoverMfaDto, RecoverMfaResponseDto } from './dto/recover-mfa.dto';
import { MfaStatusDto } from './dto/mfa-status.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@ApiTags('MFA')
@ApiBearerAuth()
@Controller('api/mfa')
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate MFA setup' })
  @ApiResponse({ status: 200, description: 'MFA setup initiated', type: SetupMfaResponseDto })
  @ApiResponse({ status: 400, description: 'MFA already enabled' })
  async setup(@Req() req: AuthenticatedRequest) {
    return this.mfaService.generateSetup(req.user.id);
  }

  @Post('verify-setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify MFA setup with initial TOTP code' })
  @ApiResponse({ status: 200, description: 'MFA setup verified', type: VerifyMfaResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid MFA code' })
  async verifySetup(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SetupMfaDto,
  ) {
    return this.mfaService.verifySetup(req.user.id, dto.code);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a TOTP code' })
  @ApiResponse({ status: 200, description: 'Code verification result', type: VerifyMfaResponseDto })
  async verify(
    @Req() req: AuthenticatedRequest,
    @Body() dto: VerifyMfaDto,
  ) {
    const valid = await this.mfaService.verifyToken(req.user.id, dto.code);
    return { valid };
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable MFA for the user' })
  @ApiResponse({ status: 200, description: 'MFA disabled' })
  @ApiResponse({ status: 401, description: 'Invalid MFA code' })
  async disable(
    @Req() req: AuthenticatedRequest,
    @Body() dto: DisableMfaDto,
  ) {
    return this.mfaService.disableMfa(req.user.id, dto.code);
  }

  @Post('recover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recover MFA access using a backup code' })
  @ApiResponse({ status: 200, description: 'Recovery successful', type: RecoverMfaResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid backup code' })
  async recover(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RecoverMfaDto,
  ) {
    return this.mfaService.recoverWithBackupCode(req.user.id, dto.backupCode);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get current MFA status' })
  @ApiResponse({ status: 200, description: 'MFA status', type: MfaStatusDto })
  async status(@Req() req: AuthenticatedRequest) {
    return this.mfaService.getMfaStatus(req.user.id);
  }
}
