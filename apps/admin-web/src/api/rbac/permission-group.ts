import { request } from "@/api/index";
import type { RbacListResponse, RbacPermissionGroupDto } from "./common";
import { resolveRbacApiPath } from "../app-rbac/target";

function permissionGroupApiPath(action: string) {
    return resolveRbacApiPath(
        `/rbac/permission-group/${action}`,
        `/app-api/rbac/permission-group/${action}`,
    );
}

export type RbacPermissionGroupPayload = Omit<
    Partial<RbacPermissionGroupDto>,
    | "id"
    | "permissionCount"
    | "menuCount"
    | "viewerCanUpdate"
    | "viewerCanDelete"
    | "viewerCanAssign"
>;

export type RbacPermissionGroupRelationsDto = {
    group: RbacPermissionGroupDto;
    permissionIds: number[];
    menuIds: number[];
};

export type RbacPermissionGroupListMeta = {
    viewerCanCreateGroup?: boolean;
    viewerCanUpdateGroup?: boolean;
    viewerCanDeleteGroup?: boolean;
    viewerCanAssignGroup?: boolean;
};

export function queryRbacPermissionGroupListApi(params?: Record<string, any>) {
    return request.post<RbacListResponse<RbacPermissionGroupDto, RbacPermissionGroupListMeta>>(
        permissionGroupApiPath("query_permission_group_list"),
        params ?? {},
    );
}

export function createRbacPermissionGroupApi(data: RbacPermissionGroupPayload) {
    return request.post(permissionGroupApiPath("create_group"), data);
}

export function updateRbacPermissionGroupApi(id: number, data: RbacPermissionGroupPayload) {
    return request.post(permissionGroupApiPath("update_group"), data, {
        params: { id },
    });
}

export function deleteRbacPermissionGroupApi(id: number) {
    return request.post(permissionGroupApiPath("delete_group"), null, { params: { id } });
}

export function getRbacPermissionGroupRelationsApi(id: number) {
    return request.get<RbacPermissionGroupRelationsDto>(permissionGroupApiPath("relations"), {
        params: { id },
    });
}

export function assignRbacPermissionGroupRelationsApi(data: {
    groupId: number;
    permissionIds: number[];
    menuIds: number[];
}) {
    return request.post<RbacPermissionGroupRelationsDto>(
        permissionGroupApiPath("assign_relations"),
        data,
    );
}
