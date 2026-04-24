import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { sanitizeString, sanitizeUnknown } from '../../common/utils/sanitize.util';
import { IsStellarWalletAddress } from '../validators/is-stellar-wallet-address.validator';

export class CreateUserDto {
  @ApiProperty({ example: 'GABCD1234SAMPLEWALLETADDRESS' })
  @IsString()
  @IsStellarWalletAddress()
  walletAddress: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? sanitizeString(value).toLowerCase() : value))
  email?: string;

  @ApiPropertyOptional({ example: { displayName: 'Stellara Builder' } })
  @IsOptional()
  @IsObject()
  @Transform(({ value }) => sanitizeUnknown(value))
  profileData?: Record<string, unknown>;
}
