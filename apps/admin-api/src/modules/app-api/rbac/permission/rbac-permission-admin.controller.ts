import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../../../better-auth/better-auth-session.type';
import { RbacPermission } from '../../../system/rbac/rbac-permission.decorator';
import {
    AssignRbacPermissionRolesDto,
    CreateRbacPermissionDto,
    QueryRbacPermissionListDto,
    QueryRbacPermissionRolesDto,
    SuggestRbacPermissionCodeDto,
    UpdateRbacPermissionDto
} from '../../../system/rbac/dto/rbac.dto';
import { RBAC_PERMISSIONS } from '../../../system/rbac/rbac-permissions';
import { getActor, getRequestId, PositiveIntPipe, type ShiroRequest } from '../rbac-admin.controller-utils';
import { RbacAdminService } from '../rbac-admin.service';

@Controller('app-api/rbac/permission')
export class RbacPermissionAdminController {
    constructor(private readonly rbacAdminService: RbacAdminService) {}

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_VIEW)
    @Post('query_permission_list')
    async getPermissionList(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRbacPermissionListDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionAction(
            'query_permission_list',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_VIEW)
    @Get('declaration_board')
    async getPermissionDeclarationBoard(@Session() session: BetterAuthSession, @Req() request: ShiroRequest) {
        return await this.rbacAdminService.handlePermissionAction(
            'declaration_board',
            {},
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_CREATE)
    @Post('suggest_code')
    async suggestPermissionCode(
        @Session() session: BetterAuthSession,
        @Body() data: SuggestRbacPermissionCodeDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionAction(
            'suggest_code',
            data,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_CREATE)
    @Post('create_permission')
    async createPermission(
        @Session() session: BetterAuthSession,
        @Body() data: CreateRbacPermissionDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionAction(
            'create_permission',
            data,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_UPDATE)
    @Post('update_permission')
    async updatePermission(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Body() data: UpdateRbacPermissionDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionAction(
            'update_permission',
            { id, data },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_DELETE)
    @Post('delete_permission')
    async deletePermission(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionAction(
            'delete_permission',
            { id },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_VIEW)
    @Get('relations')
    async getPermissionRelations(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionAction(
            'relations',
            { id },
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_VIEW)
    @Post('query_relation_roles')
    async queryPermissionRoles(
        @Session() session: BetterAuthSession,
        @Body() query: QueryRbacPermissionRolesDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionAction(
            'query_relation_roles',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_PERMISSION_ASSIGN_ROLE)
    @Post('assign_roles')
    async assignPermissionRoles(
        @Session() session: BetterAuthSession,
        @Body() data: AssignRbacPermissionRolesDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handlePermissionAction(
            'assign_roles',
            data,
            getActor(session),
            getRequestId(request)
        );
    }
}
