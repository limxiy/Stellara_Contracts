import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class IssueImpactCertificateDto {
  @IsString()
  @IsNotEmpty()
  fundingRoundId: string;

  @IsString()
  @IsNotEmpty()
  publicGoodsProjectId: string;

  @IsString()
  @IsNotEmpty()
  issuerAddress: string;

  @IsString()
  @IsNotEmpty()
  holderAddress: string;

  @IsObject()
  impactMetrics: any;

  @IsOptional()
  @IsObject()
  verificationData?: any;
}
