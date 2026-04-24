import { Module } from '@nestjs/common';
import { NonceController } from './nonce.controller';
import { NonceService } from './nonce.service';

@Module({
  controllers: [NonceController],
  providers: [NonceService],
  exports: [NonceService],
})
export class NonceModule {}
