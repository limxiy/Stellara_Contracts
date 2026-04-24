import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notifyContributions?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notifyMilestones?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notifyDeadlines?: boolean;
}

export class CreateNotificationSettingsDto extends UpdateNotificationSettingsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  emailEnabled: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  pushEnabled: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  notifyContributions: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  notifyMilestones: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  notifyDeadlines: boolean;
}