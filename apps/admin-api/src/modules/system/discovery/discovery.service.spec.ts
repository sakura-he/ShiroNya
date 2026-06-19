import { RbacDeclarePermissions } from './discovery.decorators';
import { SystemRbacPermissionDiscoveryService } from './discovery.service';

class DemoController {
    list() {
        return [];
    }
}

class DuplicateController {
    first() {
        return null;
    }

    second() {
        return null;
    }
}

class SharedPermissionController {
    read() {
        return null;
    }

    multi() {
        return null;
    }
}

class ClassPermissionController {
    read() {
        return null;
    }

    update() {
        return null;
    }
}

class GetterProvider {
    get broken() {
        throw new Error('getter should not be evaluated while discovering RBAC candidates');
    }

    noop() {
        return null;
    }
}

const listDescriptor = Object.getOwnPropertyDescriptor(DemoController.prototype, 'list')!;
RbacDeclarePermissions({
    permissionCode: 'demo.task.list.read',
    name: '查看任务',
    kind: 'ACTION'
})(DemoController.prototype, 'list', listDescriptor);

const firstDescriptor = Object.getOwnPropertyDescriptor(DuplicateController.prototype, 'first')!;
RbacDeclarePermissions({
    permissionCode: 'demo.duplicate.read',
    name: '重复权限一',
    kind: 'ACTION'
})(DuplicateController.prototype, 'first', firstDescriptor);

const secondDescriptor = Object.getOwnPropertyDescriptor(DuplicateController.prototype, 'second')!;
RbacDeclarePermissions({
    permissionCode: 'demo.duplicate.read',
    name: '重复权限二',
    kind: 'ACTION'
})(DuplicateController.prototype, 'second', secondDescriptor);

const sharedReadDescriptor = Object.getOwnPropertyDescriptor(SharedPermissionController.prototype, 'read')!;
RbacDeclarePermissions({
    permissionCode: 'demo.shared.read',
    name: '共享读取',
    kind: 'ACTION'
})(SharedPermissionController.prototype, 'read', sharedReadDescriptor);

const sharedMultiDescriptor = Object.getOwnPropertyDescriptor(SharedPermissionController.prototype, 'multi')!;
RbacDeclarePermissions({
    permissionCode: 'demo.shared.read',
    name: '共享读取',
    kind: 'ACTION'
})(SharedPermissionController.prototype, 'multi', sharedMultiDescriptor);

RbacDeclarePermissions({
    permissionCode: 'demo.class.view',
    name: '类级权限',
    kind: 'ACTION'
})(ClassPermissionController);

function flattenTreeKeys(nodes: Array<{ key: string; children?: Array<{ key: string; children?: any[] }> }>): string[] {
    return nodes.flatMap((node) => [node.key, ...flattenTreeKeys(node.children ?? [])]);
}

function flattenTreeNodes<T extends { children?: T[] }>(nodes: T[]): T[] {
    return nodes.flatMap((node) => [node, ...flattenTreeNodes(node.children ?? [])]);
}

describe('SystemRbacPermissionDiscoveryService', () => {
    it('扫描权限候选时应跳过无 prototype 的函数 provider，并返回模块树', () => {
        const functionProvider = (() => undefined) as unknown as Function;
        const getControllers = jest.fn().mockReturnValue([
            {
                host: {
                    metatype: {
                        name: 'DemoModule'
                    }
                },
                metatype: DemoController
            }
        ]);
        const getProviders = jest.fn().mockReturnValue([
            {
                host: {
                    metatype: {
                        name: 'DemoModule'
                    }
                },
                metatype: functionProvider
            },
            {
                host: {
                    metatype: {
                        name: 'DemoModule'
                    }
                },
                metatype: GetterProvider
            }
        ]);
        const service = new SystemRbacPermissionDiscoveryService({
            getControllers,
            getProviders
        } as any);

        const candidates = service.getCandidates();
        const cachedCandidates = service.getCandidates();

        expect(candidates.actions).toEqual([
            expect.objectContaining({
                permissionCode: 'demo.task.list.read',
                moduleName: 'DemoModule',
                className: 'DemoController',
                methodName: 'list',
                sourceKind: 'controller',
                name: '查看任务'
            })
        ]);
        expect(candidates.tree).toEqual([
            expect.objectContaining({
                title: 'DemoModule',
                type: 'module',
                children: [
                    expect.objectContaining({
                        title: 'DemoController',
                        type: 'controller',
                        children: [
                            expect.objectContaining({
                                title: 'list',
                                type: 'method'
                            })
                        ]
                    })
                ]
            })
        ]);
        expect(cachedCandidates).toBe(candidates);
        expect(getControllers).toHaveBeenCalledTimes(1);
        expect(getProviders).toHaveBeenCalledTimes(1);
    });

    it('同一个 permissionCode 的展示元数据不一致时应直接报配置错误', () => {
        const service = new SystemRbacPermissionDiscoveryService({
            getControllers: () => [
                {
                    metatype: DuplicateController
                }
            ],
            getProviders: () => []
        } as any);

        expect(() => service.getCandidates()).toThrow('RBAC 权限配置无效');
    });

    it('同一个 permissionCode 被多个方法复用时，方法树节点 key 仍应保持唯一', () => {
        const service = new SystemRbacPermissionDiscoveryService({
            getControllers: () => [
                {
                    host: {
                        metatype: {
                            name: 'DemoModule'
                        }
                    },
                    metatype: SharedPermissionController
                }
            ],
            getProviders: () => []
        } as any);

        const candidates = service.getCandidates();
        const keys = flattenTreeKeys(candidates.tree);
        const nodes = flattenTreeNodes(candidates.tree);

        expect(candidates.actions).toHaveLength(2);
        expect(new Set(keys).size).toBe(keys.length);
        expect(nodes.some((node) => Array.isArray(node.children) && node.children.length === 0)).toBe(false);
        expect(keys).toEqual(
            expect.arrayContaining([
                'method:DemoModule:controller:SharedPermissionController:multi',
                'method:DemoModule:controller:SharedPermissionController:read'
            ])
        );
        expect(keys.some((key) => key.startsWith('permission:'))).toBe(false);
    });

    it('应按 RbacGuard 语义把 controller class 上声明的权限应用到每个 handler', () => {
        const service = new SystemRbacPermissionDiscoveryService({
            getControllers: () => [
                {
                    host: {
                        metatype: {
                            name: 'DemoModule'
                        }
                    },
                    metatype: ClassPermissionController
                }
            ],
            getProviders: () => []
        } as any);

        const candidates = service.getCandidates();

        expect(candidates.actions).toEqual([
            expect.objectContaining({
                permissionCode: 'demo.class.view',
                className: 'ClassPermissionController',
                methodName: 'read'
            }),
            expect.objectContaining({
                permissionCode: 'demo.class.view',
                className: 'ClassPermissionController',
                methodName: 'update'
            })
        ]);
        expect(flattenTreeKeys(candidates.tree)).toEqual(
            expect.arrayContaining([
                'method:DemoModule:controller:ClassPermissionController:read',
                'method:DemoModule:controller:ClassPermissionController:update'
            ])
        );
    });
});
