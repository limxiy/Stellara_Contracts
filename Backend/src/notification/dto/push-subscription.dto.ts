import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class PushSubscriptionDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/fake-endpoint' })
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({
    example: {
      p256dh: 'BOb6aKexample',
      auth: 'XJ3kexample',
    },
  })
  @IsObject()
  keys: Record<string, string>;
}
