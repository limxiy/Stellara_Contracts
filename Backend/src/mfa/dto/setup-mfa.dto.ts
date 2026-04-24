import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetupMfaDto {
  @ApiProperty({ example: '123456', description: '6-digit TOTP code to verify setup' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class SetupMfaResponseDto {
  @ApiProperty({ description: 'TOTP secret URI for QR code generation' })
  otpauthUrl: string;

  @ApiProperty({ description: 'Base32 encoded secret' })
  secret: string;

  @ApiProperty({ description: 'QR code data URL', nullable: true })
  qrCodeUrl: string | null;

  @ApiProperty({ description: 'Backup codes for account recovery', type: [String] })
  backupCodes: string[];
}
