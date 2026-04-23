import { IsString, IsNumber, IsDate, IsOptional, IsEmail, IsEnum, IsDecimal } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInvoiceDto {
  @IsString()
  invoiceNumber: string;

  @IsString()
  buyerName: string;

  @IsOptional()
  @IsEmail()
  buyerEmail?: string;

  @IsOptional()
  @IsString()
  buyerAddress?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  currency: string = 'USD';

  @IsDate()
  @Type(() => Date)
  issueDate: Date;

  @IsDate()
  @Type(() => Date)
  dueDate: Date;

  @IsOptional()
  @IsString()
  description?: string;
}

export class OcrExtractedDataDto {
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  buyerName?: string;

  @IsOptional()
  @IsEmail()
  buyerEmail?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  amount?: number;

  @IsOptional()
  @IsDate()
  issueDate?: Date;

  @IsOptional()
  @IsDate()
  dueDate?: Date;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  confidence?: number;
}
