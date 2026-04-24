import { IsString, IsBoolean, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddCommentDto {
  @ApiProperty({
    description: 'Comment content',
    maxLength: 1000,
  })
  @IsString()
  @MaxLength(1000)
  content: string;

  @ApiPropertyOptional({
    description: 'Whether this is an internal comment (moderators only)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
