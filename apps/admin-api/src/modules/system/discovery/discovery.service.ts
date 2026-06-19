import { BusinessException } from '@app/common';
import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { AdminErrorCodes } from '../../../common/constants/index';
import { RBAC_PERMISSION_CANDIDATES_METADATA_KEY, type RbacPermissionCandidateMetadata } from './discovery.decorators';

export type RbacPermissionCandidateAction = RbacPermissionCandidateMetadata & {
    moduleName: string;
    className: string;
    methodName: string;
    sourceKind: 'controller' | 'provider';
};

export type RbacPermissionCandidateTreeNode = {
    key: string;
    title: string;
    type: 'module' | 'controller' | 'provider' | 'method';
    sourceKind?: 'controller' | 'provider';
    moduleName?: string;
    className?: string;
    methodName?: string;
    children?: RbacPermissionCandidateTreeNode[];
};

type RbacDiscoverableItem = {
    kind: 'controller' | 'provider';
    moduleName: string;
    metatype?: Function | null;
};

type RbacDiscoverableMethod = {
    methodName: string;
    method: Function;
};

type RbacPermissionCandidates = {
    tree: RbacPermissionCandidateTreeNode[];
    actions: RbacPermissionCandidateAction[];
};

@Injectable()
export class SystemRbacPermissionDiscoveryService {
    private candidatesCache: RbacPermissionCandidates | null = null;

    constructor(private readonly discoveryService: DiscoveryService) {}

    getCandidates(): RbacPermissionCandidates {
        if (this.candidatesCache) {
            return this.candidatesCache;
        }

        const actions: RbacPermissionCandidateAction[] = [];
        const metadataByPermissionCode = new Map<string, string>();

        for (const item of this.getDiscoverableItems()) {
            if (!item.metatype || !this.isClassLikeMetatype(item.metatype)) {
                continue;
            }

            const className = item.metatype.name;
            const classCandidates = this.getPermissionCandidates(item.metatype);
            for (const { methodName, method } of this.getMethods(item.metatype)) {
                const candidates = this.mergePermissionCandidates(
                    classCandidates,
                    this.getPermissionCandidates(method)
                );
                if (!candidates?.length) {
                    continue;
                }

                for (const candidate of candidates) {
                    this.assertConsistentPermissionCode(metadataByPermissionCode, candidate, className, methodName);
                    actions.push({
                        ...candidate,
                        moduleName: item.moduleName,
                        className,
                        methodName,
                        sourceKind: item.kind
                    });
                }
            }
        }

        const sortedActions = actions.sort((a, b) => a.permissionCode.localeCompare(b.permissionCode));
        this.candidatesCache = {
            tree: this.buildTree(sortedActions),
            actions: sortedActions
        };
        return this.candidatesCache;
    }

    private buildTree(actions: RbacPermissionCandidateAction[]): RbacPermissionCandidateTreeNode[] {
        const moduleNodes = new Map<string, RbacPermissionCandidateTreeNode>();

        for (const action of actions) {
            const moduleNode = this.getOrCreateChild(moduleNodes, {
                key: `module:${action.moduleName}`,
                title: action.moduleName,
                type: 'module',
                moduleName: action.moduleName
            });
            const classNode = this.getOrCreateChild(this.childMap(moduleNode), {
                key: `class:${action.moduleName}:${action.sourceKind}:${action.className}`,
                title: action.className,
                type: action.sourceKind,
                sourceKind: action.sourceKind,
                moduleName: action.moduleName,
                className: action.className
            });
            this.getOrCreateChild(this.childMap(classNode), {
                key: `method:${action.moduleName}:${action.sourceKind}:${action.className}:${action.methodName}`,
                title: action.methodName,
                type: 'method',
                sourceKind: action.sourceKind,
                moduleName: action.moduleName,
                className: action.className,
                methodName: action.methodName
            });
        }

        return this.sortTree([...moduleNodes.values()]);
    }

    private getOrCreateChild(
        nodeByKey: Map<string, RbacPermissionCandidateTreeNode>,
        node: RbacPermissionCandidateTreeNode
    ): RbacPermissionCandidateTreeNode {
        const existing = nodeByKey.get(node.key);
        if (existing) {
            return existing;
        }
        nodeByKey.set(node.key, {
            ...node,
            children: []
        });
        return nodeByKey.get(node.key)!;
    }

