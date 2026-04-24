import { Global, Module, APP_INTERCEPTOR } from '@nestjs/common';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';
import { CacheInvalidationInterceptor } from './cache-invalidation.interceptor';
import { CacheController } from './cache.controller';

@Global()
@Module({
  controllers: [CacheController],
  providers: [
    CacheService,
    CacheInvalidationService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInvalidationInterceptor,
    },
  ],
  exports: [CacheService, CacheInvalidationService],
})
export class AppCacheModule {}
