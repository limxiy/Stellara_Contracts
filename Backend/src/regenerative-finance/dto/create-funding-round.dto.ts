import { IsString, IsOptional, IsDate, IsObject } from 'class-validator';

export class CreateFundingRoundDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDate()
  startTime: Date;

  @IsDate()
  endTime: Date;

  @IsOptional()
  @IsString()
  matchingPool?: string;

  @IsOptional()
  @IsObject()
  metadata?: any;
}
