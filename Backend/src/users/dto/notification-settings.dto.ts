import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyContributions?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyMilestones?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyDeadlines?: boolean;
}

export class CreateNotificationSettingsDto extends UpdateNotificationSettingsDto {
  @IsBoolean()
  emailEnabled: boolean;

  @IsBoolean()
  pushEnabled: boolean;

  @IsBoolean()
  notifyContributions: boolean;

  @IsBoolean()
  notifyMilestones: boolean;

  @IsBoolean()
  notifyDeadlines: boolean;
}