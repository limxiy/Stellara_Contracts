import { SetMetadata } from '@nestjs/common';

/**
 * Metadata keys for cache invalidation decorators
 */
export const CACHE_INVALIDATE_TAGS = 'cache:invalidate:tags';
export const CACHE_INVALIDATE_ENTITY = 'cache:invalidate:entity';
export const CACHE_TAGS = 'cache:tags';

/**
 * Decorator to automatically invalidate specific cache tags after method execution
 * Usage:
 * @InvalidateCacheTags(['projects:list', 'projects:trending'])
 * async updateProject(id: string, data: UpdateProjectDto) {
 *   return this.projectService.update(id, data);
 * }
 */
export function InvalidateCacheTags(tags: string[]) {
  return SetMetadata(CACHE_INVALIDATE_TAGS, tags);
}

/**
 * Decorator to automatically invalidate cache for a specific entity type and ID
 * The entityId can reference a parameter name from the method arguments
 * Usage:
 * @InvalidateCacheEntity('project', 'id')
 * async updateProject(id: string, data: UpdateProjectDto) {
 *   return this.projectService.update(id, data);
 * }
 */
export function InvalidateCacheEntity(
  entityType: string,
  entityIdParam: string = 'id',
  action: 'create' | 'update' | 'delete' = 'update',
) {
  return SetMetadata(CACHE_INVALIDATE_ENTITY, {
    entityType,
    entityIdParam,
    action,
  });
}

/**
 * Decorator to tag cached results with specific tags for later invalidation
 * Usage:
 * @CacheTags(['projects:list', 'projects:trending'])
 * @Cacheable('projects:all', 3600)
 * async getAllProjects() {
 *   return this.projectService.findAll();
 * }
 */
export function CacheTags(tags: string[]) {
  return SetMetadata(CACHE_TAGS, tags);
}

/**
 * Decorator to cache method results with optional tags
 * Usage:
 * @Cacheable('project:{id}', 300)
 * async getProject(id: string) {
 *   return this.projectService.findById(id);
 * }
 */
export function Cacheable(
  keyPattern: string,
  ttlSeconds: number = 300,
  tags: string[] = [],
) {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    // Mark metadata for interception
    SetMetadata('cache:key', keyPattern)(target, propertyKey, descriptor);
    SetMetadata('cache:ttl', ttlSeconds)(target, propertyKey, descriptor);
    if (tags.length > 0) {
      SetMetadata(CACHE_TAGS, tags)(target, propertyKey, descriptor);
    }

    return descriptor;
  };
}
