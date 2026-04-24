import { Controller, Post, Delete, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RbacService } from '../rbac.service';

@ApiTags('rbac')
@Controller('auth/rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Post('roles')
  @ApiOperation({ summary: 'Create role' })
  createRole(@Body('name') name: string) {
    return this.rbac.createRole(name);
  }

  @Post('permissions')
  @ApiOperation({ summary: 'Create permission' })
  createPermission(@Body('action') action: string) {
    return this.rbac.createPermission(action);
  }

  @Get('roles')
  @ApiOperation({ summary: 'List all roles with permissions' })
  listRoles() {
    return this.rbac.listRoles();
  }

  @Post('roles/:role/permissions/:action')
  @ApiOperation({ summary: 'Attach permission to role' })
  attachPermission(@Param('role') role: string, @Param('action') action: string) {
    return this.rbac.attachPermissionToRole(role, action);
  }

  @Post('users/:userId/roles/:role')
  @ApiOperation({ summary: 'Assign role to user' })
  assignRole(@Param('userId') userId: string, @Param('role') role: string) {
    return this.rbac.assignRoleToUser(userId, role);
  }

  @Delete('users/:userId/roles/:role')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove role from user' })
  removeRole(@Param('userId') userId: string, @Param('role') role: string) {
    return this.rbac.removeRoleFromUser(userId, role);
  }

  @Get('users/:userId/permissions')
  @ApiOperation({ summary: 'Get user permissions' })
  getUserPermissions(@Param('userId') userId: string) {
    return this.rbac.getUserPermissions(userId);
  }
}
