import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { Session } from '@thallesp/nestjs-better-auth';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import {
    AssignMenuRoleDto,
    CreateButtonDto,
    CreateCatalogDto,
    CreateMenuSchema,
    CreatePageDto,
    QueryMenuListDto,
    QueryMenuRelationRoleDto,
    QueryMenuTreeDto,
    QueryMenuVisibleUserDto,
    UpdateButtonDto,
    UpdateCatalogDto,
    UpdateMenuSchema,
    UpdatePageDto
} from './dto/menu.dto';
import type { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';
import { SystemRbacAssignmentsService } from '../assignments/assignments.service';
import { RbacPermission } from '../rbac/rbac-permission.decorator';
import { SystemMenusService } from './menus.service';

// 菜单管理控制器，当前仅要求已登录会话
@ApiExtraModels(CreateCatalogDto, CreatePageDto, CreateButtonDto, UpdateCatalogDto, UpdatePageDto, UpdateButtonDto)
@Controller('menu')
export class SystemMenusController {
    constructor(
        private readonly menuService: SystemMenusService,
        private readonly rbacAssignmentService: SystemRbacAssignmentsService
    ) {}

    /** 创建权限/菜单 */
    @RbacPermission('system.menu.view')
    @Post('create_menu')
    @ApiBody({
        schema: {
            oneOf: [
                { $ref: getSchemaPath(CreateCatalogDto) },
                { $ref: getSchemaPath(CreatePageDto) },
                { $ref: getSchemaPath(CreateButtonDto) }
            ]
        }
    })
    create_menu(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(CreateMenuSchema)) createMenuDto: CreateMenuDto
    ) {
        return this.menuService.create_menu(createMenuDto, session.user.id);
    }

    /** 查询所有权限/菜单 */
    @RbacPermission('system.menu.view')
    @Post('query_all_menus')
    findAll(@Session() session: BetterAuthSession, @Body() query: QueryMenuListDto) {
        return this.menuService.findAll(query, session.user.id);
    }

    /** 查询菜单树 */
    @RbacPermission('system.menu.view')
    @Post('query_menu_tree')
    getMenuTree(@Session() session: BetterAuthSession, @Body() query: QueryMenuTreeDto) {
        return this.menuService.findAll(query, session.user.id);
    }

    /** 分页查询菜单列表 */
    @RbacPermission('system.menu.view')
    @Post('query_menu_list')
    getMenuList(@Session() session: BetterAuthSession, @Body() query: QueryMenuListDto) {
        return this.menuService.getMenuList(query, session.user.id);
    }

    /** 查询菜单详情 */
    @RbacPermission('system.menu.view')
    @Get('detail')
    getMenuDetail(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number
    ) {
        return this.menuService.getMenuDetail(id, session.user.id);
    }

    /** 查询菜单的 RBAC 关系视图 */
    @RbacPermission('system.menu.view')
    @Get('get_menu_relations')
    getMenuRelations(
        @Session() session: BetterAuthSession,
        @Query('id', new ZodValidationPipe(z.coerce.number().int().positive())) id: number
    ) {
        return this.menuService.getMenuRelations(id, session.user.id);
    }

    /** 分页查询拥有菜单所需权限的角色表 */
    @RbacPermission('system.menu.view')
    @Post('query_relation_roles')
    async queryRelationRoles(@Session() session: BetterAuthSession, @Body() query: QueryMenuRelationRoleDto) {
        return await this.menuService.getMenuRelationRoles(query, session.user.id);
    }

    /** 分页查询菜单当前可见用户 */
    @RbacPermission('system.menu.view')
    @Post('query_visible_users')
    async queryVisibleUsers(@Session() session: BetterAuthSession, @Body() query: QueryMenuVisibleUserDto) {
        return await this.menuService.getMenuVisibleUsers(query, session.user.id);
    }

    /** 从菜单视角更新拥有菜单所需权限的角色 */
    @RbacPermission('system.menu.view')
    @Post('assign_roles')
    async assignRoles(@Session() session: BetterAuthSession, @Body() data: AssignMenuRoleDto) {
        await this.rbacAssignmentService.replaceMenuViewerRoles(data.menuId, data.roleIds, session.user.id);
        return null;
    }

    /** 查询单个权限/菜单详情 */
    @RbacPermission('system.menu.view')
    @Get(':id')
    findOne(@Session() session: BetterAuthSession, @Param('id') id: string) {
        return this.menuService.findOneForViewer(+id, session.user.id);
    }

    /** 更新权限/菜单 */
    @RbacPermission('system.menu.view')
    @Post('update_menu')
    @ApiBody({
        schema: {
            oneOf: [
                { $ref: getSchemaPath(UpdateCatalogDto) },
                { $ref: getSchemaPath(UpdatePageDto) },
                { $ref: getSchemaPath(UpdateButtonDto) }
            ]
        }
    })
    update(
        @Session() session: BetterAuthSession,
        @Body(new ZodValidationPipe(UpdateMenuSchema)) updateMenuDto: UpdateMenuDto
    ) {
        return this.menuService.update(updateMenuDto, session.user.id);
    }

    /** 删除权限/菜单 */
    @RbacPermission('system.menu.view')
    @Post('delete_menu')
    remove(@Session() session: BetterAuthSession, @Body('menu_id') id: number) {
        return this.menuService.deleteMenu(id, session.user.id);
    }
}
