import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NonceService } from './nonce.service';

@ApiTags('Auth')
@Controller('nonce')
export class NonceController {
  constructor(private readonly nonceService: NonceService) {}

  @Post()
  @ApiOperation({ summary: 'Generate nonce for wallet-based auth flows' })
  @ApiResponse({ status: 201, description: 'Nonce generated' })
  async getNonce(): Promise<string> {
    return this.nonceService.generateNonce();
  }
}
