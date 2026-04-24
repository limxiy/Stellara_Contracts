import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { NonceService } from './nonce.service';

class RequestNonceDto {
  @IsString()
  walletAddress: string;
}

class VerifySignatureDto {
  @IsString()
  walletAddress: string;

  @IsString()
  signature: string;
}

@ApiTags('Auth')
@Controller('nonce')
export class NonceController {
  constructor(private readonly nonceService: NonceService) {}

  @Post()
  @ApiOperation({ summary: 'Generate nonce for wallet-based auth' })
  @ApiResponse({ status: 201, description: 'Nonce generated' })
  getNonce(@Body() dto: RequestNonceDto): { nonce: string } {
    return { nonce: this.nonceService.generateNonce(dto.walletAddress) };
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify wallet signature against issued nonce' })
  @ApiResponse({ status: 201, description: 'Signature valid' })
  verify(@Body() dto: VerifySignatureDto): { verified: boolean } {
    this.nonceService.verifySignature(dto.walletAddress, dto.signature);
    return { verified: true };
  }
}
