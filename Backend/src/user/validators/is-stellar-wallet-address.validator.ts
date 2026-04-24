import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const STELLAR_WALLET_ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;

export function IsStellarWalletAddress(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isStellarWalletAddress',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && STELLAR_WALLET_ADDRESS_PATTERN.test(value);
        },
        defaultMessage(args?: ValidationArguments) {
          return `${args?.property ?? 'value'} must be a valid Stellar wallet address`;
        },
      },
    });
  };
}
