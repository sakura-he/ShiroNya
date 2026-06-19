import { createRuntimeLogger, ZodValidationPipe } from '@app/common';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import {
    AssignRoleParentDto,
    AssignRolePermissionDto,
    AssignRoleUserDto,
    AssignRoleUserGroupDto,
    CreateRoleDto,
    QueryRoleAssignableParentDto,
    QueryRoleAssignablePermissionDto,
    QueryRoleAssignableUserDto,
    QueryRoleAssignableUserGroupDto,
    QueryRoleEffectiveUserDto,
    QueryRoleListDto,
    UpdateRoleDto
} from './dto/role.dto';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import { SystemRolesService } from './roles.service';

// 角色管理控制器，当前仅要求已登录会话
@Controller('role')
export class SystemRolesController {
    private readonly logger = createRuntimeLogger(SystemRolesController.name, {
        domain: 'role',
        resource: { type: 'role' }
    });

    constructor(private readonly roleService: SystemRolesService) {}

    /** 查询所有角色 */
    @RbacPermission('system.role.view')
    @Post('query_role_list')
    async getAllRoles(@Session() session: BetterAuthSession, @Body() query: QueryRoleListDto) {
        return await this.roleService.getAllRoles(query, session.user.id);
    }

    /** 查询角色的 RBAC 关系视图 */
    @RbacPermission('system.role.view')
    @Get('get_role_relations')
    async getRoleRelations(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number())) id: number
    ) {
        return await this.roleService.getRoleRelations(id, session.user.id);
    }

    /** 分页查询角色可分配用户 */
    @RbacPermission('system.role.view')
    @Post('query_assignable_users')
    async queryAssignableUsers(@Session() session: BetterAuthSession, @Body() query: QueryRoleAssignableUserDto) {
        return await this.roleService.getRoleAssignableUsers(query, session.user.id);
    }

    /** 分页查询角色可分配用户组 */
    @RbacPermission('system.role.view')
    @Post('query_assignable_user_groups')
    async queryAssignableUserGroups(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRoleAssignableUserGroupDto
    ) {
        return await this.roleService.getRoleAssignableUserGroups(query, session.user.id);
    }

    /** 分页查询角色可继承父角色 */
    @RbacPermission('system.role.view')
    @Post('query_relation_parent_roles')
    async queryRelationParentRoles(@Session() session: BetterAuthSession, @Body() query: QueryRoleAssignableParentDto) {
        return await this.roleService.getRoleAssignableParentRoles(query, session.user.id);
    }

    /** 分页查询角色可授权权限 */
    @RbacPermission('system.role.view')
    @Post('query_relation_permissions')
    async queryRelationPermissions(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRoleAssignablePermissionDto
    ) {
        return await this.roleService.getRoleAssignablePermissions(query, session.user.id);
    }

    /** 分页查询角色有效用户 */
    @RbacPermission('system.role.view')
    @Post('query_effective_users')
    async queryEffectiveUsers(@Session() session: BetterAuthSession, @Body() query: QueryRoleEffectiveUserDto) {
        return await this.roleService.getRoleEffectiveUsers(query, session.user.id);
    }

    /** 创建角色 */
    @RbacPermission('system.role.view')
    @Post('create_role')
    async createRole(@Session() session: BetterAuthSession, @Body() createRoleDto: CreateRoleDto) {
        this.logger.debug.title('创建角色请求', { createRoleDto });
        return await this.roleService.createRole(createRoleDto, session.user.id);
    }

    /** 更新指定角色 */
    @RbacPermission('system.role.view')
    @Post('update_role')
    async updateRole(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number())) id: number,
        @Body() data: UpdateRoleDto
    ) {
        return await this.roleService.updateRole(id, data, session.user.id);
    }

    /** 删除指定角色 */
    @RbacPermission('system.role.view')
    @Post('delete_role')
    async deleteRole(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number())) id: number
    ) {
        return await this.roleService.deleteRole(id, session.user.id);
    }

    /** 分配角色直接用户 */
    @RbacPermission('system.role.view')
    @Post('assign_users')
    async assignUsers(@Session() session: BetterAuthSession, @Body() data: AssignRoleUserDto) {
        await this.roleService.assignDirectUsers(data.roleId, data.userIds, session.user.id);
        return null;
    }

    /** 分配角色用户组 */
    @RbacPermission('system.role.view')
    @Post('assign_user_groups')
    async assignUserGroups(@Session() session: BetterAuthSession, @Body() data: AssignRoleUserGroupDto) {
        await this.roleService.assignUserGroups(data.roleId, data.userGroupIds, session.user.id);
        return null;
    }

    /** 分配角色继承父角色 */
    @RbacPermission('system.role.view')
    @Post('assign_parent_roles')
    async assignParentRoles(@Session() session: BetterAuthSession, @Body() data: AssignRoleParentDto) {
        await this.roleService.assignParentRoles(data.roleId, data.parentRoleIds, session.user.id);
        return null;
    }

    /** 分配角色权限 */
    @RbacPermission('system.role.view')
    @Post('assign_permissions')
    async assignPermissions(@Session() session: BetterAuthSession, @Body() data: AssignRolePermissionDto) {
        await this.roleService.assignPermissions(data.roleId, data.permissionIds, session.user.id);
        return null;
    }
}
