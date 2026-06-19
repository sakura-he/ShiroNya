import { request } from "@/api/index";

export type RbacTestActionKey =
    | "view"
    | "read"
    | "create"
    | "update"
    | "delete"
    | "admin"
    | "profile"
    | "approve"
    | "publish"
    | "multi";

export type RbacTestPermissionDto = {
    key: Exclude<RbacTestActionKey, "multi">;
    code: string;
    name: string;
    method: "GET" | "POST";
    path: string;
    permissionId: number | null;
    exists: boolean;
    enabled: boolean;
    allowed: boolean;
};

export type RbacTestOverviewDto = {
    user: {
        id: string;
    };
    effectiveState: {
        userId: string;
        roleIds: number[];
        permissionIds: number[];
        visibleMenuIds: number[];
        isSuperAdmin: boolean;
    };
    permissions: RbacTestPermissionDto[];
};

export type RbacTestActionResultDto = {
    ok: boolean;
    userId: string;
    action: RbacTestActionKey;
    permissionCode?: string;
    requiredPermissions?: string[];
    method?: "GET" | "POST";
    path?: string;
    checkedBy: string;
    spicedb: string;
};

export function getRbacTestOverviewApi() {
    return request.get<RbacTestOverviewDto>("/rbac/test/overview");
}

export function runRbacTestActionApi(action: RbacTestActionKey) {
    if (action === "view" || action === "read") {
        return request.get<RbacTestActionResultDto>(`/rbac/test/${action}`);
    }

    return request.post<RbacTestActionResultDto>(`/rbac/test/${action}`);
}
