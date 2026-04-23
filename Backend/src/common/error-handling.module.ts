import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ValidationFilter } from './filters/validation.filter';
import { ApiResponseInterceptor } from './interceptors/api-response.interceptor';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: ValidationFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
  ],
  exports: [GlobalExceptionFilter, ValidationFilter, ApiResponseInterceptor],
})
export class ErrorHandlingModule {}
