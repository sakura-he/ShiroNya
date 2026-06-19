import { PrismaService } from '@app/prisma-app';
import { RbacStatus } from '@app/prisma-app/generated/client';
import { RbacAuthorizationService } from '../system/rbac/rbac-authorization.service';
import { RBAC_PERMISSIONS } from '../system/rbac/rbac-permissions';
import { AdminSpiceDbAuthorizationService } from '../spicedb/admin-spicedb-authorization.service';
import { CORE_MANAGER_RELATIONS } from '../spicedb/core-manager-authz.constants';
import { SpiceDbDataService } from '../system/spicedb-data/spicedb-data.service';
import { AdminUserStateService } from '../user-state/admin-user-state.service';
import { AuthzPermissionService } from './authz-permission.service';

type RoleRow = {
    id: number;
    name: string;
    code: string;
    description: string | null;
    status: RbacStatus;
};

type BindingRow = {
    resourceType: string;
    resourceId: string;
    roleId: number;
};

type MetadataRow = {
    resourceType: string;
    displayName: string;
    authorizationEnabled: boolean | null;
};

type UserRow = {
    id: string;
    username: string | null;
    name: string;
};

const mockPrismaService = {
    $transaction: jest.fn(),
    rbacRole: {
        findMany: jest.fn()
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
    betterAuthUser: {
        findMany: jest.fn()
    },
    authzResourceRoleBinding: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
    },
    authzResourceMetadata: {
        createMany: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn()
    }
};

const mockSpiceDbDataService = {
    getSchema: jest.fn()
};

const mockSpiceDbAuthorizationService = {
    replaceRoleAuthzResourceRelations: jest.fn()
};

const mockRbacAuthorizationService = {
    checkPermission: jest.fn(),
    assertPermission: jest.fn()
};

const mockAdminUserStateService = {
    bumpRoleStateVersion: jest.fn()
};

const schemaDefinitions = [
    ...Object.entries(CORE_MANAGER_RELATIONS).map(([resourceType, relations]) => ({
        name: resourceType,
        relations: [
            {
                name: 'system',
                targets: [{ type: 'system' }]
            },
            ...relations.map((relation) => ({
                name: relation,
                targets: [{ type: 'role' }]
            }))
        ],
        permissions: []
    })),
    {
        name: 'role',
        relations: [
            {
                name: 'enabled',
                targets: [{ type: 'user', wildcard: true }]
            },
            {
                name: 'assignee',
                targets: [{ type: 'user' }]
            }
        ],
        permissions: [{ name: 'assigned', expression: 'assignee & enabled' }]
    }
];

let roleRows: RoleRow[];
let bindingRows: BindingRow[];
let metadataRows: MetadataRow[];
let userRows: UserRow[];
let effectiveUsersByRoleId: Map<number, string[]>;

/**
 * 生成测试角色，保持矩阵样例和大变更用例拥有足够的有效角色。
 */
function createRole(id: number): RoleRow {
    return {
        id,
        name: `角色${id}`,
        code: `role_${id}`,
        description: null,
        status: RbacStatus.ENABLE
    };
}

/**
 * 按 Prisma where 片段过滤内存中的 manager 授权源表记录。
 */
function filterBindingRows(where?: Record<string, any>): BindingRow[] {
    return bindingRows.filter((row) => {
        if (where?.resourceType && row.resourceType !== where.resourceType) {
            return false;
        }
        if (where?.resourceId && row.resourceId !== where.resourceId) {
            return false;
        }
        if (where?.roleId?.in && !where.roleId.in.includes(row.roleId)) {
            return false;
        }
        return true;
    });
}

/**
 * 删除内存源表中的授权记录，用来模拟 Prisma deleteMany 的副作用。
 */
function deleteBindingRows(where?: Record<string, any>): { count: number } {
    const beforeCount = bindingRows.length;
    bindingRows = bindingRows.filter((row) => !filterBindingRows(where).includes(row));
    return {
        count: beforeCount - bindingRows.length
    };
}

/**
 * 追加内存源表授权记录，用来模拟 Prisma createMany 的副作用和 skipDuplicates 行为。
 */
