import { request } from "@/api/index";

export type AbacTargetApp = "admin-api" | "app-api";
export type AbacBindType = "UNBOUND" | "BUILTIN";
export type AbacStatus = "ENABLE" | "DISABLE";
export type AbacFieldCategory = "USER_BASE" | "USER_EXTENSION" | "RESOURCE" | "REQUEST_CONTEXT";
export type AbacFieldSource = "SESSION_DISCOVERED" | "CUSTOM" | "SYSTEM_BUILTIN";
export type AbacFieldDataType = "string" | "number" | "boolean" | "array" | "object" | "date";

const APP_ABAC_ROUTE_PREFIX = "#/app/app-abac";

export function isAppAbacRoute() {
    return typeof window !== "undefined" && window.location.hash.startsWith(APP_ABAC_ROUTE_PREFIX);
}

export function getCurrentAbacAppName(): AbacTargetApp {
    return isAppAbacRoute() ? "app-api" : "admin-api";
}

export type AbacPermissionDto = {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    source: "RBAC_SELECTED" | "MANUAL_INPUT";
    rbacPermissionId?: number | null;
    rbacPermissionCodeSnap?: string | null;
    rbacPermissionNameSnap?: string | null;
    bindType: AbacBindType;
    status: AbacStatus;
    updatedAt?: string | null;
    groups?: Array<{ id: string; name: string }>;
};

export type AbacRbacPermissionOptionDto = {
    id: number;
    code: string;
    name: string;
    description?: string | null;
    status: AbacStatus;
    groupId?: number | null;
    group?: {
        id: number;
        code: string;
        name: string;
        sort: number;
        status: AbacStatus;
    } | null;
};

export type AbacPagination = {
    total?: number;
    page?: number;
    current?: number;
    pageSize?: number;
    totalPages?: number;
};

export type AbacPolicyGroupDto = {
    id: string;
    name: string;
    description?: string | null;
    effect: "ALLOW" | "DENY";
    matchType: "ALL" | "ANY" | "NONE";
    status: AbacStatus;
    version: string;
    rbacPermissionIds: number[];
    permissions: AbacPermissionDto[];
    conditions: AbacConditionNodeDto[];
    updatedAt?: string | null;
};

export type AbacConditionNodeDto = {
    id?: string;
    parentId?: string | null;
    nodeType: "GROUP" | "EXPR";
    matchType?: "ALL" | "ANY" | "NONE" | null;
    leftType?: "PRINCIPAL_ATTR" | "RESOURCE_ATTR" | "REQUEST_CONTEXT" | "CONST" | "RAW_EXPR" | null;
    leftPath?: string | null;
    operator?: string | null;
    rightType?:
        | "PRINCIPAL_ATTR"
        | "RESOURCE_ATTR"
        | "REQUEST_CONTEXT"
        | "CONST"
        | "RAW_EXPR"
        | null;
    rightPath?: string | null;
    rightValue?: unknown;
    rawExpr?: string | null;
    sort?: number;
};

export type AbacManualPolicyDto = {
    id: number;
    name: string;
    description?: string | null;
    status: AbacStatus;
    content: Record<string, unknown>;
    cerbosResource: string;
    cerbosVersion: string;
    validateStatus: "UNKNOWN" | "VALID" | "INVALID";
    validateMessage?: string | null;
    actionCodes: string[];
    updatedAt?: string | null;
};

export type AbacManualValidation = {
    valid: boolean;
    errors: string[];
    warnings: string[];
    hash: string;
    policy?: Record<string, unknown> | null;
    stdout?: string;
    stderr?: string;
};

export type AbacCompiledPolicy = {
    policyId: string;
    resourceName: string;
    version: string;
    sourceType: "BUILTIN_MAIN";
    sourceId?: string;
    policy: Record<string, unknown>;
    ruleCount: number;
    actionCount: number;
    contentHash: string;
};

export type AbacCompileResponse = {
    appName: AbacTargetApp;
    policies: AbacCompiledPolicy[];
    bundleHash: string;
    warnings: string[];
    generatedAt: string;
};

export type AbacReleaseDto = {
    id: string;
    revision: string;
    bundleHash: string;
    policyCount: number;
    manifest: Record<string, unknown>;
    status: "pending" | "active" | "superseded" | "failed" | "rolled_back";
    reason?: string | null;
    publishedBy?: string | null;
    createdAt?: string | null;
    publishedAt?: string | null;
    errorMessage?: string | null;
};

export type AbacFieldDto = {
    id?: string;
    key: string;
    label: string;
    description?: string | null;
    category?: AbacFieldCategory;
    source?: AbacFieldSource;
    valueType: string;
    cerbosPath: string;
    dataType: AbacFieldDataType;
    operators: string[];
    status?: AbacStatus;
    builtin?: boolean;
    locked?: boolean;
    usageCount?: number;
    discoveredAt?: string | null;
    lastSeenAt?: string | null;
    updatedAt?: string | null;
};

