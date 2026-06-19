import { AdminSpiceDbAuthorizationService } from './admin-spicedb-authorization.service';

describe('AdminSpiceDbAuthorizationService', () => {
    const toolkit = {
        relationship: {
            readRelationships: jest.fn(),
            touchRelationships: jest.fn(),
            deleteRelationships: jest.fn()
        },
        permission: {
            lookupResources: jest.fn(),
            lookupSubjects: jest.fn(),
            checkPermission: jest.fn(),
            checkBulkPermissions: jest.fn()
        },
        schema: {
            read: jest.fn(),
            write: jest.fn()
        }
    };
    const clientFactory = {
        getClientContext: jest.fn()
    };
    const prismaService = {
        spiceDbUserRoleProjection: {
            findMany: jest.fn()
        },
        spiceDbUserGroupMemberProjection: {
            findMany: jest.fn()
        },
        spiceDbUserGroupRoleProjection: {
            findMany: jest.fn()
        },
        rbacUserGroup: {
            findMany: jest.fn()
        },
        rbacRole: {
            findMany: jest.fn()
        },
        authzResourceRoleBinding: {
            count: jest.fn()
        },
        authzObjectSubjectBinding: {
            findMany: jest.fn()
        }
    };
    let service: AdminSpiceDbAuthorizationService;

    beforeEach(() => {
        jest.clearAllMocks();
        clientFactory.getClientContext.mockResolvedValue({ toolkit });
        prismaService.spiceDbUserRoleProjection.findMany.mockResolvedValue([]);
        prismaService.spiceDbUserGroupMemberProjection.findMany.mockResolvedValue([]);
        prismaService.spiceDbUserGroupRoleProjection.findMany.mockResolvedValue([]);
        prismaService.rbacUserGroup.findMany.mockResolvedValue([]);
        prismaService.rbacRole.findMany.mockResolvedValue([]);
        prismaService.authzResourceRoleBinding.count.mockResolvedValue(0);
        prismaService.authzObjectSubjectBinding.findMany.mockResolvedValue([]);
        toolkit.relationship.readRelationships.mockResolvedValue({
            relationships: [],
            readAt: 'read-token'
        });
        toolkit.relationship.touchRelationships.mockResolvedValue({
            writtenAt: 'write-token'
        });
        toolkit.relationship.deleteRelationships.mockResolvedValue({
            deletedAt: 'delete-token'
        });
        toolkit.permission.checkBulkPermissions.mockResolvedValue({
            results: [],
            checkedAt: 'bulk-token'
        });
        toolkit.permission.checkPermission.mockResolvedValue({
            allowed: true,
            checkedAt: 'check-token'
        });
        service = new AdminSpiceDbAuthorizationService(clientFactory as any, prismaService as any);
    });

    it('设置角色启用状态时，应使用 user:* wildcard relationship 表达 enabled', async () => {
        await service.setRoleEnabled(7, true);
        await service.setRoleEnabled(7, false);

        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'role', id: '7' },
                    relation: 'enabled',
                    subject: { type: 'user', id: '*' }
                }
            ]
        });
        expect(toolkit.relationship.deleteRelationships).toHaveBeenCalledWith({
            filter: {
                resourceType: 'role',
                resourceId: '7',
                relation: 'enabled',
                subjectFilter: {
                    type: 'user',
                    id: '*',
                    relation: undefined
                }
            }
        });
    });

    it('初始化角色基础关系时，只同步 enabled 关系', async () => {
        await service.upsertRoleBase(7, true);

        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'role', id: '7' },
                    relation: 'enabled',
                    subject: { type: 'user', id: '*' }
                }
            ]
        });
        expect(toolkit.relationship.touchRelationships).not.toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'role', id: '7' },
                    relation: 'system',
                    subject: { type: 'system', id: 'admin' }
                }
            ]
        });
    });

    it('查询用户可见菜单时，应只返回 SpiceDB has_permission 的数字资源 ID', async () => {
        toolkit.permission.lookupResources.mockResolvedValueOnce({
            resources: [
                { id: '10', permissionship: 'has_permission' },
                { id: 'abc', permissionship: 'has_permission' },
                { id: '3', permissionship: 'no_permission' },
                { id: '2', permissionship: 'has_permission' }
            ],
            lookedUpAt: 'lookup-token'
        });

        await expect(service.lookupUserVisibleMenuIds('user_1')).resolves.toEqual([2, 10]);
        expect(toolkit.permission.lookupResources).toHaveBeenCalledWith({
            resourceType: 'menu',
            permission: 'view',
            subject: {
                type: 'user',
                id: 'user_1'
            }
        });
    });

    it('初始化任务基础关系时，应写入 manager 和 creator relationship', async () => {
        await service.upsertTaskBase(12, 'user_1');

        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'task_manager', id: 'default' },
                    relation: 'system',
                    subject: { type: 'system', id: 'admin' }
                }
            ]
        });
        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'task', id: '12' },
                    relation: 'manager',
                    subject: { type: 'task_manager', id: 'default' }
                },
                {
                    resource: { type: 'task', id: '12' },
                    relation: 'creator',
                    subject: { type: 'user', id: 'user_1' }
                }
            ]
        });
    });

    it('初始化核心 manager 基础关系时，应写入 manager singleton 到 admin system', async () => {
        await service.upsertCoreManagerBases(['user_manager', 'menu_manager']);

        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'user_manager', id: 'default' },
                    relation: 'system',
                    subject: { type: 'system', id: 'admin' }
                },
                {
                    resource: { type: 'menu_manager', id: 'default' },
                    relation: 'system',
                    subject: { type: 'system', id: 'admin' }
                }
            ]
        });
    });

    it('初始化后台用户对象基础关系时，应写入 user_manager 继承和 self 关系', async () => {
        await service.upsertAdminUserBase('user_1');

        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'user_manager', id: 'default' },
                    relation: 'system',
                    subject: { type: 'system', id: 'admin' }
                }
            ]
        });
        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'admin_user', id: 'user_1' },
                    relation: 'manager',
                    subject: { type: 'user_manager', id: 'default' }
                },
                {
                    resource: { type: 'admin_user', id: 'user_1' },
                    relation: 'self',
                    subject: { type: 'user', id: 'user_1' }
                }
            ]
        });
    });

    it('替换角色核心 manager 关系时，应写入目标关系并删除未选择关系', async () => {
        await service.replaceRoleCoreManagerRelations(5, 'user_manager', ['viewer', 'manager']);

        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'user_manager', id: 'default' },
                    relation: 'viewer',
                    subject: { type: 'role', id: '5' }
                }
            ]
        });
        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'user_manager', id: 'default' },
                    relation: 'manager',
                    subject: { type: 'role', id: '5' }
                }
            ]
        });
        expect(toolkit.relationship.deleteRelationships).toHaveBeenCalledWith({
            filter: {
                resourceType: 'user_manager',
                resourceId: 'default',
                relation: 'creator',
                subjectFilter: {
                    type: 'role',
                    id: '5',
                    relation: undefined
                }
            }
        });
    });

    it('替换角色授权资源关系时，应按支持关系顺序去重并忽略空值和未支持关系', async () => {
        await service.replaceRoleAuthzResourceRelations(5, 'user_manager', ['manager', ' ', 'viewer', 'viewer'], [
            'viewer',
            'creator',
            'manager',
            'viewer'
        ]);

        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'user_manager', id: 'default' },
                    relation: 'system',
                    subject: { type: 'system', id: 'admin' }
                }
            ]
        });
        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'user_manager', id: 'default' },
                    relation: 'viewer',
                    subject: { type: 'role', id: '5' }
                }
            ]
        });
        expect(toolkit.relationship.touchRelationships).toHaveBeenCalledWith({
            relationships: [
                {
                    resource: { type: 'user_manager', id: 'default' },
                    relation: 'manager',
                    subject: { type: 'role', id: '5' }
                }
            ]
        });
        expect(toolkit.relationship.deleteRelationships).toHaveBeenCalledWith({
            filter: {
                resourceType: 'user_manager',
                resourceId: 'default',
                relation: 'creator',
                subjectFilter: {
                    type: 'role',
                    id: '5',
                    relation: undefined
                }
            }
        });
    });

    it('检查核心 manager 权限时，应按 manager singleton 和 user subject 调用 SpiceDB', async () => {
        await expect(service.checkCoreManagerPermission('role_manager', 'create', 'user_1')).resolves.toBe(true);

        expect(toolkit.permission.checkPermission).toHaveBeenCalledWith({
            resource: { type: 'role_manager', id: 'default' },
            permission: 'create',
            subject: { type: 'user', id: 'user_1' }
        });
    });

    it('检查核心 manager 权限命中本地投影时，应跳过 SpiceDB check', async () => {
        prismaService.spiceDbUserRoleProjection.findMany.mockResolvedValueOnce([{ roleId: 5 }]);
        prismaService.rbacRole.findMany.mockResolvedValueOnce([{ id: 5, code: 'role_admin' }]);
        prismaService.authzResourceRoleBinding.count.mockResolvedValueOnce(1);

        await expect(service.checkCoreManagerPermission('role_manager', 'create', 'user_1')).resolves.toBe(true);

        expect(prismaService.authzResourceRoleBinding.count).toHaveBeenCalledWith({
            where: {
                resourceType: 'role_manager',
                resourceId: {
                    in: ['creator', 'manager']
                },
                roleId: {
                    in: [5]
                }
            }
        });
        expect(toolkit.permission.checkPermission).not.toHaveBeenCalled();
    });

    it('断言核心 manager 权限失败时，应抛出权限不足异常', async () => {
        toolkit.permission.checkPermission.mockResolvedValueOnce({
            allowed: false,
            checkedAt: 'check-token'
        });

        await expect(service.assertCoreManagerPermission('menu_manager', 'delete', 'user_1')).rejects.toThrow();
    });

    it('断言核心 manager 权限应直接以 SpiceDB live check 为准', async () => {
        toolkit.permission.checkPermission.mockResolvedValueOnce({
            allowed: false,
            checkedAt: 'check-token'
        });

        await expect(service.assertCoreManagerPermission('role_manager', 'create', 'user_1')).rejects.toThrow();

        expect(toolkit.permission.checkPermission).toHaveBeenCalledWith({
            resource: { type: 'role_manager', id: 'default' },
            permission: 'create',
            subject: { type: 'user', id: 'user_1' }
        });
    });

    it('批量检查核心资源对象权限时，应去重并按资源聚合权限结果', async () => {
        toolkit.permission.checkBulkPermissions.mockResolvedValueOnce({
            results: [
                { allowed: true, checkedAt: 'token-1' },
                { allowed: false, checkedAt: 'token-2' },
                { allowed: false, checkedAt: 'token-3' },
                { allowed: true, checkedAt: 'token-4' }
            ],
            checkedAt: 'bulk-token'
        });

        await expect(
            service.checkCoreManagedResourcePermissions(
                'admin_user',
                ['user_1', 'user_2', 'user_1'],
                ['update', 'delete', 'update'],
                'actor_1'
            )
        ).resolves.toEqual([
            {
                resourceType: 'admin_user',
                resourceId: 'user_1',
                permissions: {
                    update: true,
                    delete: false
                }
            },
            {
                resourceType: 'admin_user',
                resourceId: 'user_2',
                permissions: {
                    update: false,
                    delete: true
                }
            }
        ]);
        expect(toolkit.permission.checkBulkPermissions).toHaveBeenCalledWith({
            items: [
                {
                    resource: { type: 'admin_user', id: 'user_1' },
                    permission: 'update',
                    subject: { type: 'user', id: 'actor_1' }
                },
                {
                    resource: { type: 'admin_user', id: 'user_1' },
                    permission: 'delete',
                    subject: { type: 'user', id: 'actor_1' }
                },
                {
                    resource: { type: 'admin_user', id: 'user_2' },
                    permission: 'update',
                    subject: { type: 'user', id: 'actor_1' }
                },
                {
                    resource: { type: 'admin_user', id: 'user_2' },
                    permission: 'delete',
                    subject: { type: 'user', id: 'actor_1' }
                }
            ],
            consistency: undefined
        });
    });

    it('批量检查核心资源对象权限命中 manager 投影时，应跳过 SpiceDB bulk check', async () => {
        prismaService.spiceDbUserRoleProjection.findMany.mockResolvedValueOnce([{ roleId: 5 }]);
        prismaService.rbacRole.findMany.mockResolvedValueOnce([{ id: 5, code: 'role_admin' }]);
        prismaService.authzResourceRoleBinding.count.mockResolvedValueOnce(1);

        await expect(
            service.checkCoreManagedResourcePermissions('role', ['5', '6'], ['update'], 'actor_1')
        ).resolves.toEqual([
            {
                resourceType: 'role',
                resourceId: '5',
                permissions: {
                    update: true
                }
            },
            {
                resourceType: 'role',
                resourceId: '6',
                permissions: {
                    update: true
                }
            }
        ]);
        expect(prismaService.authzResourceRoleBinding.count).toHaveBeenCalledWith({
            where: {
                resourceType: 'role_manager',
                resourceId: {
                    in: ['updater', 'manager']
                },
                roleId: {
                    in: [5]
                }
            }
        });
        expect(toolkit.permission.checkBulkPermissions).not.toHaveBeenCalled();
    });

    it('断言核心资源对象权限时，应按对象 permission 做 SpiceDB check', async () => {
        await service.assertCoreManagedResourcePermission('role', '5', 'assign_user', 'actor_1');

        expect(toolkit.permission.checkPermission).toHaveBeenCalledWith({
            resource: { type: 'role', id: '5' },
            permission: 'assign_user',
            subject: { type: 'user', id: 'actor_1' }
        });
    });

    it('断言核心资源对象权限应直接以 SpiceDB live check 为准', async () => {
        toolkit.permission.checkPermission.mockResolvedValueOnce({
            allowed: false,
            checkedAt: 'check-token'
        });

        await expect(service.assertCoreManagedResourcePermission('role', '5', 'update', 'actor_1')).rejects.toThrow();

        expect(toolkit.permission.checkPermission).toHaveBeenCalledWith({
            resource: { type: 'role', id: '5' },
            permission: 'update',
            subject: { type: 'user', id: 'actor_1' }
        });
    });

    it('清理角色时，应清理任务 manager 与核心 manager 上的角色关系', async () => {
        await service.cleanupRole(5);

        expect(toolkit.relationship.deleteRelationships).toHaveBeenCalledWith({
            filter: {
                resourceType: 'task_manager',
                relation: 'viewer',
                subjectFilter: {
                    type: 'role',
                    id: '5',
                    relation: undefined
                }
            }
        });
        expect(toolkit.relationship.deleteRelationships).toHaveBeenCalledWith({
            filter: {
                resourceType: 'user_manager',
                relation: 'viewer',
                subjectFilter: {
                    type: 'role',
                    id: '5',
                    relation: undefined
                }
            }
        });
        expect(toolkit.relationship.deleteRelationships).toHaveBeenCalledWith({
            filter: {
                resourceType: 'role_manager',
                relation: 'task_resource_assigner',
                subjectFilter: {
                    type: 'role',
                    id: '5',
                    relation: undefined
                }
            }
        });
    });

    it('检查任务对象权限时，应按 task resource 和 user subject 调用 SpiceDB', async () => {
        await expect(service.checkTaskPermission(12, 'run', 'user_1')).resolves.toBe(true);

        expect(toolkit.permission.checkPermission).toHaveBeenCalledWith({
            resource: { type: 'task', id: '12' },
            permission: 'run',
            subject: { type: 'user', id: 'user_1' }
        });
    });

    it('批量检查任务权限时，应按任务和权限顺序映射结果', async () => {
        toolkit.permission.checkBulkPermissions.mockResolvedValueOnce({
            results: [
                { allowed: true, checkedAt: 'token-1' },
                { allowed: false, checkedAt: 'token-2' },
                { allowed: false, checkedAt: 'token-3' },
                { allowed: true, checkedAt: 'token-4' }
            ],
            checkedAt: 'bulk-token'
        });

        await expect(service.checkTaskPermissions([12, 13], ['update', 'run'], 'user_1')).resolves.toEqual([
            {
                taskId: 12,
                permissions: {
                    update: true,
                    run: false
                }
            },
            {
                taskId: 13,
                permissions: {
                    update: false,
                    run: true
                }
            }
        ]);
        expect(toolkit.permission.checkBulkPermissions).toHaveBeenCalledWith({
            items: [
                {
                    resource: { type: 'task', id: '12' },
                    permission: 'update',
                    subject: { type: 'user', id: 'user_1' }
                },
                {
                    resource: { type: 'task', id: '12' },
                    permission: 'run',
                    subject: { type: 'user', id: 'user_1' }
                },
                {
                    resource: { type: 'task', id: '13' },
                    permission: 'update',
                    subject: { type: 'user', id: 'user_1' }
                },
                {
                    resource: { type: 'task', id: '13' },
                    permission: 'run',
                    subject: { type: 'user', id: 'user_1' }
                }
            ],
            consistency: undefined
        });
    });

    it('批量权限检查应保持输入顺序并返回每项 zedToken', async () => {
        toolkit.permission.checkBulkPermissions.mockResolvedValueOnce({
            results: [
                { allowed: true, checkedAt: 'token-1' },
                { allowed: false, checkedAt: 'token-2' }
            ],
            checkedAt: 'bulk-token'
        });

        const result = await service.checkBulkPermissionsNative({
            items: [
                {
                    resource: { type: 'menu', id: '1' },
                    permission: 'view',
                    subject: { type: 'user', id: 'user_1' }
                },
                {
                    resource: { type: 'menu', id: '2' },
                    permission: 'view',
                    subject: { type: 'user', id: 'user_1' }
                }
            ]
        });

        expect(result).toEqual({
            results: [
                { allowed: true, zedToken: 'token-1' },
                { allowed: false, zedToken: 'token-2' }
            ],
            zedToken: 'bulk-token'
        });
    });

    it('批量权限检查空数组应直接拒绝', async () => {
        await expect(service.checkBulkPermissionsNative({ items: [] })).rejects.toThrow();
        expect(toolkit.permission.checkBulkPermissions).not.toHaveBeenCalled();
    });

    it('批量权限检查结果数量不一致时应报错', async () => {
        toolkit.permission.checkBulkPermissions.mockResolvedValueOnce({
            results: [{ allowed: true, checkedAt: 'token-1' }],
            checkedAt: 'bulk-token'
        });

        await expect(
            service.checkBulkPermissionsNative({
                items: [
                    {
                        resource: { type: 'menu', id: '1' },
                        permission: 'view',
                        subject: { type: 'user', id: 'user_1' }
                    },
                    {
                        resource: { type: 'menu', id: '2' },
                        permission: 'view',
                        subject: { type: 'user', id: 'user_1' }
                    }
                ]
            })
        ).rejects.toThrow();
    });
});
