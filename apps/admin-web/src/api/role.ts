import { request } from "@/api/index";
import { z } from "zod";
import { resolveRbacApiPath } from "./app-rbac/target";
import type {
    RbacAssigned,
    RbacListResponse,
    RbacPermissionDto,
    RbacRoleDto,
    RbacUserDto,
    RbacUserGroupDto,
} from "./rbac/common";

export const QueryListSchema = z.object({
    pageSize: z.number().optional(),
    page: z.number().optional(),
});
export type QueryListDto = z.infer<typeof QueryListSchema>;

export const DetailRoleSchema = z.object({
    id: z.number(),
    name: z.string(),
    description: z.union([z.string(), z.null()]),
    sort: z.number().optional(),
    isBuiltin: z.boolean().optional(),
    isSuperAdmin: z.boolean().optional(),
    status: z.string(),
    code: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    viewerCanUpdate: z.boolean().optional(),
    viewerCanDelete: z.boolean().optional(),
    viewerCanAssignUser: z.boolean().optional(),
    viewerCanAssignUserGroup: z.boolean().optional(),
    viewerCanAssignParentRole: z.boolean().optional(),
    viewerCanAssignPermission: z.boolean().optional(),
    viewerCanAssignTaskCapability: z.boolean().optional(),
    viewerCanAssignTaskResource: z.boolean().optional(),
});
export type DetailRoleDto = z.infer<typeof DetailRoleSchema>;

export const CreateRoleSchema = z.object({
    name: z.string().trim(),
    description: z.union([z.string().trim().min(1), z.null()]),
    sort: z.number().optional(),
    isBuiltin: z.boolean().optional(),
    isSuperAdmin: z.boolean().optional(),
    status: z.string(),
    code: z.string(),
});
export type CreateRoleDto = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = z.object({
    name: z.string(),
    description: z.union([z.string().trim().min(1), z.null()]),
    sort: z.number().optional(),
    isBuiltin: z.boolean().optional(),
    isSuperAdmin: z.boolean().optional(),
    status: z.string(),
    code: z.string(),
});
export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;

export type RoleListMetaDto = {
    viewerCanCreateRole: boolean;
};

type PaginatedRoleResponse<T, M = Record<string, unknown>> = RbacListResponse<T, M> & {
    pagination: NonNullable<RbacListResponse<T, M>["pagination"]>;
};

function roleApiPath(action: string) {
    return resolveRbacApiPath(`/role/${action}`, `/app-api/rbac/role/${action}`);
}

export type RoleRelationUserDto = {
    id: string;
    username?: string | null;
    name: string;
    email?: string | null;
    banned?: boolean;
    image?: string | null;
};

export type RoleRelationUserGroupDto = {
    id: number;
    name: string;
    code: string;
    description?: string | null;
    status: string;
};

export type RoleAssignableUserGroupDto = RoleRelationUserGroupDto & {
    assigned: boolean;
};

export type RoleAssignableUserDto = RoleRelationUserDto & {
    assigned: boolean;
};

export type RoleRelationsDto = {
    role: DetailRoleDto;
    directUserIds: string[];
    userGroupIds: number[];
    parentRoleIds: number[];
    permissionIds: number[];
    effectivePermissionIds: number[];
    inheritedPermissionIds: number[];
    effectiveUserIds: string[];
};

// 获取角色列表。
export function queryRoleListApi(params?: QueryListDto & Record<string, unknown>) {
    return request<PaginatedRoleResponse<DetailRoleDto, RoleListMetaDto>>({
        url: roleApiPath("query_role_list"),
        method: "post",
        data: params ?? {},
    });
}

// 创建角色。
export function createRoleApi(data: CreateRoleDto) {
    return request({
        url: roleApiPath("create_role"),
        method: "post",
        data,
    });
}

// 更新角色。
export function updateRoleApi(id: number, data: UpdateRoleDto) {
    return request({
        url: roleApiPath("update_role"),
        method: "post",
        params: { id },
        data,
    });
}

// 删除角色。
export function deleteRoleApi(id: number) {
    return request({
        url: roleApiPath("delete_role"),
        method: "post",
        params: { id },
    });
}

// 获取角色的 SpiceDB 关系视图。
export function getRoleRelationsApi(id: number) {
    return request.get<RoleRelationsDto>(roleApiPath("get_role_relations"), { params: { id } });
}

// 分页查询角色可分配用户。
export function getRoleAssignableUsersApi(data: {
    roleId: number;
    page?: number;
    pageSize?: number;
    keyword?: string;
    id?: string;
    username?: string;
    name?: string;
    email?: string;
    assigned?: boolean;
    banned?: boolean;
    draftUserIds: string[];
}) {
    return request.post<PaginatedRoleResponse<RbacAssigned<RbacUserDto>>>(
        roleApiPath("query_assignable_users"),
        data,
    );
}

// 分页查询角色可分配用户组。
export function getRoleAssignableUserGroupsApi(data: {
    roleId: number;
    page?: number;
    pageSize?: number;
    keyword?: string;
    name?: string;
    code?: string;
    description?: string;
    assigned?: boolean;
    status?: string;
    draftUserGroupIds: number[];
}) {
    return request.post<PaginatedRoleResponse<RbacAssigned<RbacUserGroupDto>>>(
        roleApiPath("query_assignable_user_groups"),
        data,
    );
}

// 分页查询角色可继承父角色。
export function queryRoleAssignableParentsApi(data: {
    roleId: number;
    page?: number;
    pageSize?: number;
    keyword?: string;
    name?: string;
    code?: string;
    description?: string;
    assigned?: boolean;
    status?: string;
    draftRoleIds: number[];
}) {
    return request.post<PaginatedRoleResponse<RbacAssigned<RbacRoleDto>>>(
        roleApiPath("query_relation_parent_roles"),
        data,
    );
}

// 分页查询角色可授权权限。
export function queryRoleAssignablePermissionsApi(data: {
    roleId: number;
    page?: number;
    pageSize?: number;
    keyword?: string;
    code?: string;
    name?: string;
    description?: string;
    kind?: string;
    assigned?: boolean;
    status?: string;
    draftPermissionIds: number[];
}) {
    return request.post<PaginatedRoleResponse<RbacAssigned<RbacPermissionDto>>>(
        roleApiPath("query_relation_permissions"),
        data,
    );
}

// 分页查询角色有效用户。
export function getRoleEffectiveUsersApi(data: {
    roleId: number;
    page?: number;
    pageSize?: number;
    keyword?: string;
    id?: string;
    username?: string;
    name?: string;
    email?: string;
    banned?: boolean;
}) {
    return request.post<PaginatedRoleResponse<RbacUserDto>>(
        roleApiPath("query_effective_users"),
        data,
    );
}

// 从角色视角替换直接分配用户。
export function assignRoleUsersApi(data: { roleId: number; userIds: string[] }) {
    return request.post<null>(roleApiPath("assign_users"), data);
}

// 从角色视角替换用户组分配关系。
export function assignRoleUserGroupsApi(data: { roleId: number; userGroupIds: number[] }) {
    return request.post<null>(roleApiPath("assign_user_groups"), data);
}

// 从角色视角替换父角色继承关系。
export function assignRoleParentRolesApi(data: { roleId: number; parentRoleIds: number[] }) {
    return request.post<null>(roleApiPath("assign_parent_roles"), data);
}

// 从角色视角替换直接权限集合。
export function assignRolePermissionsApi(data: { roleId: number; permissionIds: number[] }) {
    return request.post<null>(roleApiPath("assign_permissions"), data);
}
