import { ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthzObjectExceptionService } from '../../authz-object-exception/authz-object-exception.service';
import { AdminUserAdminService } from '../../better-auth/admin-user-admin.service';
import { RbacAuthorizationService } from '../rbac/rbac-authorization.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';
import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import { SystemUsersService } from './users.service';

jest.mock('../../better-auth/admin-user-admin.service', () => ({
    AdminUserAdminService: class AdminUserAdminService {}
}));

jest.mock('@app/common', () => ({
    BusinessException: class BusinessException extends Error {
        constructor(public readonly payload?: unknown) {
            super('BusinessException');
        }
    },
    ErrorCodes: {
        USER: {
            NOT_FOUND: { code: 4041, message: '用户不存在' }
        }
    },
    createRuntimeLogger: jest.fn().mockImplementation(() => {
        const noopMethod = Object.assign(jest.fn(), { title: jest.fn() });
        return {
            info: noopMethod,
            debug: noopMethod,
            verbose: noopMethod,
            warn: noopMethod,
            error: noopMethod,
            system: jest.fn(),
            userAction: jest.fn(),
            audit: jest.fn()
        };
    })
}));

const mockPrismaService = {
    $transaction: jest.fn((handlerOrQueries: unknown) => {
        if (typeof handlerOrQueries === 'function') {
            return handlerOrQueries(mockPrismaService);
        }
        return Promise.all(handlerOrQueries as Promise<unknown>[]);
    }),
    betterAuthUserProfile: {
        upsert: jest.fn()
    },
    betterAuthUser: {
        findUnique: jest.fn(),
        findManyAndCount: jest.fn()
    },
    rbacUserGroupMember: {
        findMany: jest.fn(),
        deleteMany: jest.fn()
    },
    rbacUserRole: {
        findMany: jest.fn(),
        deleteMany: jest.fn()
    },
    rbacEffectiveUserRole: {
        findMany: jest.fn(),
        deleteMany: jest.fn()
    },
    rbacEffectiveUserPermission: {
        deleteMany: jest.fn()
    },
    rbacUserVisibleMenu: {
        deleteMany: jest.fn()
    },
    rbacUserGroup: {
        findMany: jest.fn(),
        findManyAndCount: jest.fn()
    },
    rbacRole: {
        findMany: jest.fn(),
        findManyAndCount: jest.fn()
    },
    rbacMenu: {
        findManyAndCount: jest.fn()
    }
};

const mockAdminUserAdminService = {
    createUser: jest.fn(),
    updateUser: jest.fn(),
    setUserPassword: jest.fn(),
    banUser: jest.fn(),
    unbanUser: jest.fn(),
    removeUser: jest.fn(),
    listUserSessions: jest.fn(),
    revokeUserSessions: jest.fn()
};

const mockRbacAuthorizationService = {
    assertPermission: jest.fn(),
    checkPermission: jest.fn(),
    checkPermissions: jest.fn()
};

const mockRbacGraphService = {
    getUserEffectiveState: jest.fn()
};

const mockAuthzObjectExceptionService = {
    cleanupDeletedUser: jest.fn()
};

const mockAdminUserStateService = {
    bumpUserStateVersion: jest.fn()
};

