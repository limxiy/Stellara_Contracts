import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const STRONG_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{12,}$/;

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && STRONG_PASSWORD_PATTERN.test(value);
        },
        defaultMessage(args?: ValidationArguments) {
          return `${args?.property ?? 'password'} must be at least 12 characters with uppercase, lowercase, number, and special character`;
        },
      },
    });
  };
}
