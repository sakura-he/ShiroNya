import { Inject, Injectable } from '@nestjs/common';
import { Effect, type Match, type Policy, type ResourceRule } from '@cerbos/core';
import {
    CERBOS_ABAC_BIND_BUILTIN,
    CERBOS_ABAC_BUILTIN_RESOURCE,
    CERBOS_ABAC_DEFAULT_VERSION,
    CERBOS_ABAC_MODULE_OPTIONS,
    CERBOS_ABAC_PRISMA,
    CERBOS_ABAC_RUNTIME_ROLE,
    CERBOS_ABAC_STATUS_ENABLE
} from '../constants';
import { mapFieldRow } from '../field-registry-utils';
import type {
    CerbosAbacCompiledPolicy,
    CerbosAbacCompileResult,
    CerbosAbacConditionNodeInput,
    CerbosAbacFieldDefinition,
    CerbosAbacMatchType,
    CerbosAbacOperator,
    CerbosAbacValueType,
    NormalizedCerbosAbacModuleOptions,
    PrismaLike
} from '../types';
import { isRecord, safeCodeSegment, sha256, stableStringify } from '../utils';

type ConditionRow = CerbosAbacConditionNodeInput & {
    id: string;
    parentId: string | null;
    sort: number;
};

export type CerbosAbacBuiltInConditionValidation = {
    valid: boolean;
    errors: string[];
    warnings: string[];
    match: Match | null;
};

@Injectable()
export class CerbosAbacCompilerService {
    constructor(
        @Inject(CERBOS_ABAC_PRISMA) private readonly prisma: PrismaLike,
        @Inject(CERBOS_ABAC_MODULE_OPTIONS) private readonly options: NormalizedCerbosAbacModuleOptions
    ) {}

    async getFieldRegistry() {
        return {
            fields: await this.getActiveFieldRegistry()
        };
    }

    async compileAll(): Promise<CerbosAbacCompileResult> {
        const warnings: string[] = [];
        const policies: CerbosAbacCompiledPolicy[] = [];

        policies.push(await this.compileBuiltInPolicy(warnings));

        const bundleHash = sha256(stableStringify(policies.map((item) => item.policy)));
        return {
            appName: this.options.appName,
            policies,
            bundleHash,
            warnings,
            generatedAt: new Date().toISOString()
        };
    }

    async validateBuiltInConditionNodes(
        nodes: CerbosAbacConditionNodeInput[],
        groupMatchType: CerbosAbacMatchType = 'ALL'
    ): Promise<CerbosAbacBuiltInConditionValidation> {
        const warnings: string[] = [];
        try {
            if (nodes.length === 0) {
                throw new Error('策略组至少需要一个条件节点');
            }
            const match = await this.compileConditionNodes(nodes, groupMatchType);
            if (!match) {
                warnings.push('策略组未配置条件，将生成无 condition 的 Cerbos rule');
            }
            return {
                valid: true,
                errors: [],
                warnings,
                match
            };
        } catch (error) {
            return {
                valid: false,
                errors: [error instanceof Error ? error.message : String(error)],
                warnings,
                match: null
            };
        }
    }

    async compileConditionNodes(
        nodes: CerbosAbacConditionNodeInput[],
        groupMatchType: CerbosAbacMatchType = 'ALL'
    ): Promise<Match | null> {
        const rootMatchType = this.assertMatchType(groupMatchType, '策略组 matchType');
        const fieldMap = await this.getFieldMap();
        const normalizedNodes = this.normalizeConditionRows(nodes);
        const rootNodes = normalizedNodes
            .filter((node) => !node.parentId)
            .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
        if (rootNodes.length === 0) {
            if (normalizedNodes.length > 0) {
                throw new Error('条件树缺少根节点或存在循环引用');
            }
            return null;
        }
        this.validateConditionTreeShape(normalizedNodes, rootNodes);
        if (rootNodes.length === 1) {
            return this.compileConditionNode(rootNodes[0], normalizedNodes, fieldMap);
        }
        return this.wrapMatches(
            rootMatchType,
            rootNodes.map((node) => this.compileConditionNode(node, normalizedNodes, fieldMap))
        );
    }

