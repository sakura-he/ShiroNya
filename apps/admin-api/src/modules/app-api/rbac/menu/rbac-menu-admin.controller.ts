import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import type { BetterAuthSession } from '../../../better-auth/better-auth-session.type';
import {
    CreateMenuSchema,
    QueryMenuListDto,
    QueryMenuTreeDto,
    UpdateMenuSchema,
    type CreateMenuDto,
    type UpdateMenuDto
} from '../../../system/menus/dto/menu.dto';
import { RbacPermission } from '../../../system/rbac/rbac-permission.decorator';
import { RBAC_PERMISSIONS } from '../../../system/rbac/rbac-permissions';
import { getActor, getRequestId, PositiveIntPipe, type ShiroRequest } from '../rbac-admin.controller-utils';
import { RbacAdminService } from '../rbac-admin.service';

@Controller('app-api/rbac/menu')
export class RbacMenuAdminController {
    constructor(private readonly rbacAdminService: RbacAdminService) {}

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_MENU_VIEW)
    @Post('query_all_menus')
    async getAllMenus(
        @Session() session: BetterAuthSession,
        @Body() query: QueryMenuListDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleMenuAction('list', query, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_MENU_VIEW)
    @Post('query_menu_tree')
    async getMenuTree(
        @Session() session: BetterAuthSession,
        @Body() query: QueryMenuTreeDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleMenuAction('tree', query, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_MENU_VIEW)
    @Post('query_menu_list')
    async getMenuList(
        @Session() session: BetterAuthSession,
        @Body() query: QueryMenuListDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleMenuAction(
            'pagedList',
            query,
            getActor(session),
            getRequestId(request)
        );
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_MENU_VIEW)
    @Get('detail')
    async getMenuDetail(
        @Session() session: BetterAuthSession,
        @Query('id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleMenuAction('detail', { id }, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_MENU_CREATE)
    @Post('create_menu')
    async createMenu(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(CreateMenuSchema)) data: CreateMenuDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleMenuAction('create', data, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_MENU_UPDATE)
    @Post('update_menu')
    async updateMenu(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(UpdateMenuSchema)) data: UpdateMenuDto,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleMenuAction('update', data, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_RBAC_MENU_DELETE)
    @Post('delete_menu')
    async deleteMenu(
        @Session() session: BetterAuthSession,
        @Body('menu_id', PositiveIntPipe) id: number,
        @Req() request: ShiroRequest
    ) {
        return await this.rbacAdminService.handleMenuAction('delete', { id }, getActor(session), getRequestId(request));
    }
}