describe('SystemUsersService', () => {
    let service: SystemUsersService;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockRbacAuthorizationService.assertPermission.mockResolvedValue(undefined);
        mockRbacAuthorizationService.checkPermission.mockResolvedValue(true);
        mockRbacAuthorizationService.checkPermissions.mockResolvedValue(
            new Map([
                [RBAC_PERMISSIONS.SYSTEM_USER_UPDATE, true],
                [RBAC_PERMISSIONS.SYSTEM_USER_DELETE, true],
                [RBAC_PERMISSIONS.SYSTEM_USER_RESET_PASSWORD, true],
                [RBAC_PERMISSIONS.SYSTEM_USER_SESSION_VIEW, false],
                [RBAC_PERMISSIONS.SYSTEM_USER_SESSION_REVOKE, false],
                [RBAC_PERMISSIONS.SYSTEM_USER_IMPERSONATE, true]
            ])
        );
        mockAuthzObjectExceptionService.cleanupDeletedUser.mockResolvedValue(undefined);
        mockAdminUserStateService.bumpUserStateVersion.mockResolvedValue('state_v2');

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SystemUsersService,
                { provide: PrismaService, useValue: mockPrismaService },
                { provide: AdminUserAdminService, useValue: mockAdminUserAdminService },
                { provide: RbacAuthorizationService, useValue: mockRbacAuthorizationService },
                { provide: SystemRbacGraphService, useValue: mockRbacGraphService },
                { provide: AuthzObjectExceptionService, useValue: mockAuthzObjectExceptionService },
                { provide: AdminUserStateService, useValue: mockAdminUserStateService }
            ]
        }).compile();

        service = module.get<SystemUsersService>(SystemUsersService);
    });

    it('创建用户时，应写入 Better Auth 主表和资料表，不再写 SpiceDB 基础关系', async () => {
        const createdUser = { id: 'user_1' };
        const expectedView = { id: 'user_1', username: 'admin' };
        jest.spyOn(service, 'getUserByID').mockResolvedValue(expectedView as never);
        mockAdminUserAdminService.createUser.mockResolvedValue(createdUser);

        const result = await service.createUser('operator_1', {
            email: null,
            username: 'admin',
            password: 'password123',
            name: '管理员',
            image: null,
            phoneNumber: null,
            remark: '备注',
            banned: true
        });

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_USER_CREATE
        );
        expect(mockAdminUserAdminService.createUser).toHaveBeenCalledWith({
            email: 'admin@shiro-nya.local',
            name: '管理员',
            password: 'password123',
            username: 'admin',
            image: null,
            phoneNumber: null
        });
        expect(mockPrismaService.betterAuthUserProfile.upsert).toHaveBeenCalledWith({
            where: {
                userId: 'user_1'
            },
            create: {
                userId: 'user_1',
                remark: '备注',
                createdBy: 'operator_1',
                lastLoginAt: null
            },
            update: {
                remark: '备注',
                createdBy: 'operator_1',
                lastLoginAt: null
            }
        });
        expect(mockAdminUserAdminService.banUser).toHaveBeenCalledWith('user_1');
        expect(result).toBe(expectedView);
    });

    it('查询用户列表时，应使用 RBAC 源表和 effective 读模型批量读取角色与用户组', async () => {
        const now = new Date('2026-04-28T00:00:00.000Z');
        const records = [
            {
                id: 'u1',
                username: 'alice',
                name: 'Alice',
                email: 'alice@example.com',
                image: null,
                phoneNumber: null,
                banned: false,
                createdAt: now,
                updatedAt: now,
                profile: {
                    remark: null,
                    lastLoginAt: null
                }
            },
            {
                id: 'u2',
                username: 'bob',
                name: 'Bob',
                email: 'bob@example.com',
                image: null,
                phoneNumber: null,
                banned: true,
                banExpires: null,
                createdAt: now,
                updatedAt: now,
                profile: {
                    remark: '客服',
                    lastLoginAt: null
                }
            }
        ];
        const pagination = {
            total: 2,
            totalPages: 1,
            pageSize: 10,
            page: 1
        };
        const group = {
            id: 1,
            name: '运营组',
            code: 'ops'
        };
        mockPrismaService.betterAuthUser.findManyAndCount.mockResolvedValue([records, pagination]);
        mockPrismaService.rbacUserGroupMember.findMany.mockResolvedValue([
            {
                userId: 'u1',
                group
            }
        ]);
        mockPrismaService.rbacUserRole.findMany.mockResolvedValue([
            {
                userId: 'u1',
                roleId: 1
            }
        ]);
        mockPrismaService.rbacEffectiveUserRole.findMany.mockResolvedValue([
            {
                userId: 'u1',
                roleId: 1
            },
            {
                userId: 'u1',
                roleId: 2
            },
            {
                userId: 'u2',
                roleId: 3
            }
        ]);

        const result = await service.getUserList(
            {
                page: 1,
                pageSize: 10
            },
            'operator_1'
        );

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_USER_VIEW
        );
        expect(mockPrismaService.rbacUserRole.findMany).toHaveBeenCalledWith({
            where: {
                userId: {
                    in: ['u1', 'u2']
                }
            },
            select: {
                userId: true,
                roleId: true
            }
        });
        expect(mockPrismaService.rbacEffectiveUserRole.findMany).toHaveBeenCalledWith({
            where: {
                userId: {
                    in: ['u1', 'u2']
                },
                role: {
                    deletedAt: null
                }
            },
            select: {
                userId: true,
                roleId: true
            }
        });
        expect(result.records).toEqual([
            expect.objectContaining({
                id: 'u1',
                roleIds: [1],
                effectiveRoleIds: [1, 2],
                userGroupIds: [1],
                userGroups: [group],
                viewerCanResetPassword: true,
                viewerCanImpersonate: true
            }),
            expect.objectContaining({
                id: 'u2',
                roleIds: [],
                effectiveRoleIds: [3],
                userGroupIds: [],
                userGroups: [],
                viewerCanImpersonate: false
            })
        ]);
    });

    it('更新用户主表、资料表或封禁状态后，应 bump 目标用户状态版本', async () => {
        const expectedView = { id: 'user_1', name: '新名字' };
        jest.spyOn(service, 'getUserByID')
            .mockResolvedValueOnce({ id: 'user_1' } as never)
            .mockResolvedValueOnce(expectedView as never);

        const result = await service.updateUser(
            'user_1',
            {
                name: '新名字',
                remark: '新备注',
                banned: false
            },
            'operator_1'
        );

        expect(mockAdminUserAdminService.updateUser).toHaveBeenCalledWith('user_1', {
            name: '新名字'
        });
        expect(mockPrismaService.betterAuthUserProfile.upsert).toHaveBeenCalledWith({
            where: {
                userId: 'user_1'
            },
            create: {
                userId: 'user_1',
                remark: '新备注',
                createdBy: null,
                lastLoginAt: null
            },
            update: {
                remark: '新备注'
            }
        });
        expect(mockAdminUserAdminService.unbanUser).toHaveBeenCalledWith('user_1');
        expect(mockAdminUserStateService.bumpUserStateVersion).toHaveBeenCalledWith('user_1');
        expect(result).toBe(expectedView);
    });

    it('单独封禁用户后，应 bump 目标用户状态版本', async () => {
        const expectedDetail = { id: 'user_1', banned: true };
        jest.spyOn(service, 'getUserDetail').mockResolvedValue(expectedDetail as never);

        const result = await service.banUser('user_1', 'operator_1', '违规');

        expect(mockAdminUserAdminService.banUser).toHaveBeenCalledWith('user_1', '违规');
        expect(mockAdminUserStateService.bumpUserStateVersion).toHaveBeenCalledWith('user_1');
        expect(result).toBe(expectedDetail);
    });

    it('删除用户时，应清理 RBAC 源表和 effective 读模型后移除 Better Auth 用户', async () => {
        await service.deleteUser('user_1', 'operator_1');

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_USER_DELETE
        );
        expect(mockAuthzObjectExceptionService.cleanupDeletedUser).toHaveBeenCalledWith('user_1');
        expect(mockPrismaService.rbacUserRole.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
        expect(mockPrismaService.rbacUserGroupMember.deleteMany).toHaveBeenCalledWith({
            where: { userId: 'user_1' }
        });
        expect(mockPrismaService.rbacEffectiveUserRole.deleteMany).toHaveBeenCalledWith({
            where: { userId: 'user_1' }
        });
        expect(mockPrismaService.rbacEffectiveUserPermission.deleteMany).toHaveBeenCalledWith({
            where: { userId: 'user_1' }
        });
        expect(mockPrismaService.rbacUserVisibleMenu.deleteMany).toHaveBeenCalledWith({
            where: { userId: 'user_1' }
        });
        expect(mockAdminUserAdminService.removeUser).toHaveBeenCalledWith('user_1');
    });

    it('查询缺失用户时，应明确抛出用户不存在错误', async () => {
        mockPrismaService.betterAuthUser.findUnique.mockResolvedValue(null);

        await expect(service.getUserByID('missing_user')).rejects.toMatchObject({
            payload: ErrorCodes.USER.NOT_FOUND
        });
    });
});
