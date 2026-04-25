import { IsString, IsOptional, IsEmail, IsJSON } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsSafeString,
  IsStrongPassword,
  NoSqlInjection,
  NoXss,
  IsContractId,
  IsStellarWalletAddress,
} from '../validators';

/**
 * Example DTO demonstrating the comprehensive validation framework.
 * This serves as a reference for how to apply security validators.
 */
export class ValidationExampleDto {
  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  @IsSafeString()
  email: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  @IsStrongPassword()
  password: string;

  @ApiProperty({ description: 'Stellar wallet address' })
  @IsStellarWalletAddress()
  walletAddress: string;

  @ApiPropertyOptional({ description: 'Smart contract ID' })
  @IsOptional()
  @IsContractId()
  contractId?: string;

  @ApiPropertyOptional({ description: 'User display name' })
  @IsOptional()
  @IsString()
  @NoSqlInjection()
  @NoXss()
  displayName?: string;

  @ApiPropertyOptional({ description: 'User bio / description' })
  @IsOptional()
  @IsString()
  @IsSafeString()
  bio?: string;

  @ApiPropertyOptional({ description: 'JSON metadata' })
  @IsOptional()
  @IsJSON()
  metadata?: string;
}
