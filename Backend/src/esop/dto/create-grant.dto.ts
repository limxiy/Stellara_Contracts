import { IsString, IsInt, IsEnum, IsNumber, Min } from 'class-validator';
import { EsopGrantType, VestingFrequency } from '@prisma/client';

export class CreateGrantDto {
  @IsString()
  orgId: string;

  @IsString()
  employeeId: string;

  @IsEnum(EsopGrantType)
  type: EsopGrantType;

  @IsInt()
  @Min(1)
  totalShares: number;

  @IsNumber()
  @Min(0)
  strikePrice: number;

  @IsInt()
  @Min(1)
  vestingPeriodMonths: number = 48;

  @IsInt()
  @Min(0)
  cliffPeriodMonths: number = 12;

  @IsEnum(VestingFrequency)
  vestingFrequency: VestingFrequency = VestingFrequency.MONTHLY;
}
