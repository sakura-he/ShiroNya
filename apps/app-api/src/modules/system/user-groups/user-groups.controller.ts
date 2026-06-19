import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ZodValidationPipe } from '@app/common';
import { Session } from '@thallesp/nestjs-better-auth';
import { z } from 'zod';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import {
    AssignUserGroupMemberDto,
    AssignUserGroupRoleDto,
    CreateUserGroupDto,
    QueryUserGroupListDto,
    QueryUserGroupRelationMemberDto,
    QueryUserGroupRelationMenuDto,
    QueryUserGroupRelationRoleDto,
    UpdateUserGroupDto
} from './dto/user-group.dto';
import { SystemUserGroupsService } from './user-groups.service';

/**
 * 用户组管理控制器，负责用户组元数据和 RBAC 授权关系维护。
 */
@Controller('user-group')
export class SystemUserGroupsController {
    constructor(private readonly userGroupService: SystemUserGroupsService) {}

    /**
     * 查询用户组分页列表。
     */
    @RbacPermission('system.user-group.view')
    @Post('query_user_group_list')
    async getUserGroupList(@Session() session: BetterAuthSession, @Body() query: QueryUserGroupListDto) {
        return await this.userGroupService.getUserGroupList(query, session.user.id);
    }

    /**
     * 查询用户组详情。
     */
    @RbacPermission('system.user-group.view')
    @Get('detail')
    async getUserGroupDetail(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number
    ) {
        return await this.userGroupService.getUserGroupByIdForViewer(id, session.user.id);
    }

    /**
     * 查询用户组的 RBAC 关系视图。
     */
    @RbacPermission('system.user-group.view')
    @Get('relations')
    async getUserGroupRelations(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number
    ) {
        return await this.userGroupService.getUserGroupRelations(id, session.user.id);
    }

    /**
     * 分页查询用户组成员分配表。
     */
    @RbacPermission('system.user-group.view')
    @Post('query_relation_members')
    async queryRelationMembers(@Session() session: BetterAuthSession, @Body() query: QueryUserGroupRelationMemberDto) {
        return await this.userGroupService.getUserGroupRelationMembers(query, session.user.id);
    }

    /**
     * 分页查询用户组继承角色表。
     */
    @RbacPermission('system.user-group.view')
    @Post('query_relation_roles')
    async queryRelationRoles(@Session() session: BetterAuthSession, @Body() query: QueryUserGroupRelationRoleDto) {
        return await this.userGroupService.getUserGroupRelationRoles(query, session.user.id);
    }

    /**
     * 分页查询用户组可见菜单表。
     */
    @RbacPermission('system.user-group.view')
    @Post('query_relation_menus')
    async queryRelationMenus(@Session() session: BetterAuthSession, @Body() query: QueryUserGroupRelationMenuDto) {
        return await this.userGroupService.getUserGroupRelationMenus(query, session.user.id);
    }

    /**
     * 创建用户组。
     */
    @RbacPermission('system.user-group.view')
    @Post('create_user_group')
    async createUserGroup(@Session() session: BetterAuthSession, @Body() data: CreateUserGroupDto) {
        return await this.userGroupService.createUserGroup(session.user.id, data);
    }

    /**
     * 更新用户组。
     */
    @RbacPermission('system.user-group.view')
    @Post('update_user_group')
    async updateUserGroup(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number,
        @Body() data: UpdateUserGroupDto
    ) {
        return await this.userGroupService.updateUserGroup(id, data, session.user.id);
    }

    /**
     * 替换用户组成员关系。
     */
    @RbacPermission('system.user-group.view')
    @Post('assign_members')
    async assignMembers(@Session() session: BetterAuthSession, @Body() data: AssignUserGroupMemberDto) {
        return await this.userGroupService.assignMembers(data.groupId, data.userIds, session.user.id);
    }

    /**
     * 替换用户组继承角色关系。
     */
    @RbacPermission('system.user-group.view')
    @Post('assign_roles')
    async assignRoles(@Session() session: BetterAuthSession, @Body() data: AssignUserGroupRoleDto) {
        return await this.userGroupService.assignRoles(data.groupId, data.roleIds, session.user.id);
    }

    /**
     * 删除用户组。
     */
    @RbacPermission('system.user-group.view')
    @Post('delete_user_group')
    async deleteUserGroup(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number
    ) {
        await this.userGroupService.deleteUserGroup(id, session.user.id);
        return null;
    }
}