    private async compileBuiltInPolicy(warnings: string[]): Promise<CerbosAbacCompiledPolicy> {
        const groups = await this.prisma.cerbosAbacPolicyGroup.findMany({
            where: {
                status: CERBOS_ABAC_STATUS_ENABLE,
                deletedAt: null
            },
            include: {
                permissions: {
                    include: {
                        permission: true
                    }
                },
                conditions: true
            },
            orderBy: { updatedAt: 'desc' }
        });

        const rules: ResourceRule[] = [];
        for (const group of groups) {
            const groupLabel = String(group.name ?? group.id);
            const actions: string[] = (group.permissions ?? [])
                .map((item: any) => item.permission)
                .filter(
                    (permission: any) =>
                        permission &&
                        permission.status === CERBOS_ABAC_STATUS_ENABLE &&
                        permission.deletedAt === null &&
                        permission.bindType === CERBOS_ABAC_BIND_BUILTIN
                )
                .map((permission: any) => String(permission.code));
            if (actions.length === 0) {
                warnings.push(`策略组 ${groupLabel} 没有可编译的 BUILTIN 权限码，已跳过`);
                continue;
            }

            if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
                warnings.push(`策略组 ${groupLabel} 未配置条件，已跳过`);
                continue;
            }
            let match: Match | null = null;
            try {
                match = await this.compileConditionNodes(group.conditions, group.matchType ?? 'ALL');
            } catch (error) {
                warnings.push(
                    `策略组 ${groupLabel} 条件树校验失败，已跳过：${error instanceof Error ? error.message : String(error)}`
                );
                continue;
            }
            rules.push({
                name: `builtin_${safeCodeSegment(String(group.id))}`,
                actions: [...new Set(actions)],
                effect: group.effect === 'DENY' ? Effect.DENY : Effect.ALLOW,
                roles: [CERBOS_ABAC_RUNTIME_ROLE],
                ...(match ? { condition: { match } } : {})
            });
        }

        const policy: Policy = {
            apiVersion: 'api.cerbos.dev/v1',
            resourcePolicy: {
                resource: CERBOS_ABAC_BUILTIN_RESOURCE,
                version: CERBOS_ABAC_DEFAULT_VERSION,
                rules
            }
        };

