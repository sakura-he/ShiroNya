import { BaseRelationProjectionService } from './base-relation-projection.service';

describe('BaseRelationProjectionService', () => {
    const tx = {
        spiceDbUserGroupMemberProjection: {
            upsert: jest.fn(),
            deleteMany: jest.fn()
        },
        spiceDbUserRoleProjection: {
            upsert: jest.fn(),
            deleteMany: jest.fn()
        },
        spiceDbUserGroupRoleProjection: {
            upsert: jest.fn(),
            deleteMany: jest.fn()
        },
        spiceDbMenuRoleProjection: {
            upsert: jest.fn(),
            deleteMany: jest.fn()
        }
    };
    const prismaService = {
        $transaction: jest.fn(),
        spiceDbUserRoleProjection: {
            count: jest.fn(),
            findMany: jest.fn()
        },
        spiceDbUserGroupRoleProjection: {
            groupBy: jest.fn(),
            findMany: jest.fn()
        },
        spiceDbUserGroupMemberProjection: {
            groupBy: jest.fn(),
            findMany: jest.fn()
        },
        rbacRole: {
            findMany: jest.fn()
        },
        rbacUserGroup: {
            findMany: jest.fn()
        },
        rbacMenu: {
            findMany: jest.fn()
        }
    };
    const spiceDbAuthorizationService = {
        lookupUserEffectiveRoleIds: jest.fn()
    };
    let service: BaseRelationProjectionService;

    beforeEach(() => {
        jest.clearAllMocks();
        prismaService.$transaction.mockImplementation(async (callback: any) => await callback(tx));
        service = new BaseRelationProjectionService(prismaService as any, spiceDbAuthorizationService as any);
    });

    it('应用 Watch 事件时，应只投影当前支持的基础关系并保持幂等', async () => {
        const appliedCount = await service.applyPermissionChangeEvents([
            {
                operation: 'OPERATION_CREATE',
                resourceType: 'user_group',
                resourceId: '10',
                relation: 'member',
                subjectType: 'user',
                subjectId: 'user_1',
                zedToken: 'zed-1'
            },
            {
                operation: 'OPERATION_TOUCH',
                resourceType: 'role',
                resourceId: '5',
                relation: 'assignee',
                subjectType: 'user',
                subjectId: 'user_1',
                zedToken: 'zed-1'
            },
            {
                operation: 'OPERATION_DELETE',
                resourceType: 'menu',
                resourceId: '9',
                relation: 'viewer',
                subjectType: 'role',
                subjectId: '5',
                subjectRelation: 'assigned',
                zedToken: 'zed-1'
            },
            {
                operation: 'OPERATION_CREATE',
                resourceType: 'role',
                resourceId: '5',
                relation: 'enabled',
                subjectType: 'user',
                subjectId: '*',
                zedToken: 'zed-1'
            }
        ]);

        expect(appliedCount).toBe(3);
        expect(tx.spiceDbUserGroupMemberProjection.upsert).toHaveBeenCalledWith({
            where: {
                userId_groupId: {
                    userId: 'user_1',
                    groupId: 10
                }
            },
            create: {
                userId: 'user_1',
                groupId: 10,
                zedToken: 'zed-1'
            },
            update: {
                zedToken: 'zed-1'
            }
        });
        expect(tx.spiceDbUserRoleProjection.upsert).toHaveBeenCalledWith({
            where: {
                userId_roleId: {
                    userId: 'user_1',
                    roleId: 5
                }
            },
            create: {
                userId: 'user_1',
                roleId: 5,
                zedToken: 'zed-1'
            },
            update: {
                zedToken: 'zed-1'
            }
        });
        expect(tx.spiceDbMenuRoleProjection.deleteMany).toHaveBeenCalledWith({
            where: {
                menuId: 9,
                roleId: 5,
                relation: 'viewer'
            }
        });
    });

    it('汇总角色影响范围时，应只读取投影表聚合计数，不展开用户清单', async () => {
        prismaService.spiceDbUserRoleProjection.count.mockResolvedValue(3);
        prismaService.spiceDbUserGroupRoleProjection.groupBy.mockResolvedValue([
            {
                groupId: 10,
                _count: {
                    _all: 2
                }
            },
            {
                groupId: 11,
                _count: {
                    _all: 1
                }
            }
        ]);
        prismaService.spiceDbUserGroupMemberProjection.groupBy.mockResolvedValue([
            {
                groupId: 10,
                _count: {
                    _all: 4
                }
            },
            {
                groupId: 11,
                _count: {
                    _all: 2
                }
            }
        ]);

        const summary = await service.getRoleImpactSummary([1, 1, 2]);

        expect(summary).toEqual({
            roleCount: 2,
            affectedGroupCount: 2,
            directUserAssignmentCount: 3,
            groupMemberAssignmentCount: 6,
            affectedUserEstimate: 9
        });
        expect(prismaService.spiceDbUserRoleProjection.count).toHaveBeenCalledWith({
            where: {
                roleId: {
                    in: [1, 2]
                }
            }
        });
        expect(prismaService.spiceDbUserGroupMemberProjection.groupBy).toHaveBeenCalledWith({
            by: ['groupId'],
            where: {
                groupId: {
                    in: [10, 11]
                }
            },
            _count: {
                _all: true
            }
        });
    });

    it('批量计算用户有效角色时，应使用投影表和业务状态过滤，不回查 SpiceDB', async () => {
        prismaService.spiceDbUserRoleProjection.findMany.mockResolvedValue([
            {
                userId: 'u1',
                roleId: 1
            },
            {
                userId: 'u2',
                roleId: 3
            }
        ]);
        prismaService.spiceDbUserGroupMemberProjection.findMany.mockResolvedValue([
            {
                userId: 'u1',
                groupId: 10
            },
            {
                userId: 'u2',
                groupId: 11
            }
        ]);
        prismaService.rbacUserGroup.findMany.mockResolvedValue([
            {
                id: 10
            }
        ]);
        prismaService.spiceDbUserGroupRoleProjection.findMany.mockResolvedValue([
            {
                groupId: 10,
                roleId: 2
            }
        ]);
        prismaService.rbacRole.findMany.mockResolvedValue([
            {
                id: 1,
                code: 'admin'
            },
            {
                id: 2,
                code: 'ops'
            }
        ]);

        const result = await service.getBatchUserEffectiveRoleIds(['u1', 'u2']);

        expect(result.get('u1')).toEqual([1, 2]);
        expect(result.get('u2')).toEqual([]);
        expect(spiceDbAuthorizationService.lookupUserEffectiveRoleIds).not.toHaveBeenCalled();
        expect(prismaService.rbacUserGroup.findMany).toHaveBeenCalledWith({
            where: {
                id: {
                    in: [10, 11]
                },
                status: 'ENABLE'
            },
            select: {
                id: true
            }
        });
    });
});
