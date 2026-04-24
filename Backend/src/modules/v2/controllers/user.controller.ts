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
import { UserService } from '../../../user/user.service';
import { CreateUserDto } from '../../../user/dto/create-user.dto';
import { UpdateUserDto } from '../../../user/dto/update-user.dto';
import { UserIdParamDto } from '../../../user/dto/user-id-param.dto';
import { UserQueryDto } from '../../../user/dto/user-query.dto';
import { UserResponseDto, UserNotFoundDto } from '../../../common/dto/common.dto';

@ApiTags('Users (v2)')
@Controller('v2/users')
@Throttle({ default: { limit: 40, ttl: 60000 } })
export class V2UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'List all users (v2)' })
  @ApiResponse({ status: 200, description: 'Return list of users' })
  async listUsers(@Query() query: UserQueryDto) {
    const { users, total } = await this.userService.findAll(query);

    return {
      apiVersion: 'v2',
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
  @ApiOperation({ summary: 'Get user by ID (v2)' })
  @ApiParam({ name: 'id', description: 'User unique identifier', example: 'cm3x1234567890' })
  @ApiResponse({ status: 200, description: 'User found', type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found', type: UserNotFoundDto })
  async getUser(@Param() { id }: UserIdParamDto) {
    const user = await this.userService.getUserById(id);
    if (!user) {
      throw new NotFoundException(
        'User not found in API v2. Confirm the ID or migrate the client to /api/v2/users.',
      );
    }

    return this.toUserResponse(user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user (v2)' })
  @ApiResponse({ status: 201, description: 'User created' })
  async createUser(@Body() createUserDto: CreateUserDto) {
    const user = await this.userService.createUser(createUserDto);
    return {
      apiVersion: 'v2',
      ...this.toUserResponse(user),
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing user (v2)' })
  @ApiResponse({ status: 200, description: 'User updated' })
  async updateUser(
    @Param() { id }: UserIdParamDto,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const user = await this.userService.updateUser(id, updateUserDto);
    return {
      apiVersion: 'v2',
      ...this.toUserResponse(user),
    };
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
