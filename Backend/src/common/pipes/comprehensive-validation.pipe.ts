import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { scanForSqlInjection } from '../utils/sql-injection.util';
import { scanForXss } from '../utils/xss.util';
import { deepSanitizeXss } from '../utils/xss.util';

export interface ComprehensiveValidationOptions {
  /** Enable SQL injection scanning (default: true) */
  scanSqlInjection?: boolean;
  /** Enable XSS scanning (default: true) */
  scanXss?: boolean;
  /** Auto-sanitize XSS payloads instead of rejecting (default: false) */
  autoSanitizeXss?: boolean;
  /** Throw on first validation error (default: false) */
  stopAtFirstError?: boolean;
  /** Enable whitelist - strip properties without decorators (default: true) */
  whitelist?: boolean;
  /** Forbid non-whitelisted properties (default: true) */
  forbidNonWhitelisted?: boolean;
  /** Enable transformation (default: true) */
  transform?: boolean;
}

/**
 * Comprehensive validation pipe that combines class-validator with
 * SQL injection and XSS detection for defense-in-depth input validation.
 */
@Injectable()
export class ComprehensiveValidationPipe implements PipeTransform {
  private readonly logger = new Logger(ComprehensiveValidationPipe.name);

  constructor(private readonly options: ComprehensiveValidationOptions = {}) {}

  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const {
      scanSqlInjection = true,
      scanXss = true,
      autoSanitizeXss = false,
      stopAtFirstError = false,
      whitelist = true,
      forbidNonWhitelisted = true,
      transform = true,
    } = this.options;

    const { metatype } = metadata;
    if (!metatype || !this.toValidate(metatype)) {
      // Still scan plain objects for injection even without DTO
      if (typeof value === 'object' && value !== null) {
        this.scanRawValue(value as Record<string, unknown>, scanSqlInjection, scanXss);
      }
      return value;
    }

    // Transform to class instance
    const object = plainToInstance(metatype, value, {
      enableImplicitConversion: true,
      excludeExtraneousValues: whitelist,
    });

    // Run class-validator validation
    const errors = await validate(object as object, {
      whitelist,
      forbidNonWhitelisted,
      stopAtFirstError,
    });

    if (errors.length > 0) {
      throw new BadRequestException(errors);
    }

    // Deep scan for SQL injection in all string fields
    if (scanSqlInjection) {
      const sqlFindings = scanForSqlInjection(object);
      if (sqlFindings.length > 0) {
        this.logger.warn(
          `SQL injection detected in ${metadata.type}: ${sqlFindings.map((f) => f.path).join(', ')}`,
        );
        throw new BadRequestException({
          message: 'Potential SQL injection detected',
          fields: sqlFindings.map((f) => f.path),
        });
      }
    }

    // Deep scan for XSS in all string fields
    if (scanXss) {
      const xssFindings = scanForXss(object);
      if (xssFindings.length > 0) {
        if (autoSanitizeXss) {
          this.logger.warn(`XSS payloads sanitized in ${metadata.type}`);
          return deepSanitizeXss(object);
        } else {
          this.logger.warn(
            `XSS detected in ${metadata.type}: ${xssFindings.map((f) => f.path).join(', ')}`,
          );
          throw new BadRequestException({
            message: 'Potential XSS payload detected',
            fields: xssFindings.map((f) => f.path),
          });
        }
      }
    }

    return object;
  }

  private toValidate(metatype: unknown): boolean {
    const types: unknown[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private scanRawValue(
    value: Record<string, unknown>,
    scanSql: boolean,
    scanXss: boolean,
  ): void {
    if (scanSql) {
      const findings = scanForSqlInjection(value);
      if (findings.length > 0) {
        throw new BadRequestException({
          message: 'Potential SQL injection detected in request',
          fields: findings.map((f) => f.path),
        });
      }
    }
    if (scanXss) {
      const findings = scanForXss(value);
      if (findings.length > 0) {
        throw new BadRequestException({
          message: 'Potential XSS payload detected in request',
          fields: findings.map((f) => f.path),
        });
      }
    }
  }
}
