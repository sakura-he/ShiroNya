import { request } from "@/api/index";
import {
    type RbacAssigned,
    type RbacListResponse,
    type RbacPermissionDto,
    type RbacRoleDto,
} from "./common";
import { resolveRbacApiPath } from "../app-rbac/target";

function permissionApiPath(action: string) {
    return resolveRbacApiPath(`/rbac/permission/${action}`, `/app-api/rbac/permission/${action}`);
}

export type RbacPermissionRelationsDto = {
    permission: RbacPermissionDto;
    roleIds: number[];
    menuIds: number[];
    effectiveUserIds: string[];
};

export type RbacPermissionPayload = Omit<
    Partial<RbacPermissionDto>,
    "id" | "viewerCanUpdate" | "viewerCanDelete"
>;

export type RbacPermissionCandidateAction = {
    permissionCode: string;
    moduleName: string;
    className: string;
    methodName: string;
    sourceKind: "controller" | "provider";
    name?: string;
    description?: string;
    kind?: string;
};

export type RbacPermissionCandidateTreeNode = {
    key: string;
    title: string;
    type: "module" | "controller" | "provider" | "method";
    sourceKind?: "controller" | "provider";
    moduleName?: string;
    className?: string;
    methodName?: string;
    children?: RbacPermissionCandidateTreeNode[];
};

export type RbacPermissionCandidatesDto = {
    tree: RbacPermissionCandidateTreeNode[];
    actions: RbacPermissionCandidateAction[];
};

export type RbacPermissionDeclarationState = "EXISTS" | "MISSING";

export type RbacPermissionDeclarationDto = RbacPermissionCandidateAction & {
    declarationKey: string;
    databaseState: RbacPermissionDeclarationState;
    permission: RbacPermissionDto | null;
};

export type RbacPermissionDeclarationBoardDto = {
    tree: RbacPermissionCandidateTreeNode[];
    declarations: RbacPermissionDeclarationDto[];
    unassignedPermissions: RbacPermissionDto[];
    meta: {
        viewerCanCreatePermission?: boolean;
        viewerCanUpdatePermission?: boolean;
        viewerCanDeletePermission?: boolean;
    };
};

export function queryRbacPermissionListApi(params?: Record<string, any>) {
    return request.post<RbacListResponse<RbacPermissionDto>>(
        permissionApiPath("query_permission_list"),
        params ?? {},
    );
}

export function createRbacPermissionApi(data: RbacPermissionPayload) {
    return request.post(permissionApiPath("create_permission"), data);
}

export function updateRbacPermissionApi(id: number, data: RbacPermissionPayload) {
    return request.post(permissionApiPath("update_permission"), data, {
        params: { id },
    });
}

export function suggestRbacPermissionCodeApi(data: { permissionCode: string }) {
    return request.post<{ code: string }>(permissionApiPath("suggest_code"), data);
}

export function getRbacPermissionCandidatesApi() {
    return request.get<RbacPermissionCandidatesDto>("/rbac/permission/candidates");
}

export function getRbacPermissionDeclarationBoardApi() {
    return request.get<RbacPermissionDeclarationBoardDto>(permissionApiPath("declaration_board"));
}

export function deleteRbacPermissionApi(id: number) {
    return request.post(permissionApiPath("delete_permission"), null, { params: { id } });
}

export function getRbacPermissionRelationsApi(id: number) {
    return request.get<RbacPermissionRelationsDto>(permissionApiPath("relations"), {
        params: { id },
    });
}

export function queryRbacPermissionRolesApi(data: Record<string, any>) {
    return request.post<RbacListResponse<RbacAssigned<RbacRoleDto>>>(
        permissionApiPath("query_relation_roles"),
        data,
    );
}

export function assignRbacPermissionRolesApi(data: { permissionId: number; roleIds: number[] }) {
    return request.post<null>(permissionApiPath("assign_roles"), data);
}
