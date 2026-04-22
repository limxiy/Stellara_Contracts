import { IsString, IsNumber } from 'class-validator';

export class CreateClaimDto {
  @IsString()
  policyId: string;

  @IsNumber()
  claimAmount: number;
}
