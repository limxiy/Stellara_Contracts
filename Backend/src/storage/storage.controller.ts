import { Controller, Post, Body } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StorageService } from './storage.service';

@ApiTags('Storage')
@Controller('projects')
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('metadata')
  @ApiOperation({ summary: 'Pin project metadata to storage backend' })
  @ApiResponse({ status: 201, description: 'CID returned' })
  async pinProjectMetadata(@Body() metadata: any): Promise<string> {
    return this.storageService.pinProjectMetadata(metadata);
  }

  @Post('banner')
  @ApiOperation({ summary: 'Optimize and upload project banner image' })
  @ApiBody({
    schema: {
      properties: {
        imagePath: { type: 'string', example: '/tmp/banner.png' },
        width: { type: 'number', example: 1200 },
        height: { type: 'number', example: 630 },
      },
      required: ['imagePath', 'width', 'height'],
    },
  })
  @ApiResponse({ status: 201, description: 'CID returned for optimized banner' })
  async optimizeAndUploadBanner(@Body() banner: any): Promise<string> {
    const optimizedImage = await this.storageService.optimizeImage(
      banner.imagePath,
      banner.width,
      banner.height,
    );
    const cid = await this.storageService.pinProjectMetadata({ image: optimizedImage });
    return cid;
  }

  @Post('verify-hash')
  @ApiOperation({ summary: 'Verify an IPFS hash is valid' })
  @ApiBody({
    schema: {
      properties: {
        hash: { type: 'string', example: 'bafybeigdyrzt...' },
      },
      required: ['hash'],
    },
  })
  @ApiResponse({ status: 201, description: 'Hash verification result' })
  async verifyIPFSHash(@Body('hash') hash: string): Promise<boolean> {
    return this.storageService.verifyIPFSHash(hash);
  }
}
