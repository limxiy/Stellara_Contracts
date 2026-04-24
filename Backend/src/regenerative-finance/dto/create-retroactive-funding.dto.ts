import { IsString, IsNotEmpty, IsNumber, IsObject, IsOptional } from 'class-validator';

export class CreateRetroactiveFundingDto {
  @IsString()
  @IsNotEmpty()
  publicGoodsProjectId: string;

  @IsString()
  @IsNotEmpty()
  evaluatorAddress: string;

  @IsNumber()
  impactScore: number;

  @IsString()
  @IsNotEmpty()
  fundingAmount: string;

  @IsObject()
  evaluationCriteria: any;

  @IsOptional()
  @IsObject()
  supportingEvidence?: any;
}
