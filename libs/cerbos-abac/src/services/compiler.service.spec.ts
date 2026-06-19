jest.mock('@cerbos/core', () => ({
    Effect: {
        ALLOW: 'EFFECT_ALLOW',
        DENY: 'EFFECT_DENY'
    }
}));

import { CerbosAbacCompilerService } from './compiler.service';
import type { PrismaLike } from '../types';

const ABAC_FIELD_ROWS = [
    {
        id: 'field-enabled',
        category: 'USER_BASE',
        source: 'SESSION_DISCOVERED',
        key: 'session.user.banned',
        label: 'User banned',
        valueType: 'PRINCIPAL_ATTR',
        dataType: 'BOOLEAN',
        operators: ['EQ', 'NE'],
        status: 'ENABLE',
        builtin: false,
        locked: true
    },
    {
        id: 'field-level',
        category: 'USER_BASE',
        source: 'SESSION_DISCOVERED',
        key: 'session.profile.level',
        label: 'Profile level',
        valueType: 'PRINCIPAL_ATTR',
        dataType: 'NUMBER',
        operators: ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE', 'IN', 'NOT_IN', 'EMPTY', 'NOT_EMPTY'],
        status: 'ENABLE',
        builtin: false,
        locked: true
    },
    {
        id: 'field-phone',
        category: 'USER_BASE',
        source: 'SESSION_DISCOVERED',
        key: 'session.user.phoneNumber',
        label: 'Phone number',
        valueType: 'PRINCIPAL_ATTR',
        dataType: 'STRING',
        operators: ['EQ', 'NE', 'IN', 'NOT_IN', 'EMPTY', 'NOT_EMPTY'],
        status: 'ENABLE',
        builtin: false,
        locked: true
    }
];

function createCompiler(prisma: Partial<PrismaLike> = {}) {
    return new CerbosAbacCompilerService(
        {
            cerbosAbacPolicyGroup: {
                findMany: jest.fn().mockResolvedValue([])
            },
            cerbosAbacField: {
                findMany: jest.fn().mockResolvedValue(ABAC_FIELD_ROWS)
            },
            ...prisma
        } as PrismaLike,
        {
            appName: 'admin-api',
            cerbosEnvPrefix: 'ADMIN_API',
            unboundRuntimeMode: 'ALLOW'
        }
    );
}

