import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class ConfigureIntegrationDto {
  @IsString()
  @IsNotEmpty()
  platform: string;

  @IsObject()
  config: any;
}
