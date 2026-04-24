import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUserDto } from './dto/create-user.dto';
import { UserQueryDto } from './dto/user-query.dto';

describe('User DTO validation', () => {
  it('rejects an invalid Stellar wallet address', () => {
    const dto = new CreateUserDto();
    dto.walletAddress = 'invalid-wallet';

    const errors = validateSync(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('sanitizes user email input', () => {
    const dto = plainToInstance(CreateUserDto, {
      walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      email: '  USER@Example.COM  ',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('user@example.com');
  });

  it('applies paging defaults for user queries', () => {
    const dto = plainToInstance(UserQueryDto, {});
    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });
});
