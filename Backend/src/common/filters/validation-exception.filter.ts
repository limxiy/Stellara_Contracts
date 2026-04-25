import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ValidationError } from 'class-validator';

interface FormattedValidationError {
  field: string;
  errors: string[];
  value?: unknown;
}

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ValidationExceptionFilter.name);

  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    const exceptionResponse = exception.getResponse() as
      | { message: string | ValidationError[]; error?: string }
      | string;

    let formattedErrors: FormattedValidationError[] = [];
    let message = 'Validation failed';

    if (typeof exceptionResponse === 'object' && exceptionResponse.message) {
      if (Array.isArray(exceptionResponse.message)) {
        formattedErrors = this.formatValidationErrors(exceptionResponse.message);
        message = 'Request validation failed';
      } else {
        message = exceptionResponse.message;
      }
    }

    // Log security-relevant validation failures
    const hasInjectionErrors = formattedErrors.some((e) =>
      e.errors.some(
        (err) =>
          err.toLowerCase().includes('sql injection') ||
          err.toLowerCase().includes('xss') ||
          err.toLowerCase().includes('unsafe'),
      ),
    );

    if (hasInjectionErrors) {
      this.logger.warn(
        `Potential injection attempt blocked from ${request.ip} - ${request.method} ${request.path}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      error: 'Bad Request',
      message,
      validationErrors: formattedErrors,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private formatValidationErrors(errors: ValidationError[]): FormattedValidationError[] {
    const result: FormattedValidationError[] = [];

    for (const error of errors) {
      const fieldErrors: string[] = [];

      if (error.constraints) {
        fieldErrors.push(...Object.values(error.constraints));
      }

      if (error.children && error.children.length > 0) {
        const childErrors = this.formatValidationErrors(error.children);
        for (const child of childErrors) {
          result.push({
            field: `${error.property}.${child.field}`,
            errors: child.errors,
            value: child.value,
          });
        }
      }

      if (fieldErrors.length > 0) {
        result.push({
          field: error.property,
          errors: fieldErrors,
          value: error.value,
        });
      }
    }

    return result;
  }
}