function createBindingRows(data: BindingRow[]): { count: number } {
    let count = 0;
    for (const row of data) {
        const exists = bindingRows.some(
            (item) =>
                item.resourceType === row.resourceType &&
                item.resourceId === row.resourceId &&
                item.roleId === row.roleId
        );
        if (exists) {
            continue;
        }
        bindingRows.push({ ...row });
        count += 1;
    }
    return { count };
}

/**
 * 重置全部 mock 和内存数据，确保每个用例从稳定快照开始。
 */
function resetMocks(): void {
    jest.clearAllMocks();
    roleRows = Array.from({ length: 60 }, (_, index) => createRole(index + 1));
    bindingRows = [
        {
            resourceType: 'user_manager',
            resourceId: 'viewer',
            roleId: 1
        },
        {
            resourceType: 'user_manager',
            resourceId: 'creator',
            roleId: 2
        }
    ];
    metadataRows = schemaDefinitions.map((definition) => ({
        resourceType: definition.name,
        displayName: definition.name === 'user_manager' ? '用户权限' : definition.name,
        authorizationEnabled: Object.keys(CORE_MANAGER_RELATIONS).includes(definition.name)
    }));
    userRows = Array.from({ length: 80 }, (_, index) => ({
        id: `u${index + 1}`,
        username: `user_${index + 1}`,
        name: `用户${index + 1}`
    }));
    effectiveUsersByRoleId = new Map([
        [1, ['u1']],
        [2, ['u2', 'u3']]
    ]);

    mockPrismaService.$transaction.mockImplementation(async (handlerOrQueries: unknown) => {
        if (typeof handlerOrQueries === 'function') {
            return await handlerOrQueries(mockPrismaService);
        }
        return await Promise.all(handlerOrQueries as Promise<unknown>[]);
    });
    mockPrismaService.rbacRole.findMany.mockImplementation(({ where } = {}) => {
        const ids = where?.id?.in as number[] | undefined;
        const rows = ids ? roleRows.filter((role) => ids.includes(role.id)) : roleRows.slice(0, 3);
        return Promise.resolve(rows.map((role) => ({ ...role })));
    });
    mockPrismaService.rbacUserRole.findMany.mockImplementation(({ where } = {}) => {
        const ids = where?.roleId?.in as number[] | undefined;
        return Promise.resolve(
            [...effectiveUsersByRoleId.entries()]
                .filter(([roleId]) => !ids || ids.includes(roleId))
                .flatMap(([roleId, userIds]) => userIds.map((userId) => ({ roleId, userId })))
        );
    });
    mockPrismaService.rbacUserGroupRole.findMany.mockResolvedValue([]);
    mockPrismaService.rbacEffectiveUserRole.findMany.mockImplementation(({ where } = {}) => {
        const ids = where?.roleId?.in as number[] | undefined;
        return Promise.resolve(
            [...effectiveUsersByRoleId.entries()]
                .filter(([roleId]) => !ids || ids.includes(roleId))
                .flatMap(([roleId, userIds]) => userIds.map((userId) => ({ roleId, userId })))
        );
    });
    mockPrismaService.betterAuthUser.findMany.mockImplementation(({ where } = {}) => {
        const ids = where?.id?.in as string[] | undefined;
        return Promise.resolve(userRows.filter((user) => !ids || ids.includes(user.id)).map((user) => ({ ...user })));
    });
    mockPrismaService.authzResourceRoleBinding.findMany.mockImplementation(({ where } = {}) =>
        Promise.resolve(filterBindingRows(where).map((row) => ({ ...row })))
    );
    mockPrismaService.authzResourceRoleBinding.deleteMany.mockImplementation(({ where } = {}) =>
        Promise.resolve(deleteBindingRows(where))
    );
    mockPrismaService.authzResourceRoleBinding.createMany.mockImplementation(({ data } = {}) =>
        Promise.resolve(createBindingRows(data ?? []))
    );
    mockPrismaService.authzResourceMetadata.findMany.mockImplementation(({ where } = {}) => {
        const resourceTypes = where?.resourceType?.in as string[] | undefined;
        return Promise.resolve(
            metadataRows
                .filter((row) => !resourceTypes || resourceTypes.includes(row.resourceType))
                .map((row) => ({ ...row }))
        );
    });
    mockPrismaService.authzResourceMetadata.createMany.mockImplementation(({ data } = {}) => {
        for (const row of data ?? []) {
            if (metadataRows.some((item) => item.resourceType === row.resourceType)) {
                continue;
            }
            metadataRows.push({ ...row });
        }
        return Promise.resolve({ count: data?.length ?? 0 });
    });
    mockPrismaService.authzResourceMetadata.update.mockImplementation(({ where, data } = {}) => {
        metadataRows = metadataRows.map((row) => (row.resourceType === where.resourceType ? { ...row, ...data } : row));
        return Promise.resolve(metadataRows.find((row) => row.resourceType === where.resourceType));
    });
    mockPrismaService.authzResourceMetadata.upsert.mockImplementation(({ where, create, update } = {}) => {
        const existing = metadataRows.find((row) => row.resourceType === where.resourceType);
        if (existing) {
            Object.assign(existing, update);
            return Promise.resolve({ ...existing });
        }
        metadataRows.push({ ...create });
        return Promise.resolve({ ...create });
    });

    mockSpiceDbDataService.getSchema.mockResolvedValue({
        schema: 'definition user_manager {}',
        definitions: schemaDefinitions
    });
    mockSpiceDbAuthorizationService.replaceRoleAuthzResourceRelations.mockResolvedValue(undefined);
    mockRbacAuthorizationService.checkPermission.mockImplementation((_actorId: string, permissionCode: string) =>
        Promise.resolve(
            [
                RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE,
                RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_CAPABILITY,
                RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_RESOURCE
            ].includes(permissionCode as any)
        )
    );
    mockRbacAuthorizationService.assertPermission.mockResolvedValue(undefined);
    mockAdminUserStateService.bumpRoleStateVersion.mockResolvedValue(undefined);
}

