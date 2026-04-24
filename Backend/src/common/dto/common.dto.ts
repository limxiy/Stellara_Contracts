import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: 'cm3x1234567890' })
  id: string;

  @ApiProperty({ example: 'GABC123...' })
  walletAddress: string;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email: string | null;

  @ApiProperty({ example: { bio: 'Hello' }, nullable: true })
  profileData: any;

  @ApiProperty({ example: 100 })
  reputationScore: number;

  @ApiProperty({ example: 95 })
  trustScore: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class UserNotFoundDto {
  @ApiProperty({ example: 'User not found' })
  error: string;
}
