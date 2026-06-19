import { ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { RbacStatus } from '@app/prisma-admin/generated/client';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthzObjectExceptionService } from '../../authz-object-exception/authz-object-exception.service';
import { SystemRbacAssignmentsService } from '../assignments/assignments.service';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import { SystemRolesService } from '../roles/roles.service';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import { SystemUserGroupsService } from './user-groups.service';

const mockPrismaService = {
    $transaction: jest.fn((handlerOrQueries: unknown) => {
        if (typeof handlerOrQueries === 'function') {
            return handlerOrQueries(mockPrismaService);
        }
        return Promise.all(handlerOrQueries as Promise<unknown>[]);
    }),
    rbacUserGroup: {
        findManyAndCount: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn()
    },
    betterAuthUser: {
        findManyAndCount: jest.fn(),
        count: jest.fn()
    },
    rbacRole: {
        findMany: jest.fn(),
        findManyAndCount: jest.fn()
    },
    rbacMenu: {
        findManyAndCount: jest.fn()
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
    }
};

const mockRoleService = {
    checkHasRoles: jest.fn()
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
    getGroupVisibleMenuIds: jest.fn(),
    applyRebuild: jest.fn()
};

const mockRbacAssignmentService = {
    replaceGroupMembers: jest.fn(),
    replaceGroupRoles: jest.fn()
};

const mockAuthzObjectExceptionService = {
    cleanupDeletedResource: jest.fn()
};

function createGroup(status: RbacStatus = RbacStatus.ENABLE) {
    const now = new Date('2026-04-27T00:00:00.000Z');
    return {
        id: 10,
        name: '研发组',
        code: 'dev_group',
        description: null,
        status,
        createdBy: 'operator_1',
        updatedBy: 'operator_1',
        deletedAt: null,
        createdAt: now,
        updatedAt: now
    };
}

