import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import {
    AssignRbacPermissionRolesDto,
    CreateRbacPermissionDto,
    QueryRbacPermissionRolesDto,
    QueryRbacPermissionListDto,
    SuggestRbacPermissionCodeDto,
    UpdateRbacPermissionDto
} from '../rbac/dto/rbac.dto';
import { SystemRbacAssignmentsService } from '../assignments/assignments.service';
import { SystemRbacPermissionsService } from './permissions.service';

@Controller('rbac/permission')
export class SystemRbacPermissionsController {
    constructor(
        private readonly permissionService: SystemRbacPermissionsService,
        private readonly assignmentService: SystemRbacAssignmentsService
    ) {}

    @Post('query_permission_list')
    async getPermissionList(@Session() session: BetterAuthSession, @Body() query: QueryRbacPermissionListDto) {
        return await this.permissionService.getPermissionList(query, session.user.id);
    }

    @Get('declaration_board')
    async getDeclarationBoard(@Session() session: BetterAuthSession) {
        return await this.permissionService.getDeclarationBoard(session.user.id);
    }

    @Post('create_permission')
    async createPermission(@Session() session: BetterAuthSession, @Body() data: CreateRbacPermissionDto) {
        return await this.permissionService.createPermission(data, session.user.id);
    }

    @Post('suggest_code')
    async suggestCode(@Session() session: BetterAuthSession, @Body() data: SuggestRbacPermissionCodeDto) {
        return await this.permissionService.suggestCode(data, session.user.id);
    }

    @Post('update_permission')
    async updatePermission(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number,
        @Body() data: UpdateRbacPermissionDto
    ) {
        return await this.permissionService.updatePermission(id, data, session.user.id);
    }

    @Post('delete_permission')
    async deletePermission(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number
    ) {
        return await this.permissionService.deletePermission(id, session.user.id);
    }

    @Get('relations')
    async getPermissionRelations(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number
    ) {
        return await this.permissionService.getPermissionRelations(id, session.user.id);
    }

    @Post('query_relation_roles')
    async queryRelationRoles(@Session() session: BetterAuthSession, @Body() query: QueryRbacPermissionRolesDto) {
        return await this.permissionService.queryAssignableRoles(query, session.user.id);
    }

    @Post('assign_roles')
    async assignRoles(@Session() session: BetterAuthSession, @Body() data: AssignRbacPermissionRolesDto) {
        await this.assignmentService.replacePermissionRoles(data.permissionId, data.roleIds, session.user.id);
        return null;
    }
}
