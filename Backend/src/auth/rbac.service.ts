import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../src/prisma.service';

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createRole(name: string) {
    return this.prisma.role.create({ data: { name } });
  }

  async createPermission(action: string) {
    return this.prisma.permission.create({ data: { action } });
  }

  async assignRoleToUser(userId: string, roleName: string) {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role ${roleName} not found`);
    const result = await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });
    this.logger.log(`Role ${roleName} assigned to user ${userId}`);
    return result;
  }

  async attachPermissionToRole(roleName: string, action: string) {
    const [role, permission] = await Promise.all([
      this.prisma.role.findUnique({ where: { name: roleName } }),
      this.prisma.permission.findUnique({ where: { action } }),
    ]);
    if (!role) throw new NotFoundException(`Role ${roleName} not found`);
    if (!permission) throw new NotFoundException(`Permission ${action} not found`);
    const result = await this.prisma.role.update({
      where: { id: role.id },
      data: { permissions: { connect: { id: permission.id } } },
    });
    this.logger.log(`Permission ${action} attached to role ${roleName}`);
    return result;
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: true } } },
    });
    const permissions = new Set<string>();
    for (const ur of userRoles) {
      for (const p of ur.role.permissions) permissions.add(p.action);
    }
    return [...permissions];
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return userRoles.map((ur) => ur.role.name);
  }

  async listRoles() {
    return this.prisma.role.findMany({ include: { permissions: true } });
  }

  async removeRoleFromUser(userId: string, roleName: string) {
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) throw new NotFoundException(`Role ${roleName} not found`);
    await this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId: role.id } },
    });
    this.logger.log(`Role ${roleName} removed from user ${userId}`);
  }
}
