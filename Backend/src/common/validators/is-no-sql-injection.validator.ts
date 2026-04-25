import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { containsSqlInjection } from '../utils/sql-injection.util';

export function NoSqlInjection(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'noSqlInjection',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return true; // only validate strings
          return !containsSqlInjection(value);
        },
        defaultMessage(args?: ValidationArguments) {
          return `${args?.property ?? 'value'} contains potential SQL injection patterns`;
        },
      },
    });
  };
}
