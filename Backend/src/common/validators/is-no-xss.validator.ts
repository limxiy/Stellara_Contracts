import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { containsXssPayload } from '../utils/xss.util';

export function NoXss(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'noXss',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return true;
          return !containsXssPayload(value);
        },
        defaultMessage(args?: ValidationArguments) {
          return `${args?.property ?? 'value'} contains potential XSS payload`;
        },
      },
    });
  };
}
