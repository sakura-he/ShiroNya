import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { RbacPermission } from '../../system/rbac/rbac-permission.decorator';
import { RBAC_PERMISSIONS } from '../../system/rbac/rbac-permissions';
import {
    CreateUserDto,
    DeleteUserDto,
    QueryUserListDto,
    ResetUserPasswordDto,
    UpdateUserDto,
    UpdateUserStatusDto
} from './dto/user-admin.dto';
import { UserAdminService } from './user-admin.service';

type ShiroRequest = Request & {
    __shiroLogContext?: {
        requestId?: string;
    };
};

function getRequestId(request: ShiroRequest): string | undefined {
    return request.__shiroLogContext?.requestId;
}

function getActor(session: BetterAuthSession) {
    return {
        id: session.user.id,
        name: session.user.name || session.user.username || session.user.email
    };
}

@Controller({
    path: 'app-api/user'
})
export class UserAdminController {
    constructor(private readonly userAdminService: UserAdminService) {}

    @RbacPermission(RBAC_PERMISSIONS.APP_USER_VIEW)
    @Post('query_user_list')
    async getUserList(
        @Session() session: BetterAuthSession,
        @Body() query: QueryUserListDto,
        @Req() request: ShiroRequest
    ) {
        return await this.userAdminService.getUserList(query, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_USER_DETAIL)
    @Get('detail')
    async getUserDetail(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.string().min(1))) id: string,
        @Req() request: ShiroRequest
    ) {
        return await this.userAdminService.getUserDetail(id, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_USER_VIEW)
    @Get('get_role_list')
    async getRoleList(@Session() session: BetterAuthSession, @Req() request: ShiroRequest) {
        return await this.userAdminService.getRoleList(getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_USER_CREATE)
    @Post('create_user')
    async createUser(@Session() session: BetterAuthSession, @Body() data: CreateUserDto, @Req() request: ShiroRequest) {
        return await this.userAdminService.createUser(getActor(session), data, getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_USER_UPDATE)
    @Post('update_user')
    async updateUser(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.string().min(1))) id: string,
        @Body() data: UpdateUserDto,
        @Req() request: ShiroRequest
    ) {
        return await this.userAdminService.updateUser(id, data, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_USER_STATUS_UPDATE)
    @Post('update_status')
    async updateStatus(
        @Session() session: BetterAuthSession,
        @Body() data: UpdateUserStatusDto,
        @Req() request: ShiroRequest
    ) {
        return await this.userAdminService.updateUserStatus(data, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_USER_SOFT_DELETE)
    @Post('soft_delete')
    async softDelete(@Session() session: BetterAuthSession, @Body() data: DeleteUserDto, @Req() request: ShiroRequest) {
        return await this.userAdminService.softDeleteUser(data, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_USER_DELETE)
    @Post('delete')
    async deleteUser(@Session() session: BetterAuthSession, @Body() data: DeleteUserDto, @Req() request: ShiroRequest) {
        return await this.userAdminService.deleteUser(data, getActor(session), getRequestId(request));
    }

    @RbacPermission(RBAC_PERMISSIONS.APP_USER_RESET_PASSWORD)
    @Post('reset_password')
    async resetPassword(
        @Session() session: BetterAuthSession,
        @Body() data: ResetUserPasswordDto,
        @Req() request: ShiroRequest
    ) {
        return await this.userAdminService.resetUserPassword(data, getActor(session), getRequestId(request));
    }
}
