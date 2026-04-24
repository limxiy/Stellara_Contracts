import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RefreshTokenService } from '../refresh-token.service';

@ApiTags('auth')
@Controller('auth')
export class TokenController {
  constructor(private readonly tokenService: RefreshTokenService) {}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and get new access token' })
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.tokenService.rotate(refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all tokens (logout)' })
  logout(@Req() req: any) {
    const userId = req.user?.id;
    if (userId) return this.tokenService.revokeAll(userId);
  }
}
