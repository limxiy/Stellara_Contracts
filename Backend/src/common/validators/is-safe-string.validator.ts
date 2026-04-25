import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { containsSqlInjection } from '../utils/sql-injection.util';
import { containsXssPayload } from '../utils/xss.util';

export function IsSafeString(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSafeString',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          if (containsSqlInjection(value)) return false;
          if (containsXssPayload(value)) return false;
          return true;
        },
        defaultMessage(args?: ValidationArguments) {
          return `${args?.property ?? 'value'} contains unsafe characters or patterns`;
        },
      },
    });
  };
}
