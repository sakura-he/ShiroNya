import { request } from "@/api/index";
import type { SpiceDBSchemaDefinition } from "@/api/spicedb-data";

export type RoleCoreManagerResourceType = string;
export type RoleCoreManagerRelation = string;

export type AuthzPermissionRoleDto = {
    id: number;
    name: string;
    code: string;
    description: string | null;
    status: string;
    viewerCanUpdate: boolean;
    viewerCanAssignTaskCapability: boolean;
    viewerCanAssignTaskResource: boolean;
};

export type AuthzPermissionSchemaDefinitionDto = SpiceDBSchemaDefinition & {
    configurable: boolean;
    displayName: string;
    authorizationEnabled: boolean;
};

export type AuthzPermissionRelationAssignmentDto = {
    relation: RoleCoreManagerRelation;
    label: string;
    roleIds: number[];
    editableRoleIds: number[];
};

export type AuthzPermissionManagerModuleDto = {
    resourceType: RoleCoreManagerResourceType;
    displayName: string;
    relations: AuthzPermissionRelationAssignmentDto[];
};

export type AuthzPermissionMatrixDto = {
    definitions: AuthzPermissionSchemaDefinitionDto[];
    roles: AuthzPermissionRoleDto[];
    modules: AuthzPermissionManagerModuleDto[];
};

export type AuthzPermissionMatrixChangeDto = {
    resourceType: RoleCoreManagerResourceType;
    relation: RoleCoreManagerRelation;
    previousRoleIds: number[];
    nextRoleIds: number[];
};

export type PreviewAuthzPermissionMatrixDto = {
    changes: AuthzPermissionMatrixChangeDto[];
    impactMode?: "summary" | "precise";
};

export type ApplyAuthzPermissionMatrixDto = PreviewAuthzPermissionMatrixDto & {
    confirmedLargeChange?: boolean;
};

export type AuthzPermissionMatrixPreviewDto = {
    normalizedChanges: Array<
        AuthzPermissionMatrixChangeDto & {
            createRoleIds: number[];
            deleteRoleIds: number[];
        }
    >;
    impactMode: "summary" | "precise";
    createCount: number;
    deleteCount: number;
    affectedRoleCount: number;
    affectedUserCount: number | null;
    affectedGroupCount: number;
    directUserAssignmentCount: number;
    affectedUserEstimate: number;
    affectedRolesSample: AuthzPermissionRoleDto[];
    affectedUsersSample: Array<{
        id: string;
        username: string | null;
        name: string;
    }>;
    confirmationReasons: string[];
    requiresConfirmation: boolean;
};

export type RenameAuthzPermissionResourceDto = {
    resourceType: string;
    displayName: string;
};

// 获取权限管理页的 SpiceDB schema 探测结果和核心 manager 授权矩阵。
export function getAuthzPermissionMatrixApi() {
    return request.get<AuthzPermissionMatrixDto>("/authz-permission/matrix");
}

// 预览权限矩阵批量变更的 tuple 增量和影响范围。
export function previewAuthzPermissionMatrixApi(data: PreviewAuthzPermissionMatrixDto) {
    return request.post<AuthzPermissionMatrixPreviewDto>("/authz-permission/matrix/preview", data);
}

// 应用权限矩阵批量变更。
export function applyAuthzPermissionMatrixApi(data: ApplyAuthzPermissionMatrixDto) {
    return request.post<AuthzPermissionMatrixDto>("/authz-permission/matrix/apply", data);
}

// 重命名权限管理页中 SpiceDB 实体的展示名。
export function renameAuthzPermissionResourceApi(data: RenameAuthzPermissionResourceDto) {
    return request.post<AuthzPermissionMatrixDto>("/authz-permission/rename-resource", data);
}
