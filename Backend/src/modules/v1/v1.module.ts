import { Module } from '@nestjs/common';
import { V1UserController } from './controllers/user.controller';
import { V1StatusController } from './controllers/status.controller';
import { UserModule } from '../../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [V1UserController, V1StatusController],
})
export class V1Module {}
