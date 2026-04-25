import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const CONTRACT_ID_PATTERN = /^C[A-Z2-7]{55}$/;

export function IsContractId(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isContractId',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && CONTRACT_ID_PATTERN.test(value);
        },
        defaultMessage(args?: ValidationArguments) {
          return `${args?.property ?? 'value'} must be a valid Stellar contract ID`;
        },
      },
    });
  };
}
