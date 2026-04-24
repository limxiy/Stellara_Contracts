import { IsString, IsObject, IsOptional } from 'class-validator';

export class FortaAlertDto {
  @IsString()
  alertId: string;

  @IsString()
  name: string;

  @IsString()
  hash: string; // Transaction hash

  @IsString()
  protocol: string; // e.g. "Stellara"

  @IsString()
  severity: string; // e.g. "HIGH", "CRITICAL"

  @IsString()
  @IsOptional()
  network?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
