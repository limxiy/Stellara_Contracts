import { IsString, IsNotEmpty } from 'class-validator';

export class ContributeToProjectDto {
  @IsString()
  @IsNotEmpty()
  fundingRoundId: string;

  @IsString()
  @IsNotEmpty()
  publicGoodsProjectId: string;

  @IsString()
  @IsNotEmpty()
  contributorAddress: string;

  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @IsNotEmpty()
  transactionHash: string;

  @IsString()
  voiceCredits?: string;
}
