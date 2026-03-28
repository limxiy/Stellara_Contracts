import { Module } from '@nestjs/common';
import { HFTService } from './hft.service';

@Module({
  providers: [HFTService],
  exports: [HFTService],
})
export class HFTModule {}