    private childMap(node: RbacPermissionCandidateTreeNode): Map<string, RbacPermissionCandidateTreeNode> {
        const mapKey = '__rbac_child_map__';
        const existing = (node as Record<string, unknown>)[mapKey] as
            | Map<string, RbacPermissionCandidateTreeNode>
            | undefined;
        if (existing) {
            return existing;
        }
        const next = new Map<string, RbacPermissionCandidateTreeNode>();
        (node as Record<string, unknown>)[mapKey] = next;
        Object.defineProperty(node, mapKey, {
            enumerable: false
        });
        return next;
    }

    private sortTree(nodes: RbacPermissionCandidateTreeNode[]): RbacPermissionCandidateTreeNode[] {
        return nodes
            .map((node) => {
                const children = this.childMap(node);
                return {
                    ...node,
                    children: children.size > 0 ? this.sortTree([...children.values()]) : undefined
                };
            })
            .sort((a, b) => a.title.localeCompare(b.title));
    }

    private assertConsistentPermissionCode(
        metadataByPermissionCode: Map<string, string>,
        candidate: RbacPermissionCandidateMetadata,
        className: string,
        methodName: string
    ): void {
        const signature = JSON.stringify({
            name: candidate.name ?? null,
            description: candidate.description ?? null,
            kind: candidate.kind ?? null
        });
        const existingSignature = metadataByPermissionCode.get(candidate.permissionCode);
        if (existingSignature && existingSignature !== signature) {
            throw new BusinessException(AdminErrorCodes.RBAC.PERMISSION_CONFIG_INVALID, {
                summary: '同一个 RBAC permissionCode 的展示元数据必须保持一致',
                permissionCode: candidate.permissionCode,
                duplicateOwner: `${className}.${methodName}`
            });
        }
        // permissionCode 只能来自装饰器显式传入，不能再从 class/method/code 自动拼接；同一个 code 可以被多个接口复用。
        metadataByPermissionCode.set(candidate.permissionCode, signature);
    }

    private getDiscoverableItems(): RbacDiscoverableItem[] {
        return [
            ...this.discoveryService.getControllers().map((wrapper) => ({
                kind: 'controller' as const,
                moduleName: this.getModuleName(wrapper),
                metatype: wrapper.metatype
            })),
            ...this.discoveryService.getProviders().map((wrapper) => ({
                kind: 'provider' as const,
                moduleName: this.getModuleName(wrapper),
                metatype: wrapper.metatype
            }))
        ];
    }

    private getPermissionCandidates(target: Function): RbacPermissionCandidateMetadata[] {
        return (
            (Reflect.getMetadata(RBAC_PERMISSION_CANDIDATES_METADATA_KEY, target) as
                | RbacPermissionCandidateMetadata[]
                | undefined) ?? []
        );
    }

    private mergePermissionCandidates(
        classCandidates: RbacPermissionCandidateMetadata[],
        methodCandidates: RbacPermissionCandidateMetadata[]
    ): RbacPermissionCandidateMetadata[] {
        const candidateByPermissionCode = new Map<string, RbacPermissionCandidateMetadata>();
        for (const candidate of [...classCandidates, ...methodCandidates]) {
            candidateByPermissionCode.set(candidate.permissionCode, candidate);
        }
        return [...candidateByPermissionCode.values()];
    }

    private getModuleName(wrapper: unknown): string {
        const host = (wrapper as { host?: { metatype?: { name?: string } } }).host;
        return host?.metatype?.name ?? 'UnknownModule';
    }

    private isClassLikeMetatype(metatype: Function): boolean {
        // Nest Discovery 会返回一部分 factory/函数 provider；它们没有 prototype，不能按 controller/provider class 扫方法。
        return typeof metatype.prototype === 'object' && metatype.prototype !== null;
    }

    private getMethods(metatype: Function): RbacDiscoverableMethod[] {
        const descriptors = Object.getOwnPropertyDescriptors(metatype.prototype);
        return Object.entries(descriptors).flatMap(([name, descriptor]) => {
            if (name === 'constructor') {
                return [];
            }
            // 扫描 DiscoveryService 的 provider/controller 时只能读取 descriptor.value。
            // 直接访问 prototype[name] 可能触发 getter，导致一个无关 provider 把整个候选接口打成 500。
            if (typeof descriptor.value !== 'function') {
                return [];
            }
            return [{ methodName: name, method: descriptor.value }];
        });
    }
}
