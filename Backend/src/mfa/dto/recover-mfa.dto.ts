import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecoverMfaDto {
  @ApiProperty({ example: 'abcd-efgh-ijkl-mnop', description: 'One-time backup code' })
  @IsString()
  @Length(8, 20)
  backupCode: string;
}

export class RecoverMfaResponseDto {
  @ApiProperty({ description: 'Whether recovery was successful' })
  success: boolean;

  @ApiProperty({ description: 'New backup codes generated after recovery', type: [String], nullable: true })
  newBackupCodes?: string[];

  @ApiProperty({ description: 'Message about recovery result' })
  message: string;
}
