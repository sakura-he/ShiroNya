import { PrismaService } from '@app/prisma-admin';
import { RbacStatus } from '@app/prisma-admin/generated/client';
import { AuthzObjectExceptionService } from '../../authz-object-exception/authz-object-exception.service';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import { SystemRolesService } from './roles.service';

const mockPrismaService = {
    $transaction: jest.fn((handlerOrQueries: unknown) => {
        if (typeof handlerOrQueries === 'function') {
            return handlerOrQueries(mockPrismaService);
        }
        return Promise.all(handlerOrQueries as Promise<unknown>[]);
    }),
    rbacRole: {
        findManyAndCount: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn()
    },
    betterAuthUser: {
        findManyAndCount: jest.fn(),
        count: jest.fn()
    },
    rbacUserGroup: {
        findManyAndCount: jest.fn(),
        count: jest.fn()
    },
    rbacUserRole: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    },
    rbacUserGroupRole: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    },
    rbacUserGroupMember: {
        findMany: jest.fn()
    },
    rbacRoleInherit: {
        findMany: jest.fn()
    },
    rbacRolePermission: {
        findMany: jest.fn()
    },
    authzResourceRoleBinding: {
        deleteMany: jest.fn()
    }
};

const mockAdminUserStateService = {
    bumpRoleStateVersion: jest.fn()
};

const mockRbacAuthorizationService = {
    assertPermission: jest.fn(),
    checkPermission: jest.fn(),
    checkPermissions: jest.fn()
};

const mockRbacGraphService = {
    getRoleEffectiveUserIds: jest.fn(),
    getAffectedUserIdsByRoleIds: jest.fn(),
    getRoleClosure: jest.fn(),
    applyRebuild: jest.fn()
};

const mockAuthzObjectExceptionService = {
    cleanupDeletedRole: jest.fn()
};

function createRole(id = 1) {
    const now = new Date('2026-04-27T00:00:00.000Z');
    return {
        id,
        name: '管理员',
        code: 'admin',
        description: null,
        status: RbacStatus.ENABLE,
        isSuperAdmin: false,
        isBuiltin: false,
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now
    };
}

describe('SystemRolesService', () => {
    let service: SystemRolesService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRbacAuthorizationService.assertPermission.mockResolvedValue(undefined);
        mockRbacAuthorizationService.checkPermission.mockResolvedValue(true);
        mockRbacAuthorizationService.checkPermissions.mockResolvedValue(
            new Map([
                [RBAC_PERMISSIONS.SYSTEM_ROLE_UPDATE, true],
                [RBAC_PERMISSIONS.SYSTEM_ROLE_DELETE, true],
                [RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER, true],
                [RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_USER_GROUP, true],
                [RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_CAPABILITY, false],
                [RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_RESOURCE, false]
            ])
        );
        mockRbacGraphService.getRoleEffectiveUserIds.mockResolvedValue(['u1', 'u2']);
        mockRbacGraphService.getAffectedUserIdsByRoleIds.mockResolvedValue([]);
        mockRbacGraphService.getRoleClosure.mockResolvedValue([1]);
        mockRbacGraphService.applyRebuild.mockResolvedValue(undefined);
        mockAdminUserStateService.bumpRoleStateVersion.mockResolvedValue(undefined);
        mockAuthzObjectExceptionService.cleanupDeletedRole.mockResolvedValue(undefined);

        service = new SystemRolesService(
            mockPrismaService as unknown as PrismaService,
            mockAdminUserStateService as unknown as AdminUserStateService,
            mockRbacAuthorizationService as unknown as RbacAuthorizationService,
            mockRbacGraphService as unknown as SystemRbacGraphService,
            mockAuthzObjectExceptionService as unknown as AuthzObjectExceptionService
        );
    });

    it('查询角色关系时，应从 RBAC 源表和 effective 读模型返回关系 ID', async () => {
        const role = createRole();
        mockPrismaService.rbacRole.findFirst.mockResolvedValue(role);
        mockPrismaService.rbacUserRole.findMany.mockResolvedValue([{ userId: 'u1' }]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([{ groupId: 2 }]);
        mockPrismaService.rbacRoleInherit.findMany.mockResolvedValue([]);
        mockPrismaService.rbacRolePermission.findMany.mockResolvedValue([]);

        const result = await service.getRoleRelations(role.id, 'operator_1');

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_ROLE_VIEW
        );
        expect(mockRbacGraphService.getRoleEffectiveUserIds).toHaveBeenCalledWith(role.id);
        expect(result.directUserIds).toEqual(['u1']);
        expect(result.userGroupIds).toEqual([2]);
        expect(result.effectiveUserIds).toEqual(['u1', 'u2']);
        expect(result.role.viewerCanAssignUser).toBe(true);
    });

    it('删除角色时，应清理关系授权残留并软删除 RBAC 角色', async () => {
        const role = createRole();
        const deletedRole = {
            ...role,
            deletedAt: new Date('2026-04-28T00:00:00.000Z')
        };
        mockPrismaService.rbacRole.findFirst.mockResolvedValue(role);
        mockPrismaService.rbacUserRole.findMany.mockResolvedValue([]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([]);
        mockPrismaService.rbacRole.update.mockResolvedValue(deletedRole);
        mockRbacGraphService.getAffectedUserIdsByRoleIds.mockResolvedValue(['u_child']);

        await expect(service.deleteRole(role.id, 'operator_1')).resolves.toBe(deletedRole);

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_ROLE_DELETE
        );
        expect(mockAuthzObjectExceptionService.cleanupDeletedRole).toHaveBeenCalledWith(role.id);
        expect(mockPrismaService.authzResourceRoleBinding.deleteMany).toHaveBeenCalledWith({
            where: {
                roleId: role.id
            }
        });
        expect(mockPrismaService.rbacRole.update).toHaveBeenCalledWith({
            where: {
                id: role.id
            },
            data: {
                deletedAt: expect.any(Date),
                updatedBy: 'operator_1'
            }
        });
        expect(mockRbacGraphService.getAffectedUserIdsByRoleIds).toHaveBeenCalledWith([role.id]);
        expect(mockRbacGraphService.applyRebuild).toHaveBeenCalledWith(['u_child']);
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(role.id);
    });
});
