import { Controller, Get, Post } from '@nestjs/common';
import { Session } from '@thallesp/nestjs-better-auth';
import type { BetterAuthSession } from '../better-auth/better-auth-session.type';
import { RbacDeclarePermissions } from '../system/discovery/discovery.decorators';
import { RBAC_PERMISSIONS } from '../system/rbac/rbac-permissions';
import { RbacTestService } from './rbac-test.service';

@Controller('rbac/test')
export class RbacTestController {
    constructor(private readonly testService: RbacTestService) {}

    /**
     * 测试台首页数据不挂具体权限点。
     *
     * 这个接口的目的只是让前端拿到“当前用户对每个测试权限是否 allowed”的展示数据；
     * 真正验证 RBAC 裁决结果，要调用下面那些挂了 @RbacDeclarePermissions 的接口。
     */
    @Get('overview')
    async getOverview(@Session() session: BetterAuthSession) {
        return await this.testService.getOverview(session.user.id);
    }

    /**
     * 普通 code 权限示例：装饰器只声明 permissionCode。
     * RBAC checker 会把 permissionCode 当作 permission code，到用户 effective 权限集合里判断是否拥有。
     */
    @Get('view')
    @RbacDeclarePermissions({
        permissionCode: RBAC_PERMISSIONS.TEST_VIEW,
        name: '查看测试台',
        kind: 'ACTION'
    })
    async view(@Session() session: BetterAuthSession) {
        return this.testService.createActionResult(session.user.id, 'view');
    }

    /**
     * read/create/update/delete/manage 这些基础动作故意拆成多个接口，
     * 方便在页面上分别给角色分配权限后，逐个验证允许和拒绝结果。
     */
    @Get('read')
    @RbacDeclarePermissions({
        permissionCode: RBAC_PERMISSIONS.TEST_READ,
        name: '读取测试台',
        kind: 'ACTION'
    })
    async read(@Session() session: BetterAuthSession) {
        return this.testService.createActionResult(session.user.id, 'read');
    }

    @Post('create')
    @RbacDeclarePermissions({
        permissionCode: RBAC_PERMISSIONS.TEST_CREATE,
        name: '创建测试数据',
        kind: 'ACTION'
    })
    async create(@Session() session: BetterAuthSession) {
        return this.testService.createActionResult(session.user.id, 'create');
    }

    @Post('update')
    @RbacDeclarePermissions({
        permissionCode: RBAC_PERMISSIONS.TEST_UPDATE,
        name: '更新测试数据',
        kind: 'ACTION'
    })
    async update(@Session() session: BetterAuthSession) {
        return this.testService.createActionResult(session.user.id, 'update');
    }

    @Post('delete')
    @RbacDeclarePermissions({
        permissionCode: RBAC_PERMISSIONS.TEST_DELETE,
        name: '删除测试数据',
        kind: 'ACTION'
    })
    async delete(@Session() session: BetterAuthSession) {
        return this.testService.createActionResult(session.user.id, 'delete');
    }

    @Post('admin')
    @RbacDeclarePermissions({
        permissionCode: RBAC_PERMISSIONS.TEST_ADMIN,
        name: '管理测试台',
        kind: 'ACTION'
    })
    async admin(@Session() session: BetterAuthSession) {
        return this.testService.createActionResult(session.user.id, 'admin');
    }

    @Post('profile')
    @RbacDeclarePermissions({
        permissionCode: RBAC_PERMISSIONS.TEST_PROFILE,
        name: '维护测试资料',
        kind: 'ACTION'
    })
    async profile(@Session() session: BetterAuthSession) {
        return this.testService.createActionResult(session.user.id, 'profile');
    }

    @Post('approve')
    @RbacDeclarePermissions({
        permissionCode: RBAC_PERMISSIONS.TEST_APPROVE,
        name: '审批测试数据',
        kind: 'ACTION'
    })
    async approve(@Session() session: BetterAuthSession) {
        return this.testService.createActionResult(session.user.id, 'approve');
    }

    @Post('publish')
    @RbacDeclarePermissions({
        permissionCode: RBAC_PERMISSIONS.TEST_PUBLISH,
        name: '发布测试数据',
        kind: 'ACTION'
    })
    async publish(@Session() session: BetterAuthSession) {
        return this.testService.createActionResult(session.user.id, 'publish');
    }

    /**
     * 多权限示例：一个接口可以声明多个 permissionCode。
     *
     * RbacGuard 默认使用 all 语义，下面四个 code 都通过后才会进入 handler。
     */
    @Post('multi')
    @RbacDeclarePermissions(
        {
            permissionCode: RBAC_PERMISSIONS.TEST_READ,
            name: '读取测试台',
            kind: 'ACTION'
        },
        {
            permissionCode: RBAC_PERMISSIONS.TEST_PROFILE,
            name: '维护测试资料',
            kind: 'ACTION'
        },
        {
            permissionCode: RBAC_PERMISSIONS.TEST_APPROVE,
            name: '审批测试数据',
            kind: 'ACTION'
        },
        {
            permissionCode: RBAC_PERMISSIONS.TEST_PUBLISH,
            name: '发布测试数据',
            kind: 'ACTION'
        }
    )
    async multi(@Session() session: BetterAuthSession) {
        return this.testService.createMultiPermissionResult(session.user.id);
    }
}
