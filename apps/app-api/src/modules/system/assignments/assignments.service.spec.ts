import { PrismaService } from '@app/prisma-app';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import { SystemRbacAssignmentsService } from './assignments.service';

const mockPrismaService = {
    $transaction: jest.fn((handler: (tx: typeof mockPrismaService) => Promise<unknown>) => handler(mockPrismaService)),
    betterAuthUser: {
        findUnique: jest.fn(),
        count: jest.fn()
    },
    rbacRole: {
        findFirst: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn()
    },
    rbacUserGroup: {
        findFirst: jest.fn(),
        count: jest.fn()
    },
    rbacPermission: {
        findFirst: jest.fn(),
        count: jest.fn()
    },
    rbacMenu: {
        findUnique: jest.fn()
    },
    rbacUserRole: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    },
    rbacUserGroupMember: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    },
    rbacUserGroupRole: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    },
    rbacRoleInherit: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    },
    rbacRolePermission: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    }
};

const mockAuthzService = {
    assertPermission: jest.fn()
};

const mockGraphService = {
    applyRebuild: jest.fn(),
    getAffectedUserIdsByRoleIds: jest.fn(),
    getAffectedUserIdsByGroupIds: jest.fn(),
    getRoleDependentRoleIds: jest.fn()
};

const mockAdminUserStateService = {
    bumpRoleStateVersion: jest.fn()
};

