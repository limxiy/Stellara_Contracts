import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResolutionType } from '@prisma/client';

export class ResolveDisputeDto {
  @ApiProperty({
    description: 'Type of resolution being applied',
    enum: ResolutionType,
  })
  @IsEnum(ResolutionType)
  resolutionType: ResolutionType;

  @ApiProperty({
    description: 'Explanation for the resolution decision',
    maxLength: 1000,
  })
  @IsString()
  explanation: string;

  @ApiPropertyOptional({
    description: 'Final reputation score after resolution',
    minimum: 0,
    maximum: 1000,
  })
  @IsOptional()
  @IsNumber()
  finalScore?: number;

  @ApiPropertyOptional({
    description: 'Additional evidence supporting the resolution',
  })
  @IsOptional()
  evidence?: any;
}
