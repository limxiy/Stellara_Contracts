import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateMatchingPoolDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  totalAmount: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  percentageFee?: number;

  @IsOptional()
  @IsObject()
  metadata?: any;
}
