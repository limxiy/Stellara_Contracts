import {
  IsString,
  IsOptional,
  IsUrl,
  IsArray,
  MinLength,
  MaxLength,
  IsObject,
} from 'class-validator';

export class UpdateUserProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  socialLinks?: string[];

  @IsOptional()
  @IsObject()
  preferences?: Record<string, any>;
}