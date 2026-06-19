import { PrismaService } from '@app/prisma-admin';
import { RbacAuthorizationService } from '../system/rbac/rbac-authorization.service';
import { RBAC_PERMISSIONS } from '../system/rbac/rbac-permissions';
import { AdminSpiceDbAuthorizationService } from '../spicedb/admin-spicedb-authorization.service';
import { AdminUserStateService } from '../user-state/admin-user-state.service';
import {
    AuthzObjectExceptionSubjectSchema,
    type ApplyAuthzObjectExceptionBindingsType,
    type PreviewAuthzObjectExceptionBindingsType
} from './dto/authz-object-exception.dto';
import { AuthzObjectExceptionService } from './authz-object-exception.service';

const mockPrismaService = {
    $transaction: jest.fn((handlerOrQueries: unknown) => {
        if (typeof handlerOrQueries === 'function') {
            return handlerOrQueries(mockPrismaService);
        }
        return Promise.all(handlerOrQueries as Promise<unknown>[]);
    }),
    authzObjectSubjectBinding: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    },
    betterAuthUser: {
        count: jest.fn(),
        findMany: jest.fn()
    },
    rbacRole: {
        count: jest.fn(),
        findMany: jest.fn()
    },
    rbacMenu: {
        count: jest.fn()
    },
    rbacUserGroup: {
        count: jest.fn()
    },
    rbacUserRole: {
        findMany: jest.fn()
    },
    rbacUserGroupRole: {
        findMany: jest.fn()
    },
    rbacEffectiveUserRole: {
        findMany: jest.fn()
    },
    task: {
        count: jest.fn()
    }
};

const mockSpiceDbAuthorizationService = {
    writeRelationshipsNative: jest.fn(),
    deleteRelationshipsNative: jest.fn()
};

const mockRbacAuthorizationService = {
    checkPermission: jest.fn(),
    assertPermission: jest.fn()
};

const mockAdminUserStateService = {
    bumpUserStateVersion: jest.fn(),
    bumpRoleStateVersion: jest.fn()
};

