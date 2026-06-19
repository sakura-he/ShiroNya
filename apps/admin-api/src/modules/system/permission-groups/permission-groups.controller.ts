import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import {
    AssignRbacPermissionGroupRelationsDto,
    CreateRbacPermissionGroupDto,
    QueryRbacPermissionGroupListDto,
    UpdateRbacPermissionGroupDto
} from '../rbac/dto/rbac.dto';
import { SystemRbacPermissionGroupsService } from './permission-groups.service';

@Controller('rbac/permission-group')
export class SystemRbacPermissionGroupsController {
    constructor(private readonly groupService: SystemRbacPermissionGroupsService) {}

    @Post('query_permission_group_list')
    async getGroupList(@Session() session: BetterAuthSession, @Body() query: QueryRbacPermissionGroupListDto) {
        return await this.groupService.getGroupList(query, session.user.id);
    }

    @Post('create_group')
    async createGroup(@Session() session: BetterAuthSession, @Body() data: CreateRbacPermissionGroupDto) {
        return await this.groupService.createGroup(data, session.user.id);
    }

    @Post('update_group')
    async updateGroup(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number,
        @Body() data: UpdateRbacPermissionGroupDto
    ) {
        return await this.groupService.updateGroup(id, data, session.user.id);
    }

    @Post('delete_group')
    async deleteGroup(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number
    ) {
        return await this.groupService.deleteGroup(id, session.user.id);
    }

    @Get('relations')
    async getGroupRelations(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number
    ) {
        return await this.groupService.getGroupRelations(id, session.user.id);
    }

    @Post('assign_relations')
    async assignRelations(@Session() session: BetterAuthSession, @Body() data: AssignRbacPermissionGroupRelationsDto) {
        return await this.groupService.assignRelations(data, session.user.id);
    }
}