describe('SystemUserGroupsService', () => {
    let service: SystemUserGroupsService;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockRbacAuthorizationService.assertPermission.mockResolvedValue(undefined);
        mockRbacAuthorizationService.checkPermission.mockResolvedValue(true);
        mockRbacAuthorizationService.checkPermissions.mockResolvedValue(
            new Map([
                [RBAC_PERMISSIONS.SYSTEM_USER_GROUP_UPDATE, true],
                [RBAC_PERMISSIONS.SYSTEM_USER_GROUP_DELETE, true],
                [RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_MEMBER, true],
                [RBAC_PERMISSIONS.SYSTEM_USER_GROUP_ASSIGN_ROLE, true]
            ])
        );
        mockRbacGraphService.getGroupVisibleMenuIds.mockResolvedValue([100]);
        mockRbacGraphService.applyRebuild.mockResolvedValue(undefined);
        mockRbacAssignmentService.replaceGroupMembers.mockResolvedValue(null);
        mockRbacAssignmentService.replaceGroupRoles.mockResolvedValue(null);
        mockRoleService.checkHasRoles.mockResolvedValue(undefined);
        mockAdminUserStateService.bumpRoleStateVersion.mockResolvedValue(undefined);
        mockAuthzObjectExceptionService.cleanupDeletedResource.mockResolvedValue(undefined);
        mockPrismaService.rbacRole.findMany.mockResolvedValue([{ id: 1, name: '管理员' }]);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SystemUserGroupsService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: SystemRolesService, useValue: mockRoleService },
                { provide: AdminUserStateService, useValue: mockAdminUserStateService },
                { provide: RbacAuthorizationService, useValue: mockRbacAuthorizationService },
                { provide: SystemRbacAssignmentsService, useValue: mockRbacAssignmentService },
                { provide: SystemRbacGraphService, useValue: mockRbacGraphService },
                { provide: AuthzObjectExceptionService, useValue: mockAuthzObjectExceptionService }
            ]
        }).compile();

        service = module.get<SystemUserGroupsService>(SystemUserGroupsService);
    });

    it('创建用户组时，应写入 RBAC 用户组源表并返回当前关系视图', async () => {
        const group = createGroup();
        mockPrismaService.rbacUserGroup.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(group);
        mockPrismaService.rbacUserGroup.create.mockResolvedValue(group);
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValue([]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([]);

        const result = await service.createUserGroup('operator_1', {
            name: '研发组',
            code: 'dev_group',
            description: null,
            status: RbacStatus.ENABLE
        });

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_CREATE
        );
        expect(mockPrismaService.rbacUserGroup.create).toHaveBeenCalledWith({
            data: {
                name: '研发组',
                code: 'dev_group',
                description: null,
                status: RbacStatus.ENABLE,
                createdBy: 'operator_1',
                updatedBy: 'operator_1'
            }
        });
        expect(result).toMatchObject({
            id: 10,
            memberUserIds: [],
            roleIds: []
        });
    });

    it('更新用户组时，应更新 RBAC 元数据、重建读模型并刷新相关状态版本', async () => {
        const existingGroup = createGroup();
        const updatedGroup = createGroup(RbacStatus.DISABLE);
        mockPrismaService.rbacUserGroup.findFirst
            .mockResolvedValueOnce(existingGroup)
            .mockResolvedValueOnce(updatedGroup);
        mockPrismaService.rbacUserGroup.update.mockResolvedValue(updatedGroup);
        mockPrismaService.rbacUserGroupMember.findMany
            .mockResolvedValueOnce([{ groupId: 10, userId: 'u1' }])
            .mockResolvedValueOnce([{ groupId: 10, userId: 'u2' }]);
        mockPrismaService.rbacUserGroupRole.findMany
            .mockResolvedValueOnce([{ groupId: 10, roleId: 1 }])
            .mockResolvedValueOnce([{ groupId: 10, roleId: 1 }]);

        const result = await service.updateUserGroup(
            10,
            {
                status: RbacStatus.DISABLE
            },
            'operator_1'
        );

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_UPDATE
        );
        expect(mockPrismaService.rbacUserGroup.update).toHaveBeenCalledWith({
            where: {
                id: 10
            },
            data: {
                name: undefined,
                code: undefined,
                description: undefined,
                status: RbacStatus.DISABLE,
                updatedBy: 'operator_1'
            }
        });
        expect(mockRbacGraphService.applyRebuild).toHaveBeenCalledWith(['u1']);
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(1);
        expect(result).toMatchObject({
            id: 10,
            status: RbacStatus.DISABLE,
            memberUserIds: ['u2'],
            roleIds: [1]
        });
    });

    it('分配用户组成员时，应委托 RBAC assignment 中间层替换关系', async () => {
        const group = createGroup();
        mockPrismaService.rbacUserGroup.findFirst.mockResolvedValue(group);
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValue([{ groupId: 10, userId: 'u1' }]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([{ groupId: 10, roleId: 1 }]);

        await service.assignMembers(10, ['u1', 'u2'], 'operator_1');

        expect(mockRbacAssignmentService.replaceGroupMembers).toHaveBeenCalledWith(10, ['u1', 'u2'], 'operator_1');
        expect(mockPrismaService.rbacUserGroupMember.createMany).not.toHaveBeenCalled();
    });

    it('删除用户组时，应清理对象例外授权并软删除 RBAC 用户组', async () => {
        const group = createGroup();
        mockPrismaService.rbacUserGroup.findFirst.mockResolvedValue(group);
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValue([{ groupId: 10, userId: 'u1' }]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([{ groupId: 10, roleId: 1 }]);

        await service.deleteUserGroup(10, 'operator_1');

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_DELETE
        );
        expect(mockAuthzObjectExceptionService.cleanupDeletedResource).toHaveBeenCalledWith('user_group', '10');
        expect(mockPrismaService.rbacUserGroupMember.deleteMany).toHaveBeenCalledWith({ where: { groupId: 10 } });
        expect(mockPrismaService.rbacUserGroupRole.deleteMany).toHaveBeenCalledWith({ where: { groupId: 10 } });
        expect(mockPrismaService.rbacUserGroup.update).toHaveBeenCalledWith({
            where: {
                id: 10
            },
            data: {
                deletedAt: expect.any(Date),
                updatedBy: 'operator_1'
            }
        });
        expect(mockRbacGraphService.applyRebuild).toHaveBeenCalledWith(['u1']);
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(1);
    });

    it('查询用户组关系时，应从 RBAC 关系表和 effective 菜单读模型返回初始化 ID', async () => {
        const group = createGroup();
        mockPrismaService.rbacUserGroup.findFirst.mockResolvedValue(group);
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValue([{ groupId: 10, userId: 'u1' }]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([{ groupId: 10, roleId: 1 }]);

        const result = await service.getUserGroupRelations(group.id, 'operator_1');

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_USER_GROUP_VIEW
        );
        expect(mockRbacGraphService.getGroupVisibleMenuIds).toHaveBeenCalledWith(group.id);
        expect(result.memberUserIds).toEqual(['u1']);
        expect(result.roleIds).toEqual([1]);
        expect(result.visibleMenuIds).toEqual([100]);
        expect(result.group.viewerCanAssignMember).toBe(true);
    });

    it('查询用户组列表应批量读取成员和角色关系，避免随分页条数产生 N+1', async () => {
        const firstGroup = createGroup();
        const secondGroup = { ...createGroup(), id: 11, code: 'qa_group', name: '测试组' };
        mockPrismaService.rbacUserGroup.findManyAndCount.mockResolvedValue([
            [firstGroup, secondGroup],
            { total: 2, page: 1, pageSize: 10 }
        ]);
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValue([
            { groupId: 10, userId: 'u1' },
            { groupId: 11, userId: 'u2' }
        ]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([
            { groupId: 10, roleId: 1 },
            { groupId: 11, roleId: 2 }
        ]);

        const result = await service.getUserGroupList({ page: 1, pageSize: 10 }, 'operator_1');

        expect(mockPrismaService.rbacUserGroupMember.findMany).toHaveBeenCalledTimes(1);
        expect(mockPrismaService.rbacUserGroupRole.findMany).toHaveBeenCalledTimes(1);
        expect(mockPrismaService.rbacUserGroupMember.findMany).toHaveBeenCalledWith({
            where: {
                groupId: {
                    in: [10, 11]
                }
            },
            select: {
                groupId: true,
                userId: true
            }
        });
        expect(result.records).toEqual([
            expect.objectContaining({ id: 10, memberUserIds: ['u1'], roleIds: [1] }),
            expect.objectContaining({ id: 11, memberUserIds: ['u2'], roleIds: [2] })
        ]);
    });
});