describe('AuthzObjectExceptionService', () => {
    let service: AuthzObjectExceptionService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new AuthzObjectExceptionService(
            mockPrismaService as unknown as PrismaService,
            mockSpiceDbAuthorizationService as unknown as AdminSpiceDbAuthorizationService,
            mockRbacAuthorizationService as unknown as RbacAuthorizationService,
            mockAdminUserStateService as unknown as AdminUserStateService
        );
        mockPrismaService.authzObjectSubjectBinding.findMany.mockResolvedValue([]);
        mockPrismaService.authzObjectSubjectBinding.deleteMany.mockResolvedValue({ count: 0 });
        mockPrismaService.authzObjectSubjectBinding.createMany.mockResolvedValue({ count: 0 });
        mockPrismaService.betterAuthUser.count.mockResolvedValue(1);
        mockPrismaService.betterAuthUser.findMany.mockResolvedValue([
            {
                id: 'user_1',
                username: 'alice',
                name: 'Alice'
            }
        ]);
        mockPrismaService.rbacRole.count.mockResolvedValue(1);
        mockPrismaService.rbacRole.findMany.mockResolvedValue([
            {
                id: 1,
                name: '管理员'
            }
        ]);
        mockPrismaService.rbacMenu.count.mockResolvedValue(1);
        mockPrismaService.rbacUserGroup.count.mockResolvedValue(1);
        mockPrismaService.rbacUserRole.findMany.mockResolvedValue([
            {
                userId: 'user_1'
            }
        ]);
        mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([]);
        mockPrismaService.rbacEffectiveUserRole.findMany.mockResolvedValue([
            {
                userId: 'user_1'
            }
        ]);
        mockPrismaService.task.count.mockResolvedValue(1);
        mockRbacAuthorizationService.checkPermission.mockResolvedValue(true);
        mockRbacAuthorizationService.assertPermission.mockResolvedValue(undefined);
        mockSpiceDbAuthorizationService.writeRelationshipsNative.mockResolvedValue({});
        mockSpiceDbAuthorizationService.deleteRelationshipsNative.mockResolvedValue({});
        mockAdminUserStateService.bumpUserStateVersion.mockResolvedValue('user_version');
        mockAdminUserStateService.bumpRoleStateVersion.mockResolvedValue('role_version');
    });

    /**
     * 构造默认的任务对象例外授权预览请求。
     */
    function createTaskPreviewInput(): PreviewAuthzObjectExceptionBindingsType {
        return {
            resourceType: 'task',
            resourceId: '10',
            changes: [
                {
                    relation: 'runner',
                    previousSubjects: [],
                    nextSubjects: [
                        {
                            kind: 'role_assigned',
                            id: '1'
                        }
                    ]
                }
            ]
        };
    }

    it('summary 预览对象例外授权时应只计算轻量影响，不写源表和 SpiceDB', async () => {
        const preview = await service.previewBindings(createTaskPreviewInput(), 'operator_1');

        expect(preview).toMatchObject({
            resourceType: 'task',
            resourceId: '10',
            createCount: 1,
            deleteCount: 0,
            affectedRoleCount: 1,
            affectedUserCount: null,
            affectedGroupCount: 0,
            directUserAssignmentCount: 1,
            affectedUserEstimate: 1,
            affectedUsersSample: [],
            impactMode: 'summary',
            requiresConfirmation: false,
            preferredSubjectKind: 'role_assigned'
        });
        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE
        );
        expect(mockPrismaService.authzObjectSubjectBinding.createMany).not.toHaveBeenCalled();
        expect(mockSpiceDbAuthorizationService.writeRelationshipsNative).not.toHaveBeenCalled();
        expect(mockPrismaService.rbacUserRole.findMany).toHaveBeenCalledWith({
            where: {
                roleId: {
                    in: [1]
                }
            },
            select: {
                userId: true
            }
        });
        expect(mockPrismaService.rbacEffectiveUserRole.findMany).toHaveBeenCalledWith({
            where: {
                roleId: {
                    in: [1]
                }
            },
            select: {
                userId: true
            }
        });
    });

    it('precise 预览对象例外授权时应按需返回精确用户影响样例', async () => {
        const preview = await service.previewBindings(
            {
                ...createTaskPreviewInput(),
                impactMode: 'precise'
            },
            'operator_1'
        );

        expect(preview).toMatchObject({
            impactMode: 'precise',
            affectedUserCount: 1,
            affectedUserEstimate: 1,
            affectedUsersSample: [
                {
                    id: 'user_1'
                }
            ]
        });
        expect(mockPrismaService.rbacEffectiveUserRole.findMany).toHaveBeenCalledWith({
            where: {
                roleId: {
                    in: [1]
                }
            },
            select: {
                userId: true
            }
        });
    });

    it('请求不属于资源白名单的 relation 时应拒绝', async () => {
        await expect(
            service.previewBindings(
                {
                    resourceType: 'task',
                    resourceId: '10',
                    changes: [
                        {
                            relation: 'password_resetter',
                            previousSubjects: [],
                            nextSubjects: []
                        }
                    ]
                },
                'operator_1'
            )
        ).rejects.toMatchObject({
            bizCode: 1202
        });
    });

    it('DTO 应允许 user 和 role_assigned，并拒绝其他 subjectKind', () => {
        expect(AuthzObjectExceptionSubjectSchema.safeParse({ kind: 'user', id: 'user_1' }).success).toBe(true);
        expect(AuthzObjectExceptionSubjectSchema.safeParse({ kind: 'role_assigned', id: '1' }).success).toBe(true);
        expect(AuthzObjectExceptionSubjectSchema.safeParse({ kind: 'group', id: '1' }).success).toBe(false);
    });

    it('大批量对象例外授权未确认时应拒绝 apply', async () => {
        const input: ApplyAuthzObjectExceptionBindingsType = {
            resourceType: 'task',
            resourceId: '10',
            changes: [
                {
                    relation: 'runner',
                    previousSubjects: [],
                    nextSubjects: Array.from({ length: 21 }, (_, index) => ({
                        kind: 'role_assigned',
                        id: String(index + 1)
                    }))
                }
            ]
        };
        mockPrismaService.rbacRole.findMany.mockResolvedValue(
            Array.from({ length: 21 }, (_, index) => ({
                id: index + 1,
                name: `角色${index + 1}`
            }))
        );

        await expect(service.applyBindings(input, 'operator_1')).rejects.toMatchObject({
            bizCode: 1202
        });
        expect(mockSpiceDbAuthorizationService.writeRelationshipsNative).not.toHaveBeenCalled();
    });

    it('应用对象例外授权时应写源表、写 SpiceDB 并刷新状态版本', async () => {
        const result = await service.applyBindings(
            {
                ...createTaskPreviewInput(),
                confirmedLargeChange: false
            },
            'operator_1'
        );

        expect(result.editable).toBe(true);
        expect(mockPrismaService.authzObjectSubjectBinding.deleteMany).toHaveBeenCalledWith({
            where: {
                resourceType: 'task',
                resourceId: '10'
            }
        });
        expect(mockPrismaService.authzObjectSubjectBinding.createMany).toHaveBeenCalledWith({
            data: [
                {
                    resourceType: 'task',
                    resourceId: '10',
                    relation: 'runner',
                    subjectKind: 'role_assigned',
                    subjectId: '1',
                    createdBy: 'operator_1'
                }
            ],
            skipDuplicates: true
        });
        expect(mockSpiceDbAuthorizationService.writeRelationshipsNative).toHaveBeenCalledWith([
            {
                operation: 'touch',
                relationship: {
                    resource: {
                        type: 'task',
                        id: '10'
                    },
                    relation: 'runner',
                    subject: {
                        type: 'role',
                        id: '1',
                        relation: 'assigned'
                    }
                }
            }
        ]);
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(1);
    });

    it('SpiceDB 写入失败时应回滚源表并尝试回滚 SpiceDB 关系', async () => {
        mockSpiceDbAuthorizationService.writeRelationshipsNative
            .mockRejectedValueOnce(new Error('spicedb failed'))
            .mockResolvedValueOnce({});

        await expect(
            service.applyBindings(
                {
                    ...createTaskPreviewInput(),
                    confirmedLargeChange: false
                },
                'operator_1'
            )
        ).rejects.toThrow('spicedb failed');

        expect(mockPrismaService.authzObjectSubjectBinding.deleteMany).toHaveBeenCalledTimes(2);
        expect(mockSpiceDbAuthorizationService.writeRelationshipsNative).toHaveBeenCalledTimes(2);
        expect(mockSpiceDbAuthorizationService.writeRelationshipsNative).toHaveBeenLastCalledWith([
            {
                operation: 'delete',
                relationship: {
                    resource: {
                        type: 'task',
                        id: '10'
                    },
                    relation: 'runner',
                    subject: {
                        type: 'role',
                        id: '1',
                        relation: 'assigned'
                    }
                }
            }
        ]);
    });

    it('清理已删除业务对象时应先删除 SpiceDB 对象例外关系，再删除源表记录', async () => {
        await service.cleanupDeletedResource('task', '10');

        expect(mockSpiceDbAuthorizationService.deleteRelationshipsNative).toHaveBeenCalledWith({
            resourceType: 'task',
            resourceId: '10',
            relation: 'viewer'
        });
        expect(mockSpiceDbAuthorizationService.deleteRelationshipsNative).toHaveBeenCalledWith({
            resourceType: 'task',
            resourceId: '10',
            relation: 'runner'
        });
        expect(mockPrismaService.authzObjectSubjectBinding.deleteMany).toHaveBeenCalledWith({
            where: {
                resourceType: 'task',
                resourceId: '10'
            }
        });
        expect(mockSpiceDbAuthorizationService.deleteRelationshipsNative.mock.invocationCallOrder[0]).toBeLessThan(
            mockPrismaService.authzObjectSubjectBinding.deleteMany.mock.invocationCallOrder[0]
        );
    });

    it('清理已删除用户时应同时删除用户对象资源关系和 user subject 关系', async () => {
        await service.cleanupDeletedUser(' user_1 ');

        expect(mockSpiceDbAuthorizationService.deleteRelationshipsNative).toHaveBeenCalledWith({
            resourceType: 'admin_user',
            resourceId: 'user_1',
            relation: 'viewer'
        });
        expect(mockSpiceDbAuthorizationService.deleteRelationshipsNative).toHaveBeenCalledWith({
            resourceType: 'task',
            relation: 'runner',
            subject: {
                type: 'user',
                id: 'user_1'
            }
        });
        expect(mockPrismaService.authzObjectSubjectBinding.deleteMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    {
                        resourceType: 'admin_user',
                        resourceId: 'user_1'
                    },
                    {
                        subjectKind: 'user',
                        subjectId: 'user_1'
                    }
                ]
            }
        });
    });

    it('清理已删除角色时应同时删除角色对象资源关系和 role#assigned subject 关系', async () => {
        await service.cleanupDeletedRole(1);

        expect(mockSpiceDbAuthorizationService.deleteRelationshipsNative).toHaveBeenCalledWith({
            resourceType: 'role',
            resourceId: '1',
            relation: 'viewer'
        });
        expect(mockSpiceDbAuthorizationService.deleteRelationshipsNative).toHaveBeenCalledWith({
            resourceType: 'task',
            relation: 'runner',
            subject: {
                type: 'role',
                id: '1',
                relation: 'assigned'
            }
        });
        expect(mockPrismaService.authzObjectSubjectBinding.deleteMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    {
                        resourceType: 'role',
                        resourceId: '1'
                    },
                    {
                        subjectKind: 'role_assigned',
                        subjectId: '1'
                    }
                ]
            }
        });
    });
});
