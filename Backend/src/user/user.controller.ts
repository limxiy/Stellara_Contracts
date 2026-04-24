import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserIdParamDto } from './dto/user-id-param.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserResponseDto, UserNotFoundDto } from '../common/dto/common.dto';

@ApiTags('Users')
@Controller('api/user')
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({ status: 200, description: 'Return list of users' })
  async listUsers(@Query() query: UserQueryDto) {
    const { users, total } = await this.userService.findAll(query);

    return {
      data: users.map((user) => this.toUserResponse(user)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: "Retrieves a user's public profile information by their unique identifier",
  })
  @ApiParam({
    name: 'id',
    description: 'User unique identifier',
    example: 'cm3x1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    type: UserNotFoundDto,
  })
  async getUser(@Param() { id }: UserIdParamDto) {
    const user = await this.userService.getUserById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.toUserResponse(user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  async createUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.createUser(createUserDto);
    return this.toUserResponse(user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  async updateUser(
    @Param() { id }: UserIdParamDto,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const user = await this.userService.updateUser(id, updateUserDto);
    return this.toUserResponse(user);
  }

  private toUserResponse(user: any): UserResponseDto {
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      email: user.email,
      profileData: user.profileData,
      reputationScore: user.reputationScore,
      trustScore: user.trustScore,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