describe('AuthzPermissionService', () => {
    let service: AuthzPermissionService;

    beforeEach(() => {
        resetMocks();
        service = new AuthzPermissionService(
            mockPrismaService as unknown as PrismaService,
            mockSpiceDbDataService as unknown as SpiceDbDataService,
            mockSpiceDbAuthorizationService as unknown as AdminSpiceDbAuthorizationService,
            mockRbacAuthorizationService as unknown as RbacAuthorizationService,
            mockAdminUserStateService as unknown as AdminUserStateService
        );
    });

    it('获取矩阵时，应返回 schema definition、核心 manager 模块和角色授权状态', async () => {
        const result = await service.getMatrix('operator_1');
        const userManager = result.modules.find((module) => module.resourceType === 'user_manager');
        const viewer = userManager?.relations.find((relation) => relation.relation === 'viewer');
        const creator = userManager?.relations.find((relation) => relation.relation === 'creator');

        expect(result.definitions.find((definition) => definition.name === 'user_manager')?.configurable).toBe(true);
        expect(result.definitions.find((definition) => definition.name === 'user_manager')?.displayName).toBe(
            '用户权限'
        );
        expect(result.definitions.find((definition) => definition.name === 'role')?.configurable).toBe(false);
        expect(result.modules.map((module) => module.resourceType)).toEqual([
            'user_manager',
            'role_manager',
            'menu_manager',
            'user_group_manager',
            'task_manager'
        ]);
        expect(userManager?.displayName).toBe('用户权限');
        expect(viewer?.roleIds).toEqual([1]);
        expect(viewer?.editableRoleIds).toEqual([1, 2, 3]);
        expect(creator?.roleIds).toEqual([2]);
    });

    it('重命名实体展示名时，应按 resourceType 更新元数据并返回刷新后的矩阵', async () => {
        const result = await service.renameResource(
            {
                resourceType: 'user_manager',
                displayName: ' 用户权限 '
            },
            'operator_1'
        );

        expect(mockPrismaService.authzResourceMetadata.upsert).toHaveBeenCalledWith({
            where: {
                resourceType: 'user_manager'
            },
            create: {
                resourceType: 'user_manager',
                displayName: '用户权限',
                authorizationEnabled: true
            },
            update: {
                displayName: '用户权限'
            }
        });
        expect(result.definitions.find((definition) => definition.name === 'user_manager')?.displayName).toBe(
            '用户权限'
        );
        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE
        );
    });

    it('summary 预览批量矩阵变更时，应只返回轻量估算，不展开查询用户', async () => {
        const result = await service.previewMatrixChanges(
            {
                changes: [
                    {
                        resourceType: 'user_manager',
                        relation: 'viewer',
                        previousRoleIds: [1],
                        nextRoleIds: [2]
                    }
                ]
            },
            'operator_1'
        );

        expect(result).toMatchObject({
            createCount: 1,
            deleteCount: 1,
            affectedRoleCount: 2,
            affectedUserCount: null,
            affectedGroupCount: 0,
            directUserAssignmentCount: 3,
            affectedUserEstimate: 3,
            affectedUsersSample: [],
            impactMode: 'summary',
            requiresConfirmation: false
        });
        expect(result.normalizedChanges).toEqual([
            {
                resourceType: 'user_manager',
                relation: 'viewer',
                previousRoleIds: [1],
                nextRoleIds: [2],
                createRoleIds: [2],
                deleteRoleIds: [1]
            }
        ]);
        expect(result.affectedRolesSample.map((role) => role.id)).toEqual([1, 2]);
        expect(mockPrismaService.rbacUserRole.findMany).toHaveBeenCalledWith({
            where: {
                roleId: {
                    in: [1, 2]
                }
            },
            select: {
                userId: true
            }
        });
        expect(mockPrismaService.rbacEffectiveUserRole.findMany).toHaveBeenCalledWith({
            where: {
                roleId: {
                    in: [1, 2]
                }
            },
            select: {
                userId: true
            }
        });
        expect(mockPrismaService.authzResourceRoleBinding.deleteMany).not.toHaveBeenCalled();
        expect(mockPrismaService.authzResourceRoleBinding.createMany).not.toHaveBeenCalled();
        expect(mockRbacAuthorizationService.assertPermission).not.toHaveBeenCalled();
        expect(mockSpiceDbAuthorizationService.replaceRoleAuthzResourceRelations).not.toHaveBeenCalled();
    });

    it('precise 预览批量矩阵变更时，应按需展开精确影响用户样例', async () => {
        const result = await service.previewMatrixChanges(
            {
                impactMode: 'precise',
                changes: [
                    {
                        resourceType: 'user_manager',
                        relation: 'viewer',
                        previousRoleIds: [1],
                        nextRoleIds: [2]
                    }
                ]
            },
            'operator_1'
        );

        expect(result).toMatchObject({
            impactMode: 'precise',
            affectedUserCount: 3,
            affectedUserEstimate: 3,
            affectedUsersSample: [
                {
                    id: 'u1'
                },
                {
                    id: 'u2'
                },
                {
                    id: 'u3'
                }
            ]
        });
        expect(mockPrismaService.rbacEffectiveUserRole.findMany).toHaveBeenCalledWith({
            where: {
                roleId: {
                    in: [1, 2]
                }
            },
            select: {
                userId: true
            }
        });
    });

    it('批量应用矩阵变更时，应先校验角色权限，再写源表、同步 SpiceDB 并刷新角色版本', async () => {
        await service.applyMatrixChanges(
            {
                changes: [
                    {
                        resourceType: 'user_manager',
                        relation: 'viewer',
                        previousRoleIds: [1],
                        nextRoleIds: [2]
                    }
                ]
            },
            'operator_1'
        );

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_PERMISSION_UPDATE
        );
        expect(bindingRows).toEqual(
            expect.arrayContaining([
                {
                    resourceType: 'user_manager',
                    resourceId: 'viewer',
                    roleId: 2
                },
                {
                    resourceType: 'user_manager',
                    resourceId: 'creator',
                    roleId: 2
                }
            ])
        );
        expect(bindingRows).not.toEqual(
            expect.arrayContaining([
                {
                    resourceType: 'user_manager',
                    resourceId: 'viewer',
                    roleId: 1
                }
            ])
        );
        expect(mockSpiceDbAuthorizationService.replaceRoleAuthzResourceRelations).toHaveBeenCalledWith(
            1,
            'user_manager',
            [],
            [...CORE_MANAGER_RELATIONS.user_manager]
        );
        expect(mockSpiceDbAuthorizationService.replaceRoleAuthzResourceRelations).toHaveBeenCalledWith(
            2,
            'user_manager',
            ['viewer', 'creator'],
            [...CORE_MANAGER_RELATIONS.user_manager]
        );
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(1, '角色1');
        expect(mockAdminUserStateService.bumpRoleStateVersion).toHaveBeenCalledWith(2, '角色2');
    });

    it('批量应用无变化矩阵时，应直接返回最新矩阵且不写源表或 SpiceDB', async () => {
        const result = await service.applyMatrixChanges(
            {
                changes: [
                    {
                        resourceType: 'user_manager',
                        relation: 'viewer',
                        previousRoleIds: [1],
                        nextRoleIds: [1]
                    }
                ]
            },
            'operator_1'
        );

        expect(result.modules.length).toBeGreaterThan(0);
        expect(mockRbacAuthorizationService.assertPermission).not.toHaveBeenCalled();
        expect(mockPrismaService.authzResourceRoleBinding.deleteMany).not.toHaveBeenCalled();
        expect(mockPrismaService.authzResourceRoleBinding.createMany).not.toHaveBeenCalled();
        expect(mockSpiceDbAuthorizationService.replaceRoleAuthzResourceRelations).not.toHaveBeenCalled();
        expect(mockAdminUserStateService.bumpRoleStateVersion).not.toHaveBeenCalled();
    });

    it('大变更未确认时，应拒绝 apply 并避免写入源表和 SpiceDB', async () => {
        effectiveUsersByRoleId.set(
            1,
            Array.from({ length: 51 }, (_, index) => `u${index + 1}`)
        );
        bindingRows = [];

        await expect(
            service.applyMatrixChanges(
                {
                    changes: [
                        {
                            resourceType: 'user_manager',
                            relation: 'viewer',
                            previousRoleIds: [],
                            nextRoleIds: [1]
                        }
                    ]
                },
                'operator_1'
            )
        ).rejects.toMatchObject({
            bizContext: expect.objectContaining({
                reason: 'large_authz_permission_matrix_change_requires_confirmation'
            })
        });

        expect(mockPrismaService.authzResourceRoleBinding.deleteMany).not.toHaveBeenCalled();
        expect(mockPrismaService.authzResourceRoleBinding.createMany).not.toHaveBeenCalled();
        expect(mockSpiceDbAuthorizationService.replaceRoleAuthzResourceRelations).not.toHaveBeenCalled();
    });

    it('请求当前 manager 不支持的 relation 时，应拒绝并不写源表', async () => {
        await expect(
            service.previewMatrixChanges(
                {
                    changes: [
                        {
                            resourceType: 'user_manager',
                            relation: 'runner',
                            previousRoleIds: [],
                            nextRoleIds: [1]
                        }
                    ]
                } as any,
                'operator_1'
            )
        ).rejects.toMatchObject({
            bizCode: 1202
        });

        expect(mockPrismaService.authzResourceRoleBinding.deleteMany).not.toHaveBeenCalled();
    });

    it('请求不存在的角色时，应拒绝并不写源表', async () => {
        await expect(
            service.previewMatrixChanges(
                {
                    changes: [
                        {
                            resourceType: 'user_manager',
                            relation: 'viewer',
                            previousRoleIds: [1],
                            nextRoleIds: [999]
                        }
                    ]
                },
                'operator_1'
            )
        ).rejects.toMatchObject({
            bizCode: 1108
        });

        expect(mockPrismaService.authzResourceRoleBinding.deleteMany).not.toHaveBeenCalled();
    });

    it('previousRoleIds 与当前源表快照不一致时，应拒绝并要求前端重新加载矩阵', async () => {
        await expect(
            service.previewMatrixChanges(
                {
                    changes: [
                        {
                            resourceType: 'user_manager',
                            relation: 'viewer',
                            previousRoleIds: [],
                            nextRoleIds: [2]
                        }
                    ]
                },
                'operator_1'
            )
        ).rejects.toMatchObject({
            bizContext: expect.objectContaining({
                reason: 'authz_permission_matrix_snapshot_conflict'
            })
        });

        expect(mockPrismaService.authzResourceRoleBinding.deleteMany).not.toHaveBeenCalled();
    });

    it('SpiceDB 同步失败时，应恢复源表原始快照并尽力恢复 SpiceDB 原始关系', async () => {
        const spiceDbError = new Error('spicedb down');
        mockSpiceDbAuthorizationService.replaceRoleAuthzResourceRelations
            .mockRejectedValueOnce(spiceDbError)
            .mockResolvedValue(undefined);

        await expect(
            service.applyMatrixChanges(
                {
                    changes: [
                        {
                            resourceType: 'user_manager',
                            relation: 'viewer',
                            previousRoleIds: [1],
                            nextRoleIds: [2]
                        }
                    ]
                },
                'operator_1'
            )
        ).rejects.toThrow('spicedb down');

        expect(bindingRows).toEqual(
            expect.arrayContaining([
                {
                    resourceType: 'user_manager',
                    resourceId: 'viewer',
                    roleId: 1
                }
            ])
        );
        expect(bindingRows).not.toEqual(
            expect.arrayContaining([
                {
                    resourceType: 'user_manager',
                    resourceId: 'viewer',
                    roleId: 2
                }
            ])
        );
        expect(mockSpiceDbAuthorizationService.replaceRoleAuthzResourceRelations).toHaveBeenCalledWith(
            1,
            'user_manager',
            ['viewer'],
            [...CORE_MANAGER_RELATIONS.user_manager]
        );
        expect(mockSpiceDbAuthorizationService.replaceRoleAuthzResourceRelations).toHaveBeenCalledWith(
            2,
            'user_manager',
            ['creator'],
            [...CORE_MANAGER_RELATIONS.user_manager]
        );
    });

    it('task_manager 的 manager relation 应使用任务资源分配权限校验', async () => {
        bindingRows = [];

        await service.applyMatrixChanges(
            {
                changes: [
                    {
                        resourceType: 'task_manager',
                        relation: 'manager',
                        previousRoleIds: [],
                        nextRoleIds: [1]
                    }
                ]
            },
            'operator_1'
        );

        expect(mockRbacAuthorizationService.assertPermission).toHaveBeenCalledWith(
            'operator_1',
            RBAC_PERMISSIONS.SYSTEM_ROLE_ASSIGN_TASK_RESOURCE
        );
    });

    it('五类核心 manager relation 白名单均应来自 schema 和数据库授权开关', async () => {
        bindingRows = [];

        const result = await service.previewMatrixChanges(
            {
                changes: [
                    {
                        resourceType: 'user_manager',
                        relation: 'password_resetter',
                        previousRoleIds: [],
                        nextRoleIds: [1]
                    },
                    {
                        resourceType: 'role_manager',
                        relation: 'user_assigner',
                        previousRoleIds: [],
                        nextRoleIds: [2]
                    },
                    {
                        resourceType: 'menu_manager',
                        relation: 'role_assigner',
                        previousRoleIds: [],
                        nextRoleIds: [3]
                    },
                    {
                        resourceType: 'user_group_manager',
                        relation: 'member_assigner',
                        previousRoleIds: [],
                        nextRoleIds: [4]
                    },
                    {
                        resourceType: 'task_manager',
                        relation: 'runner',
                        previousRoleIds: [],
                        nextRoleIds: [5]
                    }
                ]
            },
            'operator_1'
        );

        expect(result.normalizedChanges.map((change) => `${change.resourceType}:${change.relation}`)).toEqual([
            'user_manager:password_resetter',
            'role_manager:user_assigner',
            'menu_manager:role_assigner',
            'user_group_manager:member_assigner',
            'task_manager:runner'
        ]);
        expect(result.createCount).toBe(5);
    });
});
