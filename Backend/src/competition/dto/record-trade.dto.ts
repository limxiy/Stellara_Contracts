import { IsString, IsEnum, IsDecimal, IsOptional } from 'class-validator';
import { TradeSide } from '../enums/competition-type.enum';

export class RecordTradeDto {
  @IsString()
  competitionId: string;

  @IsString()
  userId: string;

  @IsString()
  asset: string;

  @IsEnum(TradeSide)
  side: TradeSide;

  @IsDecimal()
  quantity: number;

  @IsDecimal()
  price: number;

  @IsDecimal()
  totalValue: number;

  @IsOptional()
  @IsDecimal()
  fee?: number;

  @IsOptional()
  @IsString()
  transactionHash?: string;
}
