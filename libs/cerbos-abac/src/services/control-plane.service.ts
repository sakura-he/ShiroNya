import { Inject, Injectable } from '@nestjs/common';
import {
    CERBOS_ABAC_BIND_BUILTIN,
    CERBOS_ABAC_BIND_UNBOUND,
    CERBOS_ABAC_DEFAULT_VERSION,
    CERBOS_ABAC_MODULE_OPTIONS,
    CERBOS_ABAC_PRISMA,
    CERBOS_ABAC_STATUS_ENABLE
} from '../constants';
import {
    humanizeFieldKey,
    mapFieldRow,
    normalizeFieldDataType,
    normalizeOperators,
    toDbFieldDataType
} from '../field-registry-utils';
import type {
    CerbosAbacConditionNodeInput,
    CerbosAbacFieldCategory,
    CerbosAbacFieldDefinition,
    CerbosAbacMatchType,
    CerbosAbacValueType,
    NormalizedCerbosAbacModuleOptions,
    PrismaLike
} from '../types';
import { createCerbosAbacId, isRecord, toISOStringValue } from '../utils';
import { CerbosAbacCompilerService } from './compiler.service';
import { CerbosAbacPolicyValidatorService } from './policy-validator.service';
import { CerbosAbacPublisherService } from './publisher.service';
import { CerbosAbacRuntimeService } from './runtime.service';

type RbacPermissionOptionQuery = {
    keyword?: unknown;
    status?: unknown;
    page?: unknown;
    current?: unknown;
    pageSize?: unknown;
};

type FieldRegistryListQuery = {
    category?: unknown;
    keyword?: unknown;
    status?: unknown;
    source?: unknown;
    page?: unknown;
    current?: unknown;
    pageSize?: unknown;
};

@Injectable()
export class CerbosAbacControlPlaneService {
    constructor(
        @Inject(CERBOS_ABAC_PRISMA) private readonly prisma: PrismaLike,
        @Inject(CERBOS_ABAC_MODULE_OPTIONS) private readonly options: NormalizedCerbosAbacModuleOptions,
        private readonly compiler: CerbosAbacCompilerService,
        private readonly policyValidator: CerbosAbacPolicyValidatorService,
        private readonly publisher: CerbosAbacPublisherService,
        private readonly runtime: CerbosAbacRuntimeService
    ) {}

    async getHealth() {
        const [permissionCount, groupCount, manualPolicyCount, release] = await Promise.all([
            this.prisma.cerbosAbacPermission.count({ where: { deletedAt: null } }),
            this.prisma.cerbosAbacPolicyGroup.count({ where: { deletedAt: null } }),
            this.prisma.cerbosManualPolicy.count({ where: { deletedAt: null } }),
            this.prisma.cerbosAbacPolicyRelease.findFirst({
                where: { status: 'ACTIVE' },
                orderBy: { publishedAt: 'desc' }
            })
        ]);
        return {
            appName: this.options.appName,
            unboundRuntimeMode: this.options.unboundRuntimeMode,
            permissionCount,
            groupCount,
            manualPolicyCount,
            activeRelease: release
                ? {
                      id: release.id,
                      revision: release.revision,
                      bundleHash: release.bundleHash,
                      policyCount: release.policyCount,
                      publishedAt: toISOStringValue(release.publishedAt)
                  }
                : null
        };
    }

    async getFieldRegistry() {
        return await this.compiler.getFieldRegistry();
    }

