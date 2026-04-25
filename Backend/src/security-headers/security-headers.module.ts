import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SecurityHeadersMiddleware } from './security-headers.middleware';
import { SecurityHeadersService } from './security-headers.service';
import { SecurityHeadersController } from './security-headers.controller';

@Module({
  imports: [ConfigModule],
  controllers: [SecurityHeadersController],
  providers: [SecurityHeadersMiddleware, SecurityHeadersService],
  exports: [SecurityHeadersMiddleware, SecurityHeadersService],
})
export class SecurityHeadersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