function abacPath(targetApp: AbacTargetApp, path: string) {
    return `${targetApp === "app-api" ? "/app-api/abac" : "/system/abac"}${path}`;
}

export function getAbacHealthApi(targetApp: AbacTargetApp) {
    return request.get<Record<string, unknown>>(abacPath(targetApp, "/health"));
}

export function getAbacFieldsApi(targetApp: AbacTargetApp) {
    return request.get<{ fields: AbacFieldDto[] }>(abacPath(targetApp, "/fields"));
}

export function getAbacFieldRegistryApi(
    targetApp: AbacTargetApp,
    params: Record<string, unknown> = {},
) {
    return request.post<{ fields: AbacFieldDto[]; pagination?: AbacPagination }>(
        abacPath(targetApp, "/field-registry/query"),
        params,
    );
}

export function saveAbacFieldApi(targetApp: AbacTargetApp, data: Partial<AbacFieldDto>) {
    return request.post<{ saved: boolean; field?: AbacFieldDto; reason?: string }>(
        abacPath(targetApp, "/field-registry"),
        data,
    );
}

export function deleteAbacFieldApi(targetApp: AbacTargetApp, id: string) {
    return request.delete<{ deleted: boolean; reason?: string }>(
        abacPath(targetApp, `/field-registry/${id}`),
    );
}

export function getAbacRbacPermissionOptionsApi(
    targetApp: AbacTargetApp,
    params: Record<string, unknown> = {},
) {
    return request.post<{
        permissions: AbacRbacPermissionOptionDto[];
        pagination?: AbacPagination;
    }>(abacPath(targetApp, "/policy-groups/rbac-permission-options/query"), params);
}

export function getAbacPolicyGroupsApi(targetApp: AbacTargetApp) {
    return request.get<{ groups: AbacPolicyGroupDto[] }>(abacPath(targetApp, "/policy-groups"));
}

export function saveAbacPolicyGroupApi(
    targetApp: AbacTargetApp,
    data: Partial<AbacPolicyGroupDto>,
) {
    return request.post<{ saved: boolean; group?: AbacPolicyGroupDto; reason?: string }>(
        abacPath(targetApp, "/policy-groups"),
        data,
    );
}

export function deleteAbacPolicyGroupApi(targetApp: AbacTargetApp, id: string) {
    return request.delete<{ deleted: boolean }>(abacPath(targetApp, `/policy-groups/${id}`));
}

export function getAbacManualPoliciesApi(targetApp: AbacTargetApp) {
    return request.get<{ policies: AbacManualPolicyDto[] }>(
        abacPath(targetApp, "/manual-policies"),
    );
}

export function validateAbacManualPolicyApi(
    targetApp: AbacTargetApp,
    policy: Record<string, unknown>,
) {
    return request.post<AbacManualValidation>(abacPath(targetApp, "/manual-policies/validate"), {
        policy,
    });
}

export function saveAbacManualPolicyApi(
    targetApp: AbacTargetApp,
    data: Pick<
        Partial<AbacManualPolicyDto>,
        "id" | "name" | "description" | "status" | "content"
    > & {
        policy?: Record<string, unknown>;
    },
) {
    return request.post<{
        saved: boolean;
        validation: AbacManualValidation;
        policy?: AbacManualPolicyDto;
        reason?: string;
    }>(abacPath(targetApp, "/manual-policies"), data);
}

export function deleteAbacManualPolicyApi(targetApp: AbacTargetApp, id: number) {
    return request.delete<{ deleted: boolean }>(abacPath(targetApp, `/manual-policies/${id}`));
}

export function getAbacCompilePreviewApi(targetApp: AbacTargetApp) {
    return request.get<AbacCompileResponse>(abacPath(targetApp, "/compile-preview"));
}

export function previewAbacPublishApi(targetApp: AbacTargetApp) {
    return request.post<
        AbacCompileResponse & { changed: boolean; activeRelease: AbacReleaseDto | null }
    >(abacPath(targetApp, "/publish/preview"));
}

export function publishAbacApi(targetApp: AbacTargetApp, reason?: string) {
    return request.post<{ published: boolean; release?: AbacReleaseDto; errorMessage?: string }>(
        abacPath(targetApp, "/publish"),
        { reason },
    );
}

export function getAbacReleasesApi(targetApp: AbacTargetApp) {
    return request.get<{ releases: AbacReleaseDto[] }>(abacPath(targetApp, "/releases"));
}

export function rollbackAbacReleaseApi(targetApp: AbacTargetApp, revision: string) {
    return request.post<{ rolledBack: boolean; release?: AbacReleaseDto; reason?: string }>(
        abacPath(targetApp, `/rollback/${revision}`),
    );
}

export function testAbacRuntimeApi(targetApp: AbacTargetApp, data: Record<string, unknown>) {
    return request.post<Record<string, unknown>>(abacPath(targetApp, "/runtime-test"), data);
}
