import { IsString, IsOptional, IsEnum, IsNumber, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeType } from '@prisma/client';

export class SubmitDisputeDto {
  @ApiProperty({
    description: 'Type of dispute being submitted',
    enum: DisputeType,
  })
  @IsEnum(DisputeType)
  disputeType: DisputeType;

  @ApiProperty({
    description: 'Brief reason for the dispute',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  reason: string;

  @ApiProperty({
    description: 'Detailed description of the dispute',
    maxLength: 2000,
  })
  @IsString()
  @MaxLength(2000)
  description: string;

  @ApiPropertyOptional({
    description: 'Supporting evidence for the dispute (JSON format)',
  })
  @IsOptional()
  evidence?: any;

  @ApiPropertyOptional({
    description: 'ID of the specific reputation activity being disputed',
  })
  @IsOptional()
  @IsString()
  disputedActivityId?: string;

  @ApiPropertyOptional({
    description: 'Requested reputation score if applicable',
    minimum: 0,
    maximum: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  requestedScore?: number;
}
