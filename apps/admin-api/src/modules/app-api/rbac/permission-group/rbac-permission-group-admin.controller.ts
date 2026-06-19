import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../../../better-auth/better-auth-session.type';
import { RbacPermission } from '../../../system/rbac/rbac-permission.decorator';
import {
    AssignRbacPermissionGroupRelationsDto,
    CreateRbacPermissionGroupDto,
    QueryRbacPermissionGroupListDto,
    UpdateRbacPermissionGroupDto
} from '../../../system/rbac/dto/rbac.dto';
import { RBAC_PERMISSIONS } from '../../../system/rbac/rbac-permissions';
import { getActor, getRequestId, PositiveIntPipe, type ShiroRequest } from '../rbac-admin.controller-utils';
import { RbacAdminService } from '../rbac-admin.service';

@Controller('app-api/rbac/permission-group')
export class RbacPermissionGroupAdminController {
    constructor(private readonly rbacAdminService: RbacAdminService) {}

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_VIEW)
    @Post('query_permission_group_list')
    async getPermissionGroupList(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRbacPermissionGroupListDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionGroupAction(
            'query_permission_group_list',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_CREATE)
    @Post('create_group')
    async createPermissionGroup(
        @Session() session: BetterAuthSession,
        @Body() data: CreateRbacPermissionGroupDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionGroupAction(
            'create_group',
            data,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_UPDATE)
    @Post('update_group')
    async updatePermissionGroup(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Body() data: UpdateRbacPermissionGroupDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionGroupAction(
            'update_group',
            { id, data },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_DELETE)
    @Post('delete_group')
    async deletePermissionGroup(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionGroupAction(
            'delete_group',
            { id },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_VIEW)
    @Get('relations')
    async getPermissionGroupRelations(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionGroupAction(
            'relations',
            { id },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_GROUP_ASSIGN)
    @Post('assign_relations')
    async assignPermissionGroupRelations(
        @Session() session: BetterAuthSession,
        @Body() data: AssignRbacPermissionGroupRelationsDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionGroupAction(
            'assign_relations',
            data,
            getActor(session),
            getRequestId(request)
        );
    }
}
