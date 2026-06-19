import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../../../better-auth/better-auth-session.type';
import { RbacPermission } from '../../../system/rbac/rbac-permission.decorator';
import { RBAC_PERMISSIONS } from '../../../system/rbac/rbac-permissions';
import {
    AssignUserGroupMemberDto,
    AssignUserGroupRoleDto,
    CreateUserGroupDto,
    QueryUserGroupListDto,
    QueryUserGroupRelationMemberDto,
    QueryUserGroupRelationMenuDto,
    QueryUserGroupRelationRoleDto,
    UpdateUserGroupDto
} from '../../../system/user-groups/dto/user-group.dto';
import { getActor, getRequestId, PositiveIntPipe, type ShiroRequest } from '../rbac-admin.controller-utils';
import { RbacAdminService } from '../rbac-admin.service';

@Controller('app-api/rbac/user-group')
export class RbacUserGroupAdminController {
    constructor(private readonly rbacAdminService: RbacAdminService) {}

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_VIEW)
    @Post('query_user_group_list')
    async getUserGroupList(
        @Session() session: BetterAuthSession,
        @Body() query: QueryUserGroupListDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'query_user_group_list',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_VIEW)
    @Get('relations')
    async getUserGroupRelations(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'relations',
            { id },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_VIEW)
    @Post('query_relation_members')
    async queryUserGroupMembers(
        @Session() session: BetterAuthSession,
        @Body() query: QueryUserGroupRelationMemberDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'query_relation_members',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_VIEW)
    @Post('query_relation_roles')
    async queryUserGroupRoles(
        @Session() session: BetterAuthSession,
        @Body() query: QueryUserGroupRelationRoleDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'query_relation_roles',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_VIEW)
    @Post('query_relation_menus')
    async queryUserGroupMenus(
        @Session() session: BetterAuthSession,
        @Body() query: QueryUserGroupRelationMenuDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'query_relation_menus',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_CREATE)
    @Post('create_user_group')
    async createUserGroup(
        @Session() session: BetterAuthSession,
        @Body() data: CreateUserGroupDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'create_user_group',
            data,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_UPDATE)
    @Post('update_user_group')
    async updateUserGroup(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Body() data: UpdateUserGroupDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'update_user_group',
            { id, data },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_DELETE)
    @Post('delete_user_group')
    async deleteUserGroup(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'delete_user_group',
            { id },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_ASSIGN_MEMBER)
    @Post('assign_members')
    async assignUserGroupMembers(
        @Session() session: BetterAuthSession,
        @Body() data: AssignUserGroupMemberDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'assign_members',
            data,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_USER_GROUP_ASSIGN_ROLE)
    @Post('assign_roles')
    async assignUserGroupRoles(
        @Session() session: BetterAuthSession,
        @Body() data: AssignUserGroupRoleDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleUserGroupAction(
            'assign_roles',
            data,
            getActor(session),
            getRequestId(request)
        );
    }
}
