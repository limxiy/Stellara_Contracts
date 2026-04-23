import { Module } from '@nestjs/common';
import { V2UserController } from './controllers/user.controller';
import { V2StatusController } from './controllers/status.controller';
import { UserModule } from '../../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [V2UserController, V2StatusController],
})
export class V2Module {}
