import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyMfaDto {
  @ApiProperty({ example: '123456', description: '6-digit TOTP code' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class VerifyMfaResponseDto {
  @ApiProperty({ description: 'Whether the MFA code is valid' })
  valid: boolean;

  @ApiProperty({ description: 'Session token after MFA verification', nullable: true })
  token?: string;
}
