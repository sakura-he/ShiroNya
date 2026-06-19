import { BusinessException, ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-app';
import { RbacStatus } from '@app/prisma-app/generated/client';
import {
    RbacAuthorizationServiceBase,
    type RbacAuthorizationErrorFactory,
    type RbacAuthorizationStore,
    type RbacAuthorizationCheckOptions
} from '@app/rbac-core';
import { Injectable, Optional } from '@nestjs/common';
import { AdminErrorCodes } from '../../../common/constants/index';
import { SystemRbacEffectivePermissionCacheService } from './rbac-effective-permission-cache.service';

export type { RbacAuthorizationCheckOptions };

class AppRbacAuthorizationStore implements RbacAuthorizationStore {
    constructor(private readonly prismaService: PrismaService) {}

    async assertPermissionConfigured(permissionCode: string): Promise<void> {
        const permission = await this.prismaService.rbacPermission.findFirst({
            where: {
                code: permissionCode,
                deletedAt: null,
                status: RbacStatus.ENABLE
            },
            select: {
                id: true
            }
        });
        if (!permission) {
            throw createRbacAuthorizationErrors().configInvalid({
                summary: 'RBAC 要检查的权限 code 不存在或未启用',
                code: permissionCode
            });
        }
    }

    async assertPermissionsConfigured(permissionCodes: string[]): Promise<void> {
        const permissions = await this.prismaService.rbacPermission.findMany({
            where: {
                code: {
                    in: permissionCodes
                },
                deletedAt: null,
                status: RbacStatus.ENABLE
            },
            select: {
                code: true
            }
        });
        const configuredCodes = new Set(permissions.map((permission) => permission.code));
        const missingCodes = permissionCodes.filter((code) => !configuredCodes.has(code));
        if (missingCodes.length > 0) {
            throw createRbacAuthorizationErrors().configInvalid({
                summary: 'RBAC 要检查的权限 code 不存在或未启用',
                codes: missingCodes
            });
        }
    }

    async hasEffectiveSuperAdminRole(userId: string): Promise<boolean> {
        const role = await this.prismaService.rbacEffectiveUserRole.findFirst({
            where: {
                userId,
                role: {
                    isSuperAdmin: true,
                    status: RbacStatus.ENABLE,
                    deletedAt: null
                }
            },
            select: {
                roleId: true
            }
        });
        return Boolean(role);
    }

    async getAllEnabledPermissionCodes(): Promise<string[]> {
        const permissions = await this.prismaService.rbacPermission.findMany({
            where: {
                status: RbacStatus.ENABLE,
                deletedAt: null
            },
            select: {
                code: true
            },
            orderBy: {
                id: 'asc'
            }
        });
        return permissions.map((permission) => permission.code);
    }

    async getEffectivePermissionCodesForUser(userId: string): Promise<string[]> {
        const rows = await this.prismaService.rbacEffectiveUserPermission.findMany({
            where: {
                userId,
                permission: {
                    status: RbacStatus.ENABLE,
                    deletedAt: null
                }
            },
            select: {
                permission: {
                    select: {
                        code: true
                    }
                }
            },
            orderBy: {
                permissionId: 'asc'
            }
        });
        return rows.map((row) => row.permission.code);
    }
}

function createRbacAuthorizationErrors(): RbacAuthorizationErrorFactory {
    return {
        permissionDenied: ({ userId, permissionCode }) =>
            new BusinessException(ErrorCodes.ROLE.PERMISSION_DENIED, {
                summary: 'RBAC 权限校验失败',
                userId,
                permissionCode
            }),
        configInvalid: (payload) => new BusinessException(AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID, payload)
    };
}

/**
 * RBAC 自身的授权入口。
 *
 * 当前只做 RBAC code membership：用户最终拥有的权限来自 effective read model。
 */
@Injectable()
export class RbacAuthorizationService extends RbacAuthorizationServiceBase {
    constructor(
        prismaService: PrismaService,
        @Optional() effectivePermissionCache?: SystemRbacEffectivePermissionCacheService
    ) {
        super(new AppRbacAuthorizationStore(prismaService), createRbacAuthorizationErrors(), effectivePermissionCache);
    }
}