        return this.toCompiledPolicy({
            sourceType: 'BUILTIN_MAIN',
            resourceName: CERBOS_ABAC_BUILTIN_RESOURCE,
            version: CERBOS_ABAC_DEFAULT_VERSION,
            policy,
            ruleCount: rules.length,
            actionCount: new Set(rules.flatMap((rule) => rule.actions)).size
        });
    }

    private normalizeConditionRows(nodes: CerbosAbacConditionNodeInput[]): ConditionRow[] {
        const normalized = nodes.map((node, index) => {
            if (!isRecord(node)) {
                throw new Error(`条件节点 ${index + 1} 必须是对象`);
            }
            const id = String(node.id ?? '').trim() || `condition_${index}`;
            const parentId = node.parentId ? String(node.parentId) : null;
            if (parentId === id) {
                throw new Error(`条件节点 ${id} 不能把自己作为父节点`);
            }
            if (node.nodeType !== 'GROUP' && node.nodeType !== 'EXPR') {
                throw new Error(`条件节点 ${id} nodeType 必须是 GROUP 或 EXPR`);
            }
            if (node.nodeType === 'GROUP' && node.matchType) {
                this.assertMatchType(node.matchType, `条件组 ${id} matchType`);
            }
            return {
                ...node,
                id,
                parentId,
                sort: Number(node.sort ?? index)
            };
        });
        const ids = new Set(normalized.map((node) => node.id));
        const duplicateIds = normalized
            .map((node) => node.id)
            .filter((id, index, allIds) => allIds.indexOf(id) !== index);
        if (duplicateIds.length > 0) {
            throw new Error(`条件节点 id 重复：${Array.from(new Set(duplicateIds)).join(', ')}`);
        }
        const orphan = normalized.find((node) => node.parentId && !ids.has(node.parentId));
        if (orphan) {
            throw new Error(`条件节点 ${orphan.id} 的父节点不存在：${orphan.parentId}`);
        }
        return normalized;
    }

    private validateConditionTreeShape(nodes: ConditionRow[], rootNodes: ConditionRow[]) {
        const byParent = new Map<string | null, ConditionRow[]>();
        for (const node of nodes) {
            const parentId = node.parentId ?? null;
            byParent.set(parentId, [...(byParent.get(parentId) ?? []), node]);
        }
        const exprWithChildren = nodes.find(
            (node) => node.nodeType === 'EXPR' && (byParent.get(node.id) ?? []).length > 0
        );
        if (exprWithChildren) {
            throw new Error(`表达式节点 ${exprWithChildren.id} 不能包含子条件`);
        }
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const visit = (node: ConditionRow) => {
            if (visiting.has(node.id)) {
                throw new Error(`条件树存在循环引用：${node.id}`);
            }
            if (visited.has(node.id)) {
                return;
            }
            visiting.add(node.id);
            for (const child of byParent.get(node.id) ?? []) {
                visit(child);
            }
            visiting.delete(node.id);
            visited.add(node.id);
        };
        for (const root of rootNodes) {
            visit(root);
        }
        if (visited.size !== nodes.length) {
            const unreachable = nodes.filter((node) => !visited.has(node.id)).map((node) => node.id);
            throw new Error(`条件树存在无法从根节点到达的节点：${unreachable.join(', ')}`);
        }
    }

    private compileConditionNode(
        node: ConditionRow,
        allNodes: ConditionRow[],
        fieldMap: Map<string, CerbosAbacFieldDefinition>,
        visiting = new Set<string>()
    ): Match {
        if (visiting.has(node.id)) {
            throw new Error(`条件树存在循环引用：${node.id}`);
        }
        visiting.add(node.id);
        if (node.nodeType === 'GROUP') {
            const children = allNodes
                .filter((item) => item.parentId === node.id)
                .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
            if (children.length === 0) {
                throw new Error(`条件组 ${node.id} 没有子条件`);
            }
            const match = this.wrapMatches(
                this.assertMatchType(node.matchType ?? 'ALL', `条件组 ${node.id} matchType`),
                children.map((child) => this.compileConditionNode(child, allNodes, fieldMap, new Set(visiting)))
            );
            visiting.delete(node.id);
            return match;
        }
        const expr = this.compileExprNode(node, fieldMap);
        visiting.delete(node.id);
        return { expr };
    }

    private wrapMatches(matchType: CerbosAbacMatchType, matches: Match[]): Match {
        const normalizedMatchType = this.assertMatchType(matchType, 'matchType');
        if (normalizedMatchType === 'ANY') {
            return { any: { of: matches } };
        }
        if (normalizedMatchType === 'NONE') {
            return { none: { of: matches } };
        }
        return { all: { of: matches } };
    }

    private compileExprNode(node: ConditionRow, fieldMap: Map<string, CerbosAbacFieldDefinition>): string {
        if (node.rawExpr?.trim()) {
            throw new Error('内置策略不开放 RAW_EXPR，请使用手写 JSON rules 页面');
        }
        const operator = node.operator;
        if (!operator) {
            throw new Error(`条件 ${node.id} 缺少 operator`);
        }
        const leftField = this.resolveWhitelistedField(node.leftType, node.leftPath, 'left', fieldMap);
        if (!leftField.operators.includes(operator)) {
            throw new Error(`字段 ${leftField.key} 不支持操作符 ${operator}`);
        }
        const left = leftField.cerbosPath;
        if (operator === 'EMPTY') {
            return this.compileEmptyCheck(left, leftField, true);
        }
        if (operator === 'NOT_EMPTY') {
            return this.compileEmptyCheck(left, leftField, false);
        }
        const right =
            node.rightType === 'CONST'
                ? this.compileConstValue(node.rightValue, leftField, operator)
                : this.compileValue(node.rightType, node.rightPath, node.rightValue, 'right', fieldMap);
        return this.compileOperator(left, operator, right);
    }

    private compileOperator(left: string, operator: CerbosAbacOperator, right: string): string {
        if (operator === 'EQ') return `${left} == ${right}`;
        if (operator === 'NE') return `${left} != ${right}`;
        if (operator === 'GT') return `${left} > ${right}`;
        if (operator === 'GTE') return `${left} >= ${right}`;
        if (operator === 'LT') return `${left} < ${right}`;
        if (operator === 'LTE') return `${left} <= ${right}`;
        if (operator === 'IN') return `${left} in ${right}`;
        if (operator === 'NOT_IN') return `!(${left} in ${right})`;
        if (operator === 'CONTAINS') return `${right} in ${left}`;
        if (operator === 'NOT_CONTAINS') return `!(${right} in ${left})`;
        throw new Error(`不支持的操作符：${operator}`);
    }

    private compileEmptyCheck(left: string, field: CerbosAbacFieldDefinition, empty: boolean): string {
        if (field.dataType === 'string' || field.dataType === 'date') {
            return empty ? `(${left} == null || ${left} == "")` : `(${left} != null && ${left} != "")`;
        }
        if (field.dataType === 'array' || field.dataType === 'object') {
            return empty ? `(${left} == null || size(${left}) == 0)` : `(${left} != null && size(${left}) > 0)`;
        }
        return empty ? `${left} == null` : `${left} != null`;
    }

    private compileValue(
        valueType: CerbosAbacValueType | null | undefined,
        path: string | null | undefined,
        constValue: unknown,
        side: 'left' | 'right',
        fieldMap: Map<string, CerbosAbacFieldDefinition>
    ): string {
        if (valueType === 'CONST') {
            return JSON.stringify(constValue ?? null);
        }
        if (valueType === 'RAW_EXPR') {
            throw new Error('内置策略不开放 RAW_EXPR，请使用手写 JSON rules 页面');
        }
        if (!valueType || !path) {
            throw new Error(`${side} 缺少字段 Key`);
        }
        return this.resolveWhitelistedField(valueType, path, side, fieldMap).cerbosPath;
    }

    private resolveWhitelistedField(
        valueType: CerbosAbacValueType | null | undefined,
        path: string | null | undefined,
        side: 'left' | 'right',
        fieldMap: Map<string, CerbosAbacFieldDefinition>
    ): CerbosAbacFieldDefinition {
        if (!valueType || !path) {
            throw new Error(`${side} 缺少字段 Key`);
        }
        if (valueType === 'CONST') {
            throw new Error(`${side} 不能直接使用 CONST 字段 Key`);
        }
        if (valueType === 'RAW_EXPR') {
            throw new Error('内置策略不开放 RAW_EXPR，请使用手写 JSON rules 页面');
        }
        const field = fieldMap.get(`${valueType}:${path}`) ?? null;
        if (!field) {
            throw new Error(`字段不在 ABAC 白名单内：${valueType}:${path}`);
        }
        return field;
    }

    private compileConstValue(
        value: unknown,
        leftField: CerbosAbacFieldDefinition,
        operator: CerbosAbacOperator
    ): string {
        if (operator === 'IN' || operator === 'NOT_IN') {
            return JSON.stringify(this.normalizeConstArray(value, leftField));
        }
        if (leftField.dataType === 'number') {
            return JSON.stringify(this.normalizeNumber(value, leftField.key));
        }
        if (leftField.dataType === 'boolean') {
            return JSON.stringify(this.normalizeBoolean(value, leftField.key));
        }
        if (leftField.dataType === 'array') {
            return JSON.stringify(value === null || value === undefined ? '' : String(value));
        }
        return JSON.stringify(value === null || value === undefined ? '' : String(value));
    }

    private normalizeConstArray(value: unknown, leftField: CerbosAbacFieldDefinition): unknown[] {
        const values = Array.isArray(value)
            ? value
            : String(value ?? '')
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean);
        if (leftField.dataType === 'number') {
            return values.map((item) => this.normalizeNumber(item, leftField.key));
        }
        if (leftField.dataType === 'boolean') {
            return values.map((item) => this.normalizeBoolean(item, leftField.key));
        }
        return values.map((item) => String(item));
    }

    private assertMatchType(value: unknown, label: string): CerbosAbacMatchType {
        if (value === 'ALL' || value === 'ANY' || value === 'NONE') {
            return value;
        }
        throw new Error(`${label} 必须是 ALL、ANY 或 NONE`);
    }

    private normalizeNumber(value: unknown, fieldKey: string): number {
        const numeric = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(numeric)) {
            throw new Error(`字段 ${fieldKey} 需要数字常量`);
        }
        return numeric;
    }

    private normalizeBoolean(value: unknown, fieldKey: string): boolean {
        if (typeof value === 'boolean') {
            return value;
        }
        if (value === 'true') {
            return true;
        }
        if (value === 'false') {
            return false;
        }
        throw new Error(`字段 ${fieldKey} 需要布尔常量`);
    }

    private async getFieldMap(): Promise<Map<string, CerbosAbacFieldDefinition>> {
        const fields = await this.getActiveFieldRegistry();
        return new Map(fields.map((field) => [`${field.valueType}:${field.key}`, field]));
    }

    private async getActiveFieldRegistry(): Promise<CerbosAbacFieldDefinition[]> {
        const fieldModel = this.prisma.cerbosAbacField;
        if (!fieldModel?.findMany) {
            return [];
        }
        const rows = await fieldModel.findMany({
            where: {
                status: CERBOS_ABAC_STATUS_ENABLE,
                deletedAt: null
            },
            orderBy: [{ key: 'asc' }]
        });
        return Array.isArray(rows) ? rows.map((row: any) => mapFieldRow(row)) : [];
    }

    private toCompiledPolicy(params: {
        sourceType: 'BUILTIN_MAIN';
        sourceId?: string;
        resourceName: string;
        version: string;
        policy: Policy;
        ruleCount: number;
        actionCount: number;
    }): CerbosAbacCompiledPolicy {
        const content = stableStringify(params.policy);
        return {
            policyId: `resource.${params.resourceName}.v${params.version}`,
            sourceType: params.sourceType,
            ...(params.sourceId ? { sourceId: params.sourceId } : {}),
            resourceName: params.resourceName,
            version: params.version,
            policy: params.policy,
            ruleCount: params.ruleCount,
            actionCount: params.actionCount,
            contentHash: sha256(content)
        };
    }

}
