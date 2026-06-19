import { PrismaService } from '@app/prisma-admin';
import { RbacStatus } from '@app/prisma-admin/generated/client';
import { Injectable } from '@nestjs/common';
import { RbacAuthorizationService } from '../system/rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../system/rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../system/rbac/rbac-permissions';
import {
    RBAC_TEST_PERMISSION_DEFINITIONS,
    getRbacTestPermissionDefinition,
    type RbacTestActionKey
} from './rbac-test.definitions';

@Injectable()
export class RbacTestService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly authzService: RbacAuthorizationService,
        private readonly graphService: SystemRbacGraphService
    ) {}

    /**
     * 汇总测试台当前状态。
     *
     * 这里同时返回用户 effective read model 和每个测试权限的实时 RBAC 判断结果，
     * 方便页面确认“数据是否分配成功”和“后端守卫是否真的允许”。
     */
    async getOverview(userId: string) {
        const permissionCodes = RBAC_TEST_PERMISSION_DEFINITIONS.map((definition) => definition.code);
        const [decisions, effectiveState, permissionRows] = await Promise.all([
            this.authzService.checkPermissions(userId, permissionCodes),
            this.graphService.getUserEffectiveState(userId),
            this.prismaService.rbacPermission.findMany({
                where: {
                    code: {
                        in: permissionCodes
                    },
                    deletedAt: null
                },
                select: {
                    id: true,
                    code: true,
                    status: true
                }
            })
        ]);
        const permissionByCode = new Map(permissionRows.map((permission) => [permission.code, permission]));

        return {
            user: {
                id: userId
            },
            effectiveState,
            permissions: RBAC_TEST_PERMISSION_DEFINITIONS.map((definition) => {
                const permission = permissionByCode.get(definition.code);
                return {
                    ...definition,
                    permissionId: permission?.id ?? null,
                    exists: Boolean(permission),
                    enabled: permission?.status === RbacStatus.ENABLE,
                    allowed: decisions.get(definition.code) ?? false
                };
            })
        };
    }

    /**
     * 普通测试接口进入 handler 后返回的统一结果。
     *
     * 能执行到这里说明 RbacGuard 已经完成 RBAC code membership 校验；
     * checkedBy/spicedb 字段是为了让前端页面直观看到本接口没有走 SpiceDB。
     */
    createActionResult(userId: string, actionKey: Exclude<RbacTestActionKey, 'multi'>) {
        const definition = getRbacTestPermissionDefinition(actionKey);
        return {
            ok: true,
            userId,
            action: definition.key,
            permissionCode: definition.code,
            method: definition.method,
            path: definition.path,
            checkedBy: 'rbac-authz-guard',
            spicedb: 'not-used'
        };
    }

    /**
     * 多权限测试接口的响应体。
     *
     * handler 本身不重复做授权；进入这里之前 RbacGuard 已经按 all 语义检查了多个 permissionCode。
     */
    createMultiPermissionResult(userId: string) {
        return {
            ok: true,
            userId,
            action: 'multi' as const,
            checkedBy: 'rbac-authz-guard',
            spicedb: 'not-used',
            requiredPermissions: [
                RBAC_PERMISSIONS.TEST_READ,
                RBAC_PERMISSIONS.TEST_PROFILE,
                RBAC_PERMISSIONS.TEST_APPROVE,
                RBAC_PERMISSIONS.TEST_PUBLISH
            ]
        };
    }
}
