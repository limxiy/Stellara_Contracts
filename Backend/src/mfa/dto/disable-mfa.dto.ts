import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DisableMfaDto {
  @ApiProperty({ example: '123456', description: '6-digit TOTP code or backup code to confirm disable' })
  @IsString()
  @Length(6, 20)
  code: string;
}
