import { IsString, IsDecimal, IsOptional } from 'class-validator';

export class JoinCompetitionDto {
  @IsString()
  competitionId: string;

  @IsString()
  userId: string;

  @IsOptional()
  @IsDecimal()
  initialBalance?: number;
}
