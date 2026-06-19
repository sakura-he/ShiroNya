import type { ExecutionContext, InjectionToken } from '@nestjs/common';
import type { AttrValue } from '@app/cerbos';
import type { Policy } from '@cerbos/core';

export type CerbosAbacAppName = 'admin-api' | 'app-api';
export type CerbosAbacUnboundRuntimeMode = 'ALLOW' | 'DENY';

export type CerbosAbacModuleOptions = {
    appName: CerbosAbacAppName;
    cerbosEnvPrefix: string;
    prismaServiceToken: InjectionToken;
    imports?: any[];
    unboundRuntimeMode?: CerbosAbacUnboundRuntimeMode;
    runtimeBindingCacheTtlSeconds?: number;
};

export type NormalizedCerbosAbacModuleOptions = {
    appName: CerbosAbacAppName;
    cerbosEnvPrefix: string;
    unboundRuntimeMode: CerbosAbacUnboundRuntimeMode;
    runtimeBindingCacheTtlSeconds: number;
};

export type AbacPermissionOptions = {
    resourceId?: string | ((req: any) => string | Promise<string>);
    resourceAttr?: AttrValue;
    ext?: AttrValue;
};

export type AbacPermissionMetadata = AbacPermissionOptions & {
    code: string;
};

export type CerbosAbacStatus = 'ENABLE' | 'DISABLE';
export type CerbosAbacBindType = 'UNBOUND' | 'BUILTIN';
export type CerbosAbacEffect = 'ALLOW' | 'DENY';
export type CerbosAbacMatchType = 'ALL' | 'ANY' | 'NONE';
export type CerbosAbacConditionNodeType = 'GROUP' | 'EXPR';
export type CerbosAbacValueType = 'PRINCIPAL_ATTR' | 'RESOURCE_ATTR' | 'REQUEST_CONTEXT' | 'CONST' | 'RAW_EXPR';
export type CerbosAbacFieldCategory = 'USER_BASE' | 'USER_EXTENSION' | 'RESOURCE' | 'REQUEST_CONTEXT';
export type CerbosAbacFieldSource = 'SESSION_DISCOVERED' | 'CUSTOM' | 'SYSTEM_BUILTIN';
export type CerbosAbacFieldDataType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date';
export type CerbosAbacOperator =
    | 'EQ'
    | 'NE'
    | 'GT'
    | 'GTE'
    | 'LT'
    | 'LTE'
    | 'IN'
    | 'NOT_IN'
    | 'CONTAINS'
    | 'NOT_CONTAINS'
    | 'EMPTY'
    | 'NOT_EMPTY';

export type CerbosAbacFieldDefinition = {
    id?: string;
    key: string;
    label: string;
    description?: string | null;
    category?: CerbosAbacFieldCategory;
    source?: CerbosAbacFieldSource;
    valueType: Exclude<CerbosAbacValueType, 'CONST' | 'RAW_EXPR'>;
    cerbosPath: string;
    dataType: CerbosAbacFieldDataType;
    operators: CerbosAbacOperator[];
    status?: CerbosAbacStatus;
    builtin?: boolean;
    locked?: boolean;
    usageCount?: number;
    discoveredAt?: string | null;
    lastSeenAt?: string | null;
    updatedAt?: string | null;
};

export type CerbosAbacConditionNodeInput = {
    id?: string;
    parentId?: string | null;
    nodeType: CerbosAbacConditionNodeType;
    matchType?: CerbosAbacMatchType | null;
    leftType?: CerbosAbacValueType | null;
    leftPath?: string | null;
    operator?: CerbosAbacOperator | null;
    rightType?: CerbosAbacValueType | null;
    rightPath?: string | null;
    rightValue?: unknown;
    rawExpr?: string | null;
    sort?: number;
};

export type CerbosAbacCompiledPolicy = {
    policyId: string;
    resourceName: string;
    version: string;
    sourceType: 'BUILTIN_MAIN';
    sourceId?: string;
    policy: Policy;
    ruleCount: number;
    actionCount: number;
    contentHash: string;
};

export type CerbosAbacCompileResult = {
    appName: CerbosAbacAppName;
    policies: CerbosAbacCompiledPolicy[];
    bundleHash: string;
    warnings: string[];
    generatedAt: string;
};

export type CerbosAbacPolicyValidation = {
    valid: boolean;
    errors: string[];
    warnings: string[];
    hash: string;
    policy: Policy | null;
    stdout?: string;
    stderr?: string;
};

export type CerbosAbacRuntimeCheckInput = {
    code: string;
    context: ExecutionContext;
    options?: AbacPermissionOptions;
};

export type PrismaLike = Record<string, any> & {
    $transaction?: (callback: (tx: PrismaLike) => Promise<unknown>) => Promise<unknown>;
};