describe('CerbosAbacCompilerService', () => {
    it('compiles built-in policy groups into the fixed main resource policy', async () => {
        const compiler = createCompiler({
            cerbosAbacPolicyGroup: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: 'group-1',
                        name: '基础用户状态',
                        effect: 'ALLOW',
                        matchType: 'ALL',
                        permissions: [
                            {
                                permission: {
                                    code: 'system.user.update',
                                    status: 'ENABLE',
                                    deletedAt: null,
                                    bindType: 'BUILTIN'
                                }
                            }
                        ],
                        conditions: [
                            {
                                id: 'enabled',
                                parentId: null,
                                nodeType: 'EXPR',
                                leftType: 'PRINCIPAL_ATTR',
                                leftPath: 'session.user.banned',
                                operator: 'EQ',
                                rightType: 'CONST',
                                rightValue: false,
                                sort: 0
                            },
                            {
                                id: 'level',
                                parentId: null,
                                nodeType: 'EXPR',
                                leftType: 'PRINCIPAL_ATTR',
                                leftPath: 'session.profile.level',
                                operator: 'GTE',
                                rightType: 'CONST',
                                rightValue: 3,
                                sort: 1
                            }
                        ]
                    }
                ])
            }
        });

        const compiled = await compiler.compileAll();
        const builtInPolicy = compiled.policies[0];
        const policy = builtInPolicy.policy as any;
        const rule = policy.resourcePolicy.rules[0];

        expect(builtInPolicy.policyId).toBe('resource.abac_builtin_permission.vdefault');
        expect(policy.resourcePolicy.resource).toBe('abac_builtin_permission');
        expect(policy.resourcePolicy.version).toBe('default');
        expect(rule.name).toBe('builtin_group_1');
        expect(rule.actions).toEqual(['system.user.update']);
        expect(rule.roles).toEqual(['*']);
        expect(rule.condition.match).toEqual({
            all: {
                of: [
                    { expr: 'request.principal.attr.session.user.banned == false' },
                    { expr: 'request.principal.attr.session.profile.level >= 3' }
                ]
            }
        });
    });

    it('rejects built-in fields outside of the whitelist', async () => {
        const compiler = createCompiler();

        const validation = await compiler.validateBuiltInConditionNodes(
            [
                {
                    id: 'expr-1',
                    nodeType: 'EXPR',
                    leftType: 'PRINCIPAL_ATTR',
                    leftPath: 'session.user.passwordHash',
                    operator: 'EQ',
                    rightType: 'CONST',
                    rightValue: 'secret',
                    sort: 0
                }
            ],
            'ALL'
        );

        expect(validation.valid).toBe(false);
        expect(validation.errors.join('\n')).toContain('字段不在 ABAC 白名单内');
    });

    it('rejects empty built-in condition trees', async () => {
        const compiler = createCompiler();

        const validation = await compiler.validateBuiltInConditionNodes([], 'ALL');

        expect(validation.valid).toBe(false);
        expect(validation.errors.join('\n')).toContain('至少需要一个条件节点');
    });

    it('rejects built-in operators not allowed for the selected field', async () => {
        const compiler = createCompiler();

        const validation = await compiler.validateBuiltInConditionNodes(
            [
                {
                    id: 'expr-1',
                    nodeType: 'EXPR',
                    leftType: 'PRINCIPAL_ATTR',
                    leftPath: 'session.user.banned',
                    operator: 'GTE',
                    rightType: 'CONST',
                    rightValue: true,
                    sort: 0
                }
            ],
            'ALL'
        );

        expect(validation.valid).toBe(false);
        expect(validation.errors.join('\n')).toContain('不支持操作符 GTE');
    });

    it('rejects disconnected or cyclic built-in condition trees', async () => {
        const compiler = createCompiler();

        const validation = await compiler.validateBuiltInConditionNodes(
            [
                {
                    id: 'root',
                    nodeType: 'EXPR',
                    leftType: 'PRINCIPAL_ATTR',
                    leftPath: 'session.user.banned',
                    operator: 'EQ',
                    rightType: 'CONST',
                    rightValue: true,
                    sort: 0
                },
                {
                    id: 'group-a',
                    parentId: 'group-b',
                    nodeType: 'GROUP',
                    matchType: 'ALL',
                    sort: 1
                },
                {
                    id: 'group-b',
                    parentId: 'group-a',
                    nodeType: 'GROUP',
                    matchType: 'ANY',
                    sort: 2
                }
            ],
            'ALL'
        );

        expect(validation.valid).toBe(false);
        expect(validation.errors.join('\n')).toContain('无法从根节点到达');
    });

    it('rejects children attached to expression nodes', async () => {
        const compiler = createCompiler();

        const validation = await compiler.validateBuiltInConditionNodes(
            [
                {
                    id: 'expr-parent',
                    nodeType: 'EXPR',
                    leftType: 'PRINCIPAL_ATTR',
                    leftPath: 'session.user.banned',
                    operator: 'EQ',
                    rightType: 'CONST',
                    rightValue: true,
                    sort: 0
                },
                {
                    id: 'expr-child',
                    parentId: 'expr-parent',
                    nodeType: 'EXPR',
                    leftType: 'PRINCIPAL_ATTR',
                    leftPath: 'session.profile.level',
                    operator: 'GTE',
                    rightType: 'CONST',
                    rightValue: 3,
                    sort: 0
                }
            ],
            'ALL'
        );

        expect(validation.valid).toBe(false);
        expect(validation.errors.join('\n')).toContain('不能包含子条件');
    });

    it('generates string empty checks without raw CEL helpers', async () => {
        const compiler = createCompiler();

        const validation = await compiler.validateBuiltInConditionNodes(
            [
                {
                    id: 'phone',
                    nodeType: 'EXPR',
                    leftType: 'PRINCIPAL_ATTR',
                    leftPath: 'session.user.phoneNumber',
                    operator: 'NOT_EMPTY',
                    sort: 0
                }
            ],
            'ALL'
        );

        expect(validation.valid).toBe(true);
        expect(validation.match).toEqual({
            expr: '(request.principal.attr.session.user.phoneNumber != null && request.principal.attr.session.user.phoneNumber != "")'
        });
    });
});
