import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, PERMISSIONS_KEY } from '../decorators/roles.decorator';
import { RbacService } from '../rbac.service';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPerms = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length && !requiredPerms?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.id) throw new ForbiddenException('Unauthorized');

    if (requiredRoles?.length) {
      const userRoles = await this.rbac.getUserRoles(user.id);
      const hasRole = requiredRoles.some((r) => userRoles.includes(r));
      if (!hasRole) throw new ForbiddenException('Insufficient role');
    }

    if (requiredPerms?.length) {
      const userPerms = await this.rbac.getUserPermissions(user.id);
      const hasPerm = requiredPerms.every((p) => userPerms.includes(p));
      if (!hasPerm) throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