    async listFieldRegistry(query: FieldRegistryListQuery = {}) {
        const fieldModel = this.prisma.cerbosAbacField;
        if (!fieldModel?.findMany) {
            return { fields: [] };
        }
        const category = this.readOptionalString(query.category);
        const keyword = this.readOptionalString(query.keyword);
        const status = this.readOptionalString(query.status);
        const source = this.readOptionalString(query.source);
        const pagination = this.readOptionalPagination(query);
        const where = {
            deletedAt: null,
            ...(this.isFieldCategory(category) ? { category } : {}),
            ...(status === 'ENABLE' || status === 'DISABLE' ? { status } : {}),
            ...(this.isFieldSource(source) ? { source } : {}),
            ...(keyword
                ? {
                      OR: [
                          { key: { contains: keyword, mode: 'insensitive' } },
                          { label: { contains: keyword, mode: 'insensitive' } }
                      ]
                  }
                : {})
        };
        const findManyArgs = {
            where,
            orderBy: [{ category: 'asc' }, { key: 'asc' }]
        };
        const [rows, total] = pagination
            ? await Promise.all([
                  fieldModel.findMany({ ...findManyArgs, skip: pagination.skip, take: pagination.pageSize }),
                  fieldModel.count({ where })
              ])
            : [await fieldModel.findMany(findManyArgs), undefined];
        const fields: CerbosAbacFieldDefinition[] = await Promise.all(
            rows.map(async (row: any) =>
                mapFieldRow({
                    ...row,
                    usageCount: await this.countFieldUsage(row.valueType, row.key)
                })
            )
        );
        return {
            fields,
            ...(pagination
                ? {
                      pagination: {
                          total,
                          page: pagination.page,
                          current: pagination.page,
                          pageSize: pagination.pageSize,
                          totalPages: Math.ceil(Number(total ?? 0) / pagination.pageSize)
                      }
                  }
                : {})
        };
    }

    async upsertField(payload: Record<string, unknown>, actorId?: string) {
        const fieldModel = this.prisma.cerbosAbacField;
        if (!fieldModel?.upsert) {
            return { saved: false, reason: 'ABAC 字段表尚未生成，请先执行数据库结构同步' };
        }
        const id = String(payload.id ?? '').trim();
        const existing = id ? await fieldModel.findUnique({ where: { id } }) : null;
        const category = existing?.locked
            ? existing.category
            : this.normalizeFieldCategory(payload.category, 'USER_EXTENSION');
        const valueType = existing?.locked
            ? existing.valueType
            : this.normalizeFieldValueType(payload.valueType, this.valueTypeForCategory(category));
        const key = existing?.locked ? existing.key : this.normalizeFieldKey(payload.key);
        if (!key) {
            return { saved: false, reason: '字段 Key 不能为空' };
        }
        if (category === 'USER_BASE' && !key.startsWith('session.')) {
            return { saved: false, reason: '用户字段 Key 必须以 session. 开头' };
        }
        if (category === 'USER_EXTENSION' && !key.startsWith('ext.')) {
            return { saved: false, reason: '用户扩展字段 Key 必须以 ext. 开头' };
        }
        const dataType = existing?.locked
            ? normalizeFieldDataType(existing.dataType)
            : normalizeFieldDataType(payload.dataType);
        const operators = normalizeOperators(payload.operators, dataType);
        const fieldId = id || createCerbosAbacId('abac_field');
        const data = {
            category,
            source: existing?.source ?? (category === 'USER_EXTENSION' ? 'CUSTOM' : 'SESSION_DISCOVERED'),
            key,
            label: String(payload.label ?? existing?.label ?? humanizeFieldKey(key)).trim() || humanizeFieldKey(key),
            description: payload.description ? String(payload.description) : null,
            valueType,
            dataType: toDbFieldDataType(dataType),
            operators,
            status: payload.status === 'DISABLE' ? 'DISABLE' : CERBOS_ABAC_STATUS_ENABLE,
            builtin: Boolean(existing?.builtin),
            locked: Boolean(existing?.locked),
            updatedBy: actorId ?? null,
            deletedAt: null
        };
        const row = id
            ? await fieldModel.update({
                  where: { id },
                  data
              })
            : await fieldModel.create({
                  data: {
                      id: fieldId,
                      ...data,
                      createdBy: actorId ?? null
                  }
              });
        await this.writeAudit(actorId, 'field.upsert', row.key, {
            id: row.id,
            key: row.key,
            category: row.category
        });
        return {
            saved: true,
            field: mapFieldRow({ ...row, usageCount: await this.countFieldUsage(row.valueType, row.key) })
        };
    }

