import { ApiProperty } from '@nestjs/swagger';

export class MfaStatusDto {
  @ApiProperty({ description: 'Whether MFA is enabled for the user' })
  enabled: boolean;

  @ApiProperty({ description: 'Whether MFA setup has been verified' })
  verified: boolean;

  @ApiProperty({ description: 'When MFA was enforced', nullable: true })
  enforcedAt: Date | null;

  @ApiProperty({ description: 'Number of remaining backup codes' })
  remainingBackupCodes: number;
}
