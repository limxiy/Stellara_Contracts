import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserProfileService } from './user-profile.service';
import { UpdateUserProfileDto } from './dto/user-profile.dto';
import { UpdateNotificationSettingsDto, CreateNotificationSettingsDto } from './dto/notification-settings.dto';

@ApiTags('User Profiles')
@Controller('users')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'Profile returned' })
  getProfile(@Param('id') id: string) {
    return this.userProfileService.getProfile(id);
  }

  @Patch(':id/profile')
  @ApiOperation({ summary: 'Update user profile' })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.userProfileService.updateProfile(id, dto);
  }

  @Post(':id/profile/avatar')
  @ApiOperation({ summary: 'Upload profile avatar' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB for avatars
      fileFilter: (_, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('Only image files are allowed for avatars'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    // In production: upload file.buffer to S3/IPFS and get back a URL
    const avatarUrl = `https://cdn.example.com/avatars/${id}-${Date.now()}.jpg`;
    return this.userProfileService.updateAvatar(id, avatarUrl);
  }

  @Get(':id/notification-settings')
  @ApiOperation({ summary: 'Get profile-level notification settings' })
  getNotificationSettings(@Param('id') id: string) {
    return this.userProfileService.getNotificationSettings(id);
  }

  @Patch(':id/notification-settings')
  @ApiOperation({ summary: 'Update profile-level notification settings' })
  updateNotificationSettings(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.userProfileService.updateNotificationSettings(id, dto);
  }

  @Post(':id/notification-settings')
  @ApiOperation({ summary: 'Create profile-level notification settings' })
  createNotificationSettings(
    @Param('id') id: string,
    @Body() dto: CreateNotificationSettingsDto,
  ) {
    return this.userProfileService.createNotificationSettings(id, dto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search user profiles' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  searchProfiles(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    if (!query) throw new BadRequestException('Search query is required');
    return this.userProfileService.searchProfiles(query, limit ? parseInt(limit, 10) : 20);
  }
}