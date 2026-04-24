import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';

export class InvalidateCacheDto {
  tags?: string[];
  entityType?: string;
  entityId?: string;
  pattern?: string;
}

export class InvalidateBatchDto {
  entities: Array<{
    entityType: string;
    entityId: string;
    action?: 'create' | 'update' | 'delete';
  }>;
}

@ApiTags('Cache Management')
@Controller('cache')
export class CacheController {
  private readonly logger = new Logger(CacheController.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {}

  /**
   * Invalidate cache entries by tags
   */
  @Post('invalidate/tags')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate cache by tags' })
  @ApiResponse({
    status: 200,
    description: 'Cache entries invalidated successfully',
  })
  async invalidateByTags(
    @Body() dto: { tags: string[] },
  ): Promise<{ invalidatedCount: number }> {
    const count = await this.cacheService.invalidateByTags(dto.tags);
    this.logger.log(`Cache invalidated for tags: ${dto.tags.join(', ')}`);
    return { invalidatedCount: count };
  }

  /**
   * Invalidate cache entries by entity type
   */
  @Post('invalidate/entity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate cache by entity' })
  @ApiResponse({
    status: 200,
    description: 'Entity cache invalidated successfully',
  })
  async invalidateByEntity(
    @Body() dto: { entityType: string; entityId?: string },
  ): Promise<{ invalidatedCount: number }> {
    const count = await this.cacheService.invalidateByEntity(
      dto.entityType,
      dto.entityId,
    );
    this.logger.log(
      `Cache invalidated for entity: ${dto.entityType}${dto.entityId ? ':' + dto.entityId : ':*'}`,
    );
    return { invalidatedCount: count };
  }

  /**
   * Invalidate cache entries by pattern
   */
  @Post('invalidate/pattern')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate cache by pattern' })
  @ApiResponse({
    status: 200,
    description: 'Pattern cache invalidated successfully',
  })
  async invalidateByPattern(
    @Body() dto: { pattern: string },
  ): Promise<{ invalidatedCount: number }> {
    await this.cacheService.delByPattern(dto.pattern);
    this.logger.log(`Cache invalidated for pattern: ${dto.pattern}`);
    return { invalidatedCount: 0 }; // Pattern delete doesn't return count
  }

  /**
   * Batch invalidate multiple entities
   */
  @Post('invalidate/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch invalidate multiple entities' })
  @ApiResponse({
    status: 200,
    description: 'Batch cache invalidation completed',
  })
  async invalidateBatch(
    @Body() dto: InvalidateBatchDto,
  ): Promise<{ invalidatedCount: number }> {
    const count = await this.cacheInvalidationService.invalidateBatch(
      dto.entities,
    );
    this.logger.log(`Batch cache invalidation completed. Invalidated ${count} entries.`);
    return { invalidatedCount: count };
  }

  /**
   * Invalidate all versions of a key
   */
  @Delete('invalidate/versions/:key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate all versions of a cache key' })
  @ApiResponse({
    status: 200,
    description: 'Cache versions invalidated successfully',
  })
  async invalidateVersions(
    @Param('key') key: string,
  ): Promise<{ invalidatedCount: number }> {
    const count = await this.cacheService.invalidateVersions(key);
    this.logger.log(`All versions of key '${key}' invalidated. Count: ${count}`);
    return { invalidatedCount: count };
  }

  /**
   * Clear entire cache (use with caution!)
   */
  @Post('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear entire cache (DANGEROUS)' })
  @ApiResponse({
    status: 200,
    description: 'Cache cleared successfully',
  })
  async clearCache(): Promise<{ message: string }> {
    await this.cacheService.clear();
    this.logger.warn('Entire cache cleared via API');
    return { message: 'Cache cleared successfully' };
  }

  /**
   * Get cache metrics
   */
  @Get('metrics')
  @ApiOperation({ summary: 'Get cache metrics' })
  @ApiResponse({
    status: 200,
    description: 'Cache metrics retrieved successfully',
  })
  getMetrics() {
    return this.cacheService.getMetrics();
  }

  /**
   * Get detailed cache info
   */
  @Get('info')
  @ApiOperation({ summary: 'Get detailed cache info' })
  @ApiResponse({
    status: 200,
    description: 'Cache info retrieved successfully',
  })
  async getInfo() {
    return this.cacheService.getInfo();
  }

  /**
   * Get invalidation rules for an entity type
   */
  @Get('rules/:entityType')
  @ApiOperation({ summary: 'Get cache invalidation rules for entity type' })
  @ApiResponse({
    status: 200,
    description: 'Rules retrieved successfully',
  })
  getRules(@Param('entityType') entityType: string) {
    return this.cacheInvalidationService.getRules(entityType);
  }

  /**
   * Get all invalidation rules
   */
  @Get('rules')
  @ApiOperation({ summary: 'Get all cache invalidation rules' })
  @ApiResponse({
    status: 200,
    description: 'All rules retrieved successfully',
  })
  getAllRules() {
    const rules = this.cacheInvalidationService.getAllRules();
    return Object.fromEntries(rules);
  }
}
