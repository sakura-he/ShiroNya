import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../../../better-auth/better-auth-session.type';
import { RbacPermission } from '../../../system/rbac/rbac-permission.decorator';
import { RBAC_PERMISSIONS } from '../../../system/rbac/rbac-permissions';
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
} from '../../../system/roles/dto/role.dto';
import { getActor, getRequestId, PositiveIntPipe, type ShiroRequest } from '../rbac-admin.controller-utils';
import { RbacAdminService } from '../rbac-admin.service';

@Controller('app-api/rbac/role')
export class RbacRoleAdminController {
    constructor(private readonly rbacAdminService: RbacAdminService) {}

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_VIEW)
    @Post('query_role_list')
    async getRoleList(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRoleListDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'query_role_list',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_VIEW)
    @Get('get_role_relations')
    async getRoleRelations(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'get_role_relations',
            { id },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_VIEW)
    @Post('query_assignable_users')
    async queryRoleAssignableUsers(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRoleAssignableUserDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'query_assignable_users',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_VIEW)
    @Post('query_assignable_user_groups')
    async queryRoleAssignableUserGroups(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRoleAssignableUserGroupDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'query_assignable_user_groups',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_VIEW)
    @Post('query_relation_parent_roles')
    async queryRoleParentRoles(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRoleAssignableParentDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'query_relation_parent_roles',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_VIEW)
    @Post('query_relation_permissions')
    async queryRolePermissions(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRoleAssignablePermissionDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'query_relation_permissions',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_VIEW)
    @Post('query_effective_users')
    async queryRoleEffectiveUsers(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRoleEffectiveUserDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'query_effective_users',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_CREATE)
    @Post('create_role')
    async createRole(@Session() session: BetterAuthSession, @Body() data: CreateRoleDto, @Req() request: ShiroRequest) {
        return await this.rbacAdminService.handleRoleAction(
            'create_role',
            data,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_UPDATE)
    @Post('update_role')
    async updateRole(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Body() data: UpdateRoleDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'update_role',
            { id, data },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_DELETE)
    @Post('delete_role')
    async deleteRole(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'delete_role',
            { id },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_USER)
    @Post('assign_users')
    async assignRoleUsers(
        @Session() session: BetterAuthSession,
        @Body() data: AssignRoleUserDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'assign_users',
            data,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_USER_GROUP)
    @Post('assign_user_groups')
    async assignRoleUserGroups(
        @Session() session: BetterAuthSession,
        @Body() data: AssignRoleUserGroupDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'assign_user_groups',
            data,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_PARENT_ROLE)
    @Post('assign_parent_roles')
    async assignRoleParentRoles(
        @Session() session: BetterAuthSession,
        @Body() data: AssignRoleParentDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'assign_parent_roles',
            data,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_ROLE_ASSIGN_PERMISSION)
    @Post('assign_permissions')
    async assignRolePermissions(
        @Session() session: BetterAuthSession,
        @Body() data: AssignRolePermissionDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleRoleAction(
            'assign_permissions',
            data,
            getActor(session),
            getRequestId(request)
        );
    }
}
