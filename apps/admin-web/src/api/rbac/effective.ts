import { request } from "@/api/index";

export type RbacEffectiveStateDto = {
    userId: string;
    roleIds: number[];
    permissionIds: number[];
    visibleMenuIds: number[];
    isSuperAdmin: boolean;
};

export type RbacRebuildSummaryDto = {
    userCount: number;
    effectiveRoleCount: number;
    effectivePermissionCount: number;
    visibleMenuCount: number;
    superAdminUserCount: number;
    version?: string;
    sample: RbacEffectiveStateDto[];
};

export function getRbacEffectiveOverviewApi() {
    return request.get("/rbac/effective/overview");
}

export function queryRbacUserEffectiveStateApi(data: { userId: string }) {
    return request.post<RbacEffectiveStateDto>(
        "/rbac/effective/query_user_effective_state",
        data,
    );
}

export function previewRbacRebuildApi(data: { userIds?: string[] }) {
    return request.post<RbacRebuildSummaryDto>("/rbac/effective/rebuild/preview", data);
}

export function applyRbacRebuildApi(data: { userIds?: string[] }) {
    return request.post<RbacRebuildSummaryDto>("/rbac/effective/rebuild/apply", data);
}