describe('SystemRbacAssignmentsService', () => {
    let service: SystemRbacAssignmentsService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockAuthzService.assertPermission.mockResolvedValue(undefined);
        mockPrismaService.betterAuthUser.findUnique.mockResolvedValue({ id: 'u1' });
        mockPrismaService.betterAuthUser.count.mockImplementation(({ where }) => where.id.in.length);
        mockPrismaService.rbacRole.findFirst.mockImplementation(({ where }) => ({
            id: where.id,
            name: `role_${where.id}`
        }));
        mockPrismaService.rbacRole.count.mockImplementation(({ where }) => where.id.in.length);
        mockPrismaService.rbacRole.findMany.mockImplementation(({ where }) =>
            (where.id.in as number[]).map((id) => ({ id, name: `role_${id}` }))
        );
        mockPrismaService.rbacUserGroup.findFirst.mockImplementation(({ where }) => ({ id: where.id }));
        mockPrismaService.rbacUserGroup.count.mockImplementation(({ where }) => where.id.in.length);
        mockPrismaService.rbacPermission.findFirst.mockImplementation(({ where }) => ({
            id: where.id ?? 100,
            code: where.code ?? 'permission.code'
        }));
        mockPrismaService.rbacPermission.count.mockImplementation(({ where }) => where.id.in.length);
        mockPrismaService.rbacMenu.findUnique.mockResolvedValue({
            id: 10,
            requiredPermissionCode: 'menu.view'
        });
        mockPrismaService.rbacUserRole.findMany.mockResolvedValue([]);
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValue([]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([]);
        mockPrismaService.rbacRoleInherit.findMany.mockResolvedValue([]);
        mockPrismaService.rbacRolePermission.findMany.mockResolvedValue([]);
        mockGraphService.applyRebuild.mockResolvedValue(undefined);
        mockGraphService.getAffectedUserIdsByRoleIds.mockResolvedValue(['effective_user']);
        mockGraphService.getAffectedUserIdsByGroupIds.mockResolvedValue(['group_user']);
        mockGraphService.getRoleDependentRoleIds.mockImplementation(async (roleIds: number[]) => roleIds);
        mockAdminUserStateService.bumpRoleStateVersion.mockResolvedValue(undefined);

        service = new SystemRbacAssignmentsService(
            mockPrismaService as unknown as PrismaService,
            mockAuthzService as unknown as RbacAuthorizationService,
            mockGraphService as unknown as SystemRbacGraphService,
            mockAdminUserStateService as unknown as AdminUserStateService
        );
    });

    it('replaceUserRoles 去重写入并刷新用户 effective 与角色状态版本', async () => {
        mockPrismaService.rbacUserRole.findMany.mockResolvedValueOnce([{ roleId: 1 }]);

        await service.replaceUserRoles('u1', [2, 2, 3], 'operator');

        expect(mockAuthzService.assertPermission).toHaveBeenCalledWith('operator', RBAC_PERMISSIONS.USER_ASSIGN_ROLE);
        expect(mockPrismaService.rbacUserRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
        expect(mockPrismaService.rbacUserRole.createMany).toHaveBeenCalledWith({
            data: [
                { userId: 'u1', roleId: 2, createdBy: 'operator' },
                { userId: 'u1', roleId: 3, createdBy: 'operator' }
            ],
            skipDuplicates: true
        });
        expect(mockGraphService.applyRebuild).toHaveBeenCalledWith(['u1']);
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(1);
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(2);
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(3);
    });

    it('replaceUserGroups 替换用户所属用户组并刷新相关组角色状态', async () => {
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValueOnce([{ groupId: 1 }]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValueOnce([{ roleId: 7 }]);

        await service.replaceUserGroups('u1', [2, 2], 'operator');

        expect(mockAuthzService.assertPermission).toHaveBeenCalledWith(
            'operator',
            RBAC_PERMISSIONS.USER_ASSIGN_USER_GROUP
        );
        expect(mockPrismaService.rbacUserGroupMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
        expect(mockPrismaService.rbacUserGroupMember.createMany).toHaveBeenCalledWith({
            data: [{ userId: 'u1', groupId: 2, createdBy: 'operator' }],
            skipDuplicates: true
        });
        expect(mockGraphService.applyRebuild).toHaveBeenCalledWith(['u1']);
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(7);
    });

    it('replaceGroupMembers 替换组成员并按原成员和目标成员重建 effective', async () => {
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValueOnce([{ userId: 'old_user' }]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValueOnce([{ roleId: 3 }]);

        await service.replaceGroupMembers(10, ['u1', 'u1', 'u2'], 'operator');

        expect(mockAuthzService.assertPermission).toHaveBeenCalledWith(
            'operator',
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_MEMBER
        );
        expect(mockPrismaService.rbacUserGroupMember.deleteMany).toHaveBeenCalledWith({ where: { groupId: 10 } });
        expect(mockPrismaService.rbacUserGroupMember.createMany).toHaveBeenCalledWith({
            data: [
                { groupId: 10, userId: 'u1', createdBy: 'operator' },
                { groupId: 10, userId: 'u2', createdBy: 'operator' }
            ],
            skipDuplicates: true
        });
        expect(mockGraphService.applyRebuild).toHaveBeenCalledWith(['old_user', 'u1', 'u2']);
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(3);
    });

    it('replaceGroupRoles 替换组角色并刷新组成员 effective', async () => {
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValueOnce([{ roleId: 1 }]);
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValueOnce([{ userId: 'u1' }]);

        await service.replaceGroupRoles(10, [2, 2], 'operator');

        expect(mockPrismaService.rbacUserGroupRole.deleteMany).toHaveBeenCalledWith({ where: { groupId: 10 } });
        expect(mockPrismaService.rbacUserGroupRole.createMany).toHaveBeenCalledWith({
            data: [{ groupId: 10, roleId: 2, createdBy: 'operator' }],
            skipDuplicates: true
        });
        expect(mockGraphService.applyRebuild).toHaveBeenCalledWith(['u1']);
    });

    it('replaceRoleUsers 和 replaceRoleGroups 都只通过 assignment 中心写关系', async () => {
        mockPrismaService.rbacUserRole.findMany.mockResolvedValueOnce([{ userId: 'old_user' }]);
        await service.replaceRoleUsers(1, ['u1', 'u1'], 'operator');
        expect(mockPrismaService.rbacUserRole.deleteMany).toHaveBeenCalledWith({ where: { roleId: 1 } });
        expect(mockPrismaService.rbacUserRole.createMany).toHaveBeenCalledWith({
            data: [{ roleId: 1, userId: 'u1', createdBy: 'operator' }],
            skipDuplicates: true
        });
        expect(mockGraphService.applyRebuild).toHaveBeenCalledWith(['old_user', 'u1']);

        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValueOnce([{ groupId: 8 }]);
        await service.replaceRoleGroups(1, [9, 9], 'operator');
        expect(mockPrismaService.rbacUserGroupRole.deleteMany).toHaveBeenCalledWith({ where: { roleId: 1 } });
        expect(mockPrismaService.rbacUserGroupRole.createMany).toHaveBeenCalledWith({
            data: [{ roleId: 1, groupId: 9, createdBy: 'operator' }],
            skipDuplicates: true
        });
        expect(mockGraphService.getAffectedUserIdsByGroupIds).toHaveBeenCalledWith([8, 9, 9]);
    });

    it('replaceRoleParentRoles 拒绝父角色自循环并替换合法父角色', async () => {
        await expect(service.replaceRoleParentRoles(1, [1], 'operator')).rejects.toBeInstanceOf(Error);

        await service.replaceRoleParentRoles(1, [2, 2], 'operator');

        expect(mockPrismaService.rbacRoleInherit.deleteMany).toHaveBeenCalledWith({ where: { roleId: 1 } });
        expect(mockPrismaService.rbacRoleInherit.createMany).toHaveBeenCalledWith({
            data: [{ roleId: 1, parentRoleId: 2, createdBy: 'operator' }],
            skipDuplicates: true
        });
        expect(mockGraphService.getAffectedUserIdsByRoleIds).toHaveBeenCalledWith([1, 1]);
    });

    it('replaceRolePermissions 和 replacePermissionRoles 统一维护角色权限关系', async () => {
        await service.replaceRolePermissions(1, [100, 100, 101], 'operator');
        expect(mockPrismaService.rbacRolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 1 } });
        expect(mockPrismaService.rbacRolePermission.createMany).toHaveBeenCalledWith({
            data: [
                { roleId: 1, permissionId: 100, createdBy: 'operator' },
                { roleId: 1, permissionId: 101, createdBy: 'operator' }
            ],
            skipDuplicates: true
        });

        mockPrismaService.rbacRolePermission.findMany.mockResolvedValueOnce([{ roleId: 3 }]);
        await service.replacePermissionRoles(100, [4, 4], 'operator');
        expect(mockPrismaService.rbacRolePermission.deleteMany).toHaveBeenCalledWith({
            where: { permissionId: 100 }
        });
        expect(mockPrismaService.rbacRolePermission.createMany).toHaveBeenCalledWith({
            data: [{ roleId: 4, permissionId: 100, createdBy: 'operator' }],
            skipDuplicates: true
        });
        expect(mockGraphService.getAffectedUserIdsByRoleIds).toHaveBeenCalledWith([3, 4, 4]);
    });

    it('replaceMenuViewerRoles 通过菜单 requiredPermissionCode 替换拥有该菜单权限的角色集合', async () => {
        mockPrismaService.rbacRolePermission.findMany.mockResolvedValueOnce([{ roleId: 1 }]);

        await service.replaceMenuViewerRoles(10, [2, 2], 'operator');

        expect(mockAuthzService.assertPermission).toHaveBeenCalledWith(
            'operator',
            RBAC_PERMISSIONS.SYSTEM_MENU_ASSIGN_ROLE
        );
        expect(mockPrismaService.rbacRolePermission.deleteMany).toHaveBeenCalledWith({
            where: { permissionId: 100 }
        });
        expect(mockPrismaService.rbacRolePermission.createMany).toHaveBeenCalledWith({
            data: [{ roleId: 2, permissionId: 100, createdBy: 'operator' }],
            skipDuplicates: true
        });
        expect(mockGraphService.getAffectedUserIdsByRoleIds).toHaveBeenCalledWith([1, 2, 2]);
    });
});
