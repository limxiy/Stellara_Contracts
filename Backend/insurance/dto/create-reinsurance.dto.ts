import { IsString, IsNumber } from 'class-validator';

export class CreateReinsuranceDto {
  @IsString()
  poolId: string;

  @IsNumber()
  coverageLimit: number;

  @IsNumber()
  premiumRate: number;
}
