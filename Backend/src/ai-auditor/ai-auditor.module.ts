import { Module } from '@nestjs/common';
import { AIAuditorService } from './ai-auditor.service';

@Module({
  providers: [AIAuditorService],
  exports: [AIAuditorService],
})
export class AIAuditorModule {}
