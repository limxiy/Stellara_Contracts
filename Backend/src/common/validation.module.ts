import { Module } from '@nestjs/common';
import { APP_PIPE, APP_FILTER } from '@nestjs/core';
import { ComprehensiveValidationPipe } from './pipes/comprehensive-validation.pipe';
import { ValidationExceptionFilter } from './filters/validation-exception.filter';

@Module({
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ComprehensiveValidationPipe({
          scanSqlInjection: true,
          scanXss: true,
          autoSanitizeXss: false,
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
    },
    {
      provide: APP_FILTER,
      useClass: ValidationExceptionFilter,
    },
  ],
  exports: [ComprehensiveValidationPipe, ValidationExceptionFilter],
})
export class ValidationModule {}