    async deleteField(id: string, actorId?: string) {
        const fieldModel = this.prisma.cerbosAbacField;
        if (!fieldModel?.findUnique) {
            return { deleted: false, reason: 'ABAC 字段表尚未生成，请先执行数据库结构同步' };
        }
        const field = await fieldModel.findUnique({ where: { id } });
        if (!field || field.deletedAt) {
            return { deleted: true };
        }
        if (field.builtin || field.locked) {
            return { deleted: false, reason: '内置或会话发现字段不能删除，可改为停用' };
        }
        const usageCount = await this.countFieldUsage(field.valueType, field.key);
        if (usageCount > 0) {
            return { deleted: false, reason: `字段仍被 ${usageCount} 个条件节点引用，不能删除` };
        }
        await fieldModel.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                updatedBy: actorId ?? null
            }
        });
        await this.writeAudit(actorId, 'field.delete', field.key, { id, key: field.key });
        return { deleted: true };
    }

    async listRbacPermissionOptions(query: RbacPermissionOptionQuery = {}) {
        const keyword = this.readOptionalString(query.keyword);
        const status = this.readOptionalString(query.status);
        const pagination = this.readOptionalPagination(query);
        const normalizedStatus = status === 'DISABLE' ? 'DISABLE' : CERBOS_ABAC_STATUS_ENABLE;
        const numericKeyword = Number(keyword);
        const idFilter =
            keyword && Number.isInteger(numericKeyword) && numericKeyword > 0
                ? [
                      {
                          id: numericKeyword
                      }
                  ]
                : [];
        const where = {
            deletedAt: null,
            status: normalizedStatus,
            ...(keyword
                ? {
                      OR: [
                          ...idFilter,
                          { code: { contains: keyword, mode: 'insensitive' } },
                          { name: { contains: keyword, mode: 'insensitive' } },
                          { description: { contains: keyword, mode: 'insensitive' } },
                          {
                              group: {
                                  is: {
                                      deletedAt: null,
                                      OR: [
                                          { code: { contains: keyword, mode: 'insensitive' } },
                                          { name: { contains: keyword, mode: 'insensitive' } }
                                      ]
                                  }
                              }
                          }
                      ]
                  }
                : {})
        };
        const findManyArgs = {
            where,
            orderBy: [{ sort: 'asc' }, { code: 'asc' }],
            select: {
                id: true,
                code: true,
                name: true,
                description: true,
                status: true,
                groupId: true,
                group: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        sort: true,
                        status: true,
                        deletedAt: true
                    }
                }
            },
            ...(pagination ? { skip: pagination.skip, take: pagination.pageSize } : {})
        };
        const [permissions, total] = pagination
            ? await Promise.all([
                  this.prisma.rbacPermission.findMany(findManyArgs),
                  this.prisma.rbacPermission.count({ where })
              ])
            : [await this.prisma.rbacPermission.findMany(findManyArgs), undefined];

        return {
            permissions: permissions.map(({ group, ...permission }: any) => ({
                ...permission,
                groupId: group && !group.deletedAt ? permission.groupId : null,
                group:
                    group && !group.deletedAt
                        ? {
                              id: group.id,
                              code: group.code,
                              name: group.name,
                              sort: group.sort,
                              status: group.status
                          }
                        : null
            })),
            ...(pagination
                ? {
                      pagination: {
                          total,
                          page: pagination.page,
                          current: pagination.page,
                          pageSize: pagination.pageSize,
                          totalPages: Math.ceil(Number(total ?? 0) / pagination.pageSize)
                      }
                  }
                : {})
        };
    }

    async listPolicyGroups() {
        const groups = await this.prisma.cerbosAbacPolicyGroup.findMany({
            where: { deletedAt: null },
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
        return {
            groups: groups.map((row: any) => this.mapPolicyGroup(row))
        };
    }

    async upsertPolicyGroup(payload: Record<string, unknown>, actorId?: string) {
        const rbacPermissionIds = this.readPositiveIntegerArray(payload.rbacPermissionIds);
        if (rbacPermissionIds.length === 0) {
            return {
                saved: false,
                reason: '策略组至少需要绑定一个 RBAC 权限码'
            };
        }
        const rbacPermissions = await this.prisma.rbacPermission.findMany({
            where: {
                id: { in: rbacPermissionIds },
                deletedAt: null,
                status: CERBOS_ABAC_STATUS_ENABLE
            },
            select: {
                id: true,
                code: true,
                name: true,
                description: true
            }
        });
        if (rbacPermissions.length !== new Set(rbacPermissionIds).size) {
            return {
                saved: false,
                reason: '存在不存在或已禁用的 RBAC 权限码'
            };
        }

        const id = String(payload.id ?? '').trim() || createCerbosAbacId('abac_group');
        const name = String(payload.name ?? '').trim() || `策略组 ${id}`;
        const nodeInputs = Array.isArray(payload.conditions)
            ? (payload.conditions as CerbosAbacConditionNodeInput[])
            : [];
        const rawMatchType = String(payload.matchType ?? 'ALL');
        const conditionValidation = await this.compiler.validateBuiltInConditionNodes(
            nodeInputs,
            rawMatchType as CerbosAbacMatchType
        );
        if (!conditionValidation.valid) {
            return {
                saved: false,
                reason: `条件树校验失败：${conditionValidation.errors.join('；')}`,
                validation: conditionValidation
            };
        }
        const matchType = this.normalizeMatchType(rawMatchType);
        const previousPermissionCodes = await this.getPolicyGroupPermissionCodes(id);
        await this.prisma.$transaction?.(async (tx) => {
            const abacPermissionIdByRbacId = new Map<number, string>();
            for (const rbacPermission of rbacPermissions) {
                const abacPermission = await tx.cerbosAbacPermission.upsert({
                    where: { code: rbacPermission.code },
                    create: {
                        id: createCerbosAbacId('abac_perm'),
                        code: rbacPermission.code,
                        name: rbacPermission.name,
                        description: rbacPermission.description ?? null,
                        source: 'RBAC_SELECTED',
                        rbacPermissionId: rbacPermission.id,
                        rbacPermissionCodeSnap: rbacPermission.code,
                        rbacPermissionNameSnap: rbacPermission.name,
                        bindType: CERBOS_ABAC_BIND_UNBOUND,
                        status: CERBOS_ABAC_STATUS_ENABLE,
                        createdBy: actorId ?? null,
                        updatedBy: actorId ?? null
                    },
                    update: {
                        name: rbacPermission.name,
                        description: rbacPermission.description ?? null,
                        source: 'RBAC_SELECTED',
                        rbacPermissionId: rbacPermission.id,
                        rbacPermissionCodeSnap: rbacPermission.code,
                        rbacPermissionNameSnap: rbacPermission.name,
                        status: CERBOS_ABAC_STATUS_ENABLE,
                        updatedBy: actorId ?? null,
                        deletedAt: null
                    }
                });
                abacPermissionIdByRbacId.set(rbacPermission.id, abacPermission.id);
            }
            await tx.cerbosAbacPolicyGroup.upsert({
                where: { id },
                create: {
                    id,
                    name,
                    description: payload.description ? String(payload.description) : null,
                    effect: payload.effect === 'DENY' ? 'DENY' : 'ALLOW',
                    matchType,
                    status: payload.status === 'DISABLE' ? 'DISABLE' : CERBOS_ABAC_STATUS_ENABLE,
                    version: String(payload.version ?? CERBOS_ABAC_DEFAULT_VERSION),
                    createdBy: actorId ?? null,
                    updatedBy: actorId ?? null
                },
                update: {
                    name,
                    description: payload.description ? String(payload.description) : null,
                    effect: payload.effect === 'DENY' ? 'DENY' : 'ALLOW',
                    matchType,
                    status: payload.status === 'DISABLE' ? 'DISABLE' : CERBOS_ABAC_STATUS_ENABLE,
                    version: String(payload.version ?? CERBOS_ABAC_DEFAULT_VERSION),
                    updatedBy: actorId ?? null,
                    deletedAt: null
                }
            });
            await tx.cerbosAbacPolicyGroupPermission.deleteMany({ where: { groupId: id } });
            await tx.cerbosAbacPolicyGroupPermission.createMany({
                data: rbacPermissionIds.map((rbacPermissionId) => ({
                    groupId: id,
                    permissionId: abacPermissionIdByRbacId.get(rbacPermissionId)!,
                    createdBy: actorId ?? null
                })),
                skipDuplicates: true
            });
            await tx.cerbosAbacConditionNode.deleteMany({ where: { groupId: id } });
            for (const [index, node] of nodeInputs.entries()) {
                await tx.cerbosAbacConditionNode.create({
                    data: this.mapConditionInput(id, node, index)
                });
            }
        });
        await this.recomputePermissionBindTypes();
        await this.runtime.invalidateBindingCache([
            ...previousPermissionCodes,
            ...rbacPermissions.map((permission: any) => String(permission.code))
        ]);
        await this.writeAudit(actorId, 'policy_group.upsert', id, { id, name, rbacPermissionIds });
        return {
            saved: true,
            group: (await this.listPolicyGroups()).groups.find((item: any) => item.id === id) ?? null
        };
    }

    async deletePolicyGroup(id: string, actorId?: string) {
        const previousPermissionCodes = await this.getPolicyGroupPermissionCodes(id);
        await this.prisma.cerbosAbacPolicyGroup.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                updatedBy: actorId ?? null
            }
        });
        await this.recomputePermissionBindTypes();
        await this.runtime.invalidateBindingCache(previousPermissionCodes);
        await this.writeAudit(actorId, 'policy_group.delete', id, { id });
        return { deleted: true };
    }

    async listManualPolicies() {
        const policies = await this.prisma.cerbosManualPolicy.findMany({
            where: { deletedAt: null },
            orderBy: { updatedAt: 'desc' }
        });
        return {
            policies: policies.map((row: any) => this.mapManualPolicy(row))
        };
    }

    async validateManualPolicy(payload: Record<string, unknown>) {
        return await this.policyValidator.validatePolicy(this.readSubmittedManualPolicy(payload));
    }

    async upsertManualPolicy(payload: Record<string, unknown>, actorId?: string) {
        const content = this.readSubmittedManualPolicy(payload);
        const validation = await this.policyValidator.validatePolicy(content);
        if (!validation.valid) {
            return {
                saved: false,
                validation
            };
        }
        const id = this.readManualPolicyId(payload.id);
        const name = this.readManualPolicyName(payload.name);
        const description = this.readManualPolicyDescription(payload.description);
        const policy = validation.policy;
        const resourcePolicy = isRecord(policy) && isRecord(policy.resourcePolicy) ? policy.resourcePolicy : {};
        const resource = String(resourcePolicy.resource ?? '').trim();
        if (!resource) {
            return {
                saved: false,
                validation: {
                    ...validation,
                    valid: false,
                    errors: [...validation.errors, '完整 Cerbos policy 必须包含 resourcePolicy.resource']
                }
            };
        }
        const actionCodes = this.readManualPolicyActionCodes(resourcePolicy);
        if (actionCodes.length === 0) {
            return {
                saved: false,
                validation: {
                    ...validation,
                    valid: false,
                    errors: [...validation.errors, '完整 Cerbos policy 至少需要在 resourcePolicy.rules[].actions 中配置一个 action']
                }
            };
        }
        const cerbosVersion = String(resourcePolicy.version ?? CERBOS_ABAC_DEFAULT_VERSION).trim() || CERBOS_ABAC_DEFAULT_VERSION;
        const validateMessage = validation.warnings.join('\n') || null;
        const data = {
            name: name || resource,
            description,
            status: payload.status === 'DISABLE' ? 'DISABLE' : CERBOS_ABAC_STATUS_ENABLE,
            version: cerbosVersion,
            content: content as any,
            parsedContent: { policy } as any,
            actionCodes: actionCodes as any,
            cerbosResource: resource,
            cerbosVersion,
            validateStatus: 'VALID',
            validateMessage,
            updatedBy: actorId ?? null,
            deletedAt: null
        };
        const savedPolicy = id
            ? await this.prisma.cerbosManualPolicy.update({
                  where: { id },
                  data
              })
            : await this.prisma.cerbosManualPolicy.create({
                  data: {
                      ...data,
                      createdBy: actorId ?? null
                  }
              });
        await this.writeAudit(actorId, 'manual_policy.upsert', String(savedPolicy.id), {
            id: savedPolicy.id,
            name: savedPolicy.name,
            resource,
            cerbosVersion,
            actionCodes
        });
        return {
            saved: true,
            validation,
            policy: this.mapManualPolicy(savedPolicy)
        };
    }

    async deleteManualPolicy(id: string | number, actorId?: string) {
        const manualPolicyId = this.readRequiredManualPolicyId(id);
        await this.prisma.cerbosManualPolicy.update({
            where: { id: manualPolicyId },
            data: {
                deletedAt: new Date(),
                updatedBy: actorId ?? null
            }
        });
        await this.writeAudit(actorId, 'manual_policy.delete', String(manualPolicyId), { id: manualPolicyId });
        return { deleted: true };
    }

    async compilePreview() {
        return await this.compiler.compileAll();
    }

    async previewPublish() {
        return await this.publisher.previewPublish();
    }

    async publish(payload: { reason?: string } = {}, actorId?: string) {
        return await this.publisher.publish(payload, actorId);
    }

    async listReleases() {
        return await this.publisher.listReleases();
    }

    async rollback(revision: string, actorId?: string) {
        return await this.publisher.rollback(revision, actorId);
    }

    async runtimeTest(payload: Record<string, unknown>) {
        const code = String(payload.code ?? '').trim();
        if (!code) {
            return { allowed: false, reason: '权限码 code 不能为空' };
        }
        return await this.runtime.checkByRawInput({
            code,
            principalId: String(payload.principalId ?? 'abac-demo-user'),
            roles: this.readStringArray(payload.roles, ['member']),
            principalAttr: isRecord(payload.principalAttr) ? payload.principalAttr : {},
            resourceId: String(payload.resourceId ?? 'demo-resource'),
            resourceAttr: isRecord(payload.resourceAttr) ? payload.resourceAttr : {}
        });
    }

    private readManualPolicyId(value: unknown): number | null {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        return this.readRequiredManualPolicyId(value);
    }

    private readRequiredManualPolicyId(value: unknown): number {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('手写策略 id 必须是正整数');
        }
        return id;
    }

    private readManualPolicyName(value: unknown): string {
        return String(value ?? '').trim();
    }

    private readManualPolicyDescription(value: unknown): string | null {
        const description = String(value ?? '').trim();
        return description ? description : null;
    }

    private async recomputePermissionBindTypes() {
        const permissions = await this.prisma.cerbosAbacPermission.findMany({
            where: { deletedAt: null },
            include: {
                policyGroups: {
                    include: {
                        group: true
                    }
                }
            }
        });
        for (const permission of permissions) {
            const hasBuiltIn = (permission.policyGroups ?? []).some(
                (item: any) => item.group && item.group.deletedAt === null
            );
            const bindType = hasBuiltIn ? CERBOS_ABAC_BIND_BUILTIN : CERBOS_ABAC_BIND_UNBOUND;
            if (permission.bindType !== bindType) {
                await this.prisma.cerbosAbacPermission.update({
                    where: { id: permission.id },
                    data: { bindType }
                });
            }
        }
    }

    private async getPolicyGroupPermissionCodes(groupId: string): Promise<string[]> {
        if (!groupId) {
            return [];
        }
        const links = await this.prisma.cerbosAbacPolicyGroupPermission.findMany({
            where: { groupId },
            include: {
                permission: true
            }
        });
        return links
            .map((link: any) => link.permission?.code)
            .map((code: unknown) => String(code ?? '').trim())
            .filter(Boolean);
    }

    private mapConditionInput(groupId: string, node: CerbosAbacConditionNodeInput, index: number) {
        const id = String(node.id ?? '').trim() || createCerbosAbacId('abac_cond');
        return {
            id,
            groupId,
            parentId: node.parentId ? String(node.parentId) : null,
            nodeType: node.nodeType === 'GROUP' ? 'GROUP' : 'EXPR',
            matchType: node.matchType ? this.normalizeMatchType(node.matchType) : null,
            leftType: node.leftType ?? null,
            leftPath: node.leftPath ? String(node.leftPath) : null,
            operator: node.operator ?? null,
            rightType: node.rightType ?? null,
            rightPath: node.rightPath ? String(node.rightPath) : null,
            rightValue: node.rightValue === undefined ? undefined : (node.rightValue as any),
            rawExpr: node.rawExpr ? String(node.rawExpr) : null,
            sort: Number(node.sort ?? index)
        };
    }

    private mapPermission(row: any) {
        return {
            id: row.id,
            code: row.code,
            name: row.name,
            description: row.description ?? null,
            source: row.source,
            rbacPermissionId: row.rbacPermissionId ?? null,
            rbacPermissionCodeSnap: row.rbacPermissionCodeSnap ?? null,
            rbacPermissionNameSnap: row.rbacPermissionNameSnap ?? null,
            bindType: row.bindType,
            status: row.status,
            updatedAt: toISOStringValue(row.updatedAt),
            groups: Array.isArray(row.policyGroups)
                ? row.policyGroups
                      .filter((item: any) => item.group)
                      .map((item: any) => ({
                          id: item.group.id,
                          name: item.group.name
                      }))
                : []
        };
    }

    private mapPolicyGroup(row: any) {
        return {
            id: row.id,
            name: row.name,
            description: row.description ?? null,
            effect: row.effect,
            matchType: row.matchType,
            status: row.status,
            version: row.version,
            updatedAt: toISOStringValue(row.updatedAt),
            rbacPermissionIds: Array.isArray(row.permissions)
                ? row.permissions
                      .map((item: any) => item.permission?.rbacPermissionId)
                      .map((id: unknown) => Number(id))
                      .filter((id: number) => Number.isInteger(id) && id > 0)
                : [],
            permissions: Array.isArray(row.permissions)
                ? row.permissions
                      .filter((item: any) => item.permission)
                      .map((item: any) => this.mapPermission(item.permission))
                : [],
            conditions: Array.isArray(row.conditions)
                ? row.conditions
                      .map((node: any) => ({
                          id: node.id,
                          parentId: node.parentId ?? null,
                          nodeType: node.nodeType,
                          matchType: node.matchType ?? null,
                          leftType: node.leftType ?? null,
                          leftPath: node.leftPath ?? null,
                          operator: node.operator ?? null,
                          rightType: node.rightType ?? null,
                          rightPath: node.rightPath ?? null,
                          rightValue: node.rightValue ?? null,
                          rawExpr: node.rawExpr ?? null,
                          sort: node.sort
                      }))
                      .sort((a: any, b: any) => a.sort - b.sort)
                : []
        };
    }

    private mapManualPolicy(row: any) {
        return {
            id: row.id,
            name: row.name,
            description: row.description ?? null,
            status: row.status,
            content: this.readManualPolicyContent(row),
            cerbosResource: row.cerbosResource,
            cerbosVersion: row.cerbosVersion,
            validateStatus: row.validateStatus,
            validateMessage: row.validateMessage ?? null,
            updatedAt: toISOStringValue(row.updatedAt),
            actionCodes: this.readStringArray(row.actionCodes)
        };
    }

    private readSubmittedManualPolicy(payload: Record<string, unknown>): unknown {
        if (isRecord(payload.content)) {
            return payload.content;
        }
        if (isRecord(payload.policy)) {
            return payload.policy;
        }
        return payload;
    }

    private readManualPolicyActionCodes(resourcePolicy: Record<string, unknown>): string[] {
        const rules = Array.isArray(resourcePolicy.rules) ? resourcePolicy.rules : [];
        return [
            ...new Set(
                rules
                    .flatMap((rule) => (isRecord(rule) && Array.isArray(rule.actions) ? rule.actions : []))
                    .map((action) => String(action).trim())
                    .filter(Boolean)
            )
        ];
    }

    private readManualPolicyContent(row: any): Record<string, unknown> {
        if (isRecord(row.content) && isRecord(row.content.resourcePolicy)) {
            return row.content;
        }
        if (isRecord(row.parsedContent) && isRecord(row.parsedContent.policy)) {
            return row.parsedContent.policy;
        }
        return isRecord(row.content) ? row.content : {};
    }

    private async countFieldUsage(valueType: string, key: string): Promise<number> {
        const conditionModel = this.prisma.cerbosAbacConditionNode;
        if (!conditionModel?.count) {
            return 0;
        }
        return await conditionModel.count({
            where: {
                leftType: valueType,
                leftPath: key
            }
        });
    }
    private normalizeFieldCategory(value: unknown, fallback: CerbosAbacFieldCategory): CerbosAbacFieldCategory {
        return this.isFieldCategory(value) ? value : fallback;
    }

    private isFieldCategory(value: unknown): value is CerbosAbacFieldCategory {
        return value === 'USER_BASE' || value === 'USER_EXTENSION' || value === 'RESOURCE' || value === 'REQUEST_CONTEXT';
    }

    private isFieldSource(value: unknown): value is 'SESSION_DISCOVERED' | 'CUSTOM' | 'SYSTEM_BUILTIN' {
        return value === 'SESSION_DISCOVERED' || value === 'CUSTOM' || value === 'SYSTEM_BUILTIN';
    }

    private valueTypeForCategory(category: CerbosAbacFieldCategory): Exclude<CerbosAbacValueType, 'CONST' | 'RAW_EXPR'> {
        if (category === 'RESOURCE') return 'RESOURCE_ATTR';
        if (category === 'REQUEST_CONTEXT') return 'REQUEST_CONTEXT';
        return 'PRINCIPAL_ATTR';
    }

    private normalizeFieldValueType(
        value: unknown,
        fallback: Exclude<CerbosAbacValueType, 'CONST' | 'RAW_EXPR'>
    ): Exclude<CerbosAbacValueType, 'CONST' | 'RAW_EXPR'> {
        if (value === 'PRINCIPAL_ATTR' || value === 'RESOURCE_ATTR' || value === 'REQUEST_CONTEXT') {
            return value;
        }
        return fallback;
    }

    private normalizeFieldKey(value: unknown): string {
        return String(value ?? '')
            .trim()
            .replace(/^\.+|\.+$/g, '')
            .replace(/\s+/g, '');
    }

    private readOptionalString(value: unknown): string | undefined {
        const text = String(value ?? '').trim();
        return text || undefined;
    }

    private readOptionalPagination(query: { page?: unknown; current?: unknown; pageSize?: unknown }) {
        if (query.pageSize === undefined || query.pageSize === null || String(query.pageSize).trim() === '') {
            return null;
        }
        const page = this.readPositiveInteger(query.page ?? query.current, 1);
        const pageSize = Math.min(this.readPositiveInteger(query.pageSize, 10), 100);
        return {
            page,
            pageSize,
            skip: (page - 1) * pageSize
        };
    }

    private readPositiveInteger(value: unknown, fallback: number): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 1) {
            return fallback;
        }
        return Math.floor(numeric);
    }

    private readStringArray(value: unknown, fallback: string[] = []): string[] {
        if (!Array.isArray(value)) {
            return fallback;
        }
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    private readPositiveIntegerArray(value: unknown): number[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return [
            ...new Set(
                value
                    .map((item) => Number(item))
                    .filter((item) => Number.isInteger(item) && item > 0)
                    .map((item) => Math.floor(item))
            )
        ];
    }

    private normalizeMatchType(value: unknown) {
        return value === 'ANY' || value === 'NONE' ? value : 'ALL';
    }

    private async writeAudit(
        actorId: string | undefined,
        action: string,
        resourceKey: string | undefined,
        detail: Record<string, unknown>
    ) {
        await this.prisma.cerbosAbacAuditLog.create({
            data: {
                id: createCerbosAbacId('abac_audit'),
                actorId: actorId ?? null,
                action,
                resourceKey: resourceKey ?? null,
                detailJson: {
                    appName: this.options.appName,
                    ...detail
                } as any
            }
        });
    }
}
