import { createRuntimeLogger } from '@app/common';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import {
    AssignUserGroupsDto,
    AssignUserRolesDto,
    BanUserDto,
    CreateUserDto,
    QueryUserAssignableRoleDto,
    QueryUserAssignableUserGroupDto,
    QueryUserListDto,
    QueryUserRelationMenuDto,
    QueryUserRelationRoleDto,
    QueryUserRelationUserGroupDto,
    QueryUserSessionsDto,
    ResetUserPasswordDto,
    RevokeUserSessionDto,
    UpdateUserDto,
    UserIdOnlyDto
} from './dto/user.dto';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { SystemRbacAssignmentsService } from '../assignments/assignments.service';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import { SystemUsersService } from './users.service';

@Controller({
    path: 'user'
})
// @SaveLog()
export class SystemUsersController {
    private readonly logger = createRuntimeLogger(SystemUsersController.name, {
        domain: 'user',
        resource: { type: 'user' }
    });

    constructor(
        private readonly userService: SystemUsersService,
        private readonly rbacAssignmentService: SystemRbacAssignmentsService
    ) {}

    /** 获取用户列表 */
    @RbacPermission('system.user.view')
    @Post('query_user_list')
    async getUserList(@Session() session: BetterAuthSession, @Body() query: QueryUserListDto) {
        return this.userService.getUserList(query, session.user.id);
    }

    /** 获取用户详情 */
    @RbacPermission('system.user.detail')
    @Get('detail')
    async getUserDetail(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.string().min(1))) id: string
    ) {
        return await this.userService.getUserDetail(id, session.user.id);
    }

    /** 查询用户的 RBAC 关系视图 */
    @RbacPermission('system.user.detail')
    @Get('get_user_relations')
    async getUserRelations(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.string().min(1))) id: string
    ) {
        return await this.userService.getUserRelations(id, session.user.id);
    }

    /** 分页查询用户角色关系 */
    @RbacPermission('system.user.detail')
    @Post('query_relation_roles')
    async queryRelationRoles(@Session() session: BetterAuthSession, @Body() query: QueryUserRelationRoleDto) {
        return await this.userService.getUserRelationRoles(query, session.user.id);
    }

    /** 分页查询用户所属用户组关系 */
    @RbacPermission('system.user.detail')
    @Post('query_relation_user_groups')
    async queryRelationUserGroups(@Session() session: BetterAuthSession, @Body() query: QueryUserRelationUserGroupDto) {
        return await this.userService.getUserRelationUserGroups(query, session.user.id);
    }

    /** 分页查询用户 RBAC 可见菜单 */
    @RbacPermission('system.user.detail')
    @Post('query_relation_menus')
    async queryRelationMenus(@Session() session: BetterAuthSession, @Body() query: QueryUserRelationMenuDto) {
        return await this.userService.getUserRelationMenus(query, session.user.id);
    }

    /** 分页查询用户可分配角色 */
    @RbacPermission('system.user.detail')
    @Post('query_assignable_roles')
    async queryAssignableRoles(@Session() session: BetterAuthSession, @Body() query: QueryUserAssignableRoleDto) {
        return await this.userService.getUserAssignableRoles(query, session.user.id);
    }

    /** 分页查询用户可分配用户组 */
    @RbacPermission('system.user.detail')
    @Post('query_assignable_user_groups')
    async queryAssignableUserGroups(
        @Session() session: BetterAuthSession,
        @Body() query: QueryUserAssignableUserGroupDto
    ) {
        return await this.userService.getUserAssignableUserGroups(query, session.user.id);
    }

    /** 创建用户 */
    @RbacPermission('system.user.view')
    @Post('create_user')
    async create(@Session() session: BetterAuthSession, @Body() data: CreateUserDto) {
        this.logger.debug.title('创建用户请求', { data });
        return this.userService.createUser(session.user.id, data);
    }

    /** 更新用户 */
    @RbacPermission('system.user.view')
    @Post('update_user')
    async updateUser(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.string().min(1))) id: string,
        @Body() data: UpdateUserDto
    ) {
        return await this.userService.updateUser(id, data, session.user.id);
    }

    /** 删除用户 */
    @RbacPermission('system.user.view')
    @Post('delete_user')
    async deleteUser(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.string().min(1))) id: string
    ) {
        return await this.userService.deleteUser(id, session.user.id);
    }

    /** 重置用户密码 */
    @RbacPermission('system.user.view')
    @Post('reset_password')
    async resetPassword(@Session() session: BetterAuthSession, @Body() data: ResetUserPasswordDto) {
        await this.userService.resetUserPassword(data.id, data.password, session.user.id);
        return null;
    }

    /** 封禁用户 */
    @RbacPermission('system.user.update')
    @Post('ban_user')
    async banUser(@Session() session: BetterAuthSession, @Body() data: BanUserDto) {
        return await this.userService.banUser(data.id, session.user.id, data.banReason);
    }

    /** 解封用户 */
    @RbacPermission('system.user.update')
    @Post('unban_user')
    async unbanUser(@Session() session: BetterAuthSession, @Body() data: UserIdOnlyDto) {
        return await this.userService.unbanUser(data.id, session.user.id);
    }

    /** 分页查询用户会话列表 */
    @RbacPermission('system.user.view')
    @Post('query_user_sessions')
    async queryUserSessions(@Session() session: BetterAuthSession, @Body() query: QueryUserSessionsDto) {
        return await this.userService.getUserSessionList(query, session.user.id);
    }

    /** 撤销用户全部会话 */
    @RbacPermission('system.user.view')
    @Post('revoke_user_sessions')
    async revokeUserSessions(@Session() session: BetterAuthSession, @Body() data: UserIdOnlyDto) {
        await this.userService.revokeUserSessions(data.id, session.user.id);
        return null;
    }

    /** 撤销用户单个会话 */
    @RbacPermission('system.user.session.revoke')
    @Post('revoke_user_session')
    async revokeUserSession(@Session() session: BetterAuthSession, @Body() data: RevokeUserSessionDto) {
        await this.userService.revokeUserSession(data.sessionToken, session.user.id);
        return null;
    }

    /** 替换用户直接角色 */
    @RbacPermission('system.user.detail')
    @Post('assign_roles')
    async assignRoles(@Session() session: BetterAuthSession, @Body() data: AssignUserRolesDto) {
        await this.rbacAssignmentService.replaceUserRoles(data.userId, data.roleIds, session.user.id);
        return null;
    }

    /** 替换用户所属用户组 */
    @RbacPermission('system.user.detail')
    @Post('assign_user_groups')
    async assignUserGroups(@Session() session: BetterAuthSession, @Body() data: AssignUserGroupsDto) {
        await this.rbacAssignmentService.replaceUserGroups(data.userId, data.groupIds, session.user.id);
        return null;
    }
}
