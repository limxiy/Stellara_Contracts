import { Injectable, NotFoundException } from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { sanitizeUnknown } from '../common/utils/sanitize.util';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(query: UserQueryDto) {
    const where = {
      ...(query.walletAddress ? { walletAddress: query.walletAddress } : {}),
      ...(query.email ? { email: query.email } : {}),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
    };
  }

  async getUserById(id: string): Promise<User | null> {
    const cached = await this.cache.get<User>(`user:${id}`);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;

    await this.cache.set(`user:${id}`, user, 300); // 5 min TTL in seconds
    return user;
  }

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const profileData = this.toPrismaJson(createUserDto.profileData);
    const user = await this.prisma.user.create({
      data: {
        walletAddress: createUserDto.walletAddress,
        email: createUserDto.email,
        ...(profileData !== undefined ? { profileData } : {}),
      },
    });

    return user;
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const existingUser = await this.prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const profileData = this.toPrismaJson(updateUserDto.profileData);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(updateUserDto.walletAddress ? { walletAddress: updateUserDto.walletAddress } : {}),
        ...(updateUserDto.email ? { email: updateUserDto.email } : {}),
        ...(profileData !== undefined ? { profileData } : {}),
      },
    });

    await this.invalidateUserCache(id);
    return user;
  }

  async invalidateUserCache(id: string) {
    await this.cache.del(`user:${id}`);
  }

  private toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }

    return sanitizeUnknown(value) as Prisma.InputJsonValue;
  }
}
