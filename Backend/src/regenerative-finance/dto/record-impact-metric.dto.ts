import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RecordImpactMetricDto {
  @IsString()
  @IsNotEmpty()
  publicGoodsProjectId: string;

  @IsString()
  @IsNotEmpty()
  metricName: string;

  @IsString()
  @IsNotEmpty()
  metricValue: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  verificationSource?: string;
}
