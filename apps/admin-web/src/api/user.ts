import { z } from "zod";
import { request } from "./index";
import type {
    RbacAssigned,
    RbacListResponse,
    RbacRoleDto,
    RbacUserDto,
    RbacUserGroupDto,
} from "./rbac/common";

export const UserDetailFormSchema = z.object({
    id: z.string(),
    email: z.union([z.string(), z.null()]),
    emailVerified: z.boolean().optional(),
    username: z.string(),
    password: z.union([z.string(), z.null()]).optional(),
    name: z.string(),
    image: z.union([z.string(), z.null()]),
    phoneNumber: z.union([z.string(), z.null()]),
    phoneNumberVerified: z.boolean().optional(),
    displayUsername: z.union([z.string(), z.null()]).optional(),
    role: z.union([z.string(), z.null()]).optional(),
    remark: z.union([z.string(), z.null()]),
    banned: z.boolean(),
    banReason: z.union([z.string(), z.null()]).optional(),
    banExpires: z.union([z.string(), z.date(), z.null()]).optional(),
    roleIds: z.array(z.number()),
    effectiveRoleIds: z.array(z.number()).optional(),
    userGroupIds: z.array(z.number()).optional(),
    userGroups: z
        .array(
            z.object({
                id: z.number(),
                name: z.string(),
                code: z.string(),
                description: z.union([z.string(), z.null()]).optional(),
                status: z.string(),
            }),
        )
        .optional(),
    lastLoginAt: z.union([z.string(), z.date(), z.null()]).optional(),
    createdAt: z.union([z.string(), z.date()]).optional(),
    updatedAt: z.union([z.string(), z.date()]).optional(),
    viewerCanUpdate: z.boolean().optional(),
    viewerCanDelete: z.boolean().optional(),
    viewerCanViewDetail: z.boolean().optional(),
    viewerCanResetPassword: z.boolean().optional(),
    viewerCanViewSession: z.boolean().optional(),
    viewerCanRevokeSession: z.boolean().optional(),
    viewerCanImpersonate: z.boolean().optional(),
    viewerCanAssignRole: z.boolean().optional(),
    viewerCanAssignUserGroup: z.boolean().optional(),
});
export type UserDetailFormDto = z.infer<typeof UserDetailFormSchema>;

export type UserListMetaDto = {
    viewerCanCreateUser: boolean;
    viewerCanImpersonateUser?: boolean;
    viewerCanUpdateUser?: boolean;
    viewerCanDeleteUser?: boolean;
    viewerCanResetPassword?: boolean;
    viewerCanViewSession?: boolean;
    viewerCanRevokeSession?: boolean;
    viewerCanImpersonate?: boolean;
    viewerCanAssignRole?: boolean;
    viewerCanAssignUserGroup?: boolean;
};

type PaginatedUserResponse<T, M = Record<string, unknown>> = RbacListResponse<T, M> & {
    pagination: NonNullable<RbacListResponse<T, M>["pagination"]>;
};

export const CreateUserFormSchema = z.object({
    email: z.union([z.string(), z.null()]),
    username: z.string(),
    password: z.string(),
    name: z.string(),
    image: z.union([z.string(), z.null()]),
    phoneNumber: z.union([z.string(), z.null()]),
    remark: z.union([z.string(), z.null()]),
    banned: z.boolean(),
});
export type CreateUserFormDto = z.infer<typeof CreateUserFormSchema>;

export const UpdateUserFormSchema = z.object({
    id: z.string(),
    email: z.union([z.string(), z.null()]).optional(),
    username: z.string().optional(),
    password: z.union([z.string(), z.null()]).optional(),
    name: z.string().optional(),
    image: z.union([z.string(), z.null()]).optional(),
    phoneNumber: z.union([z.string(), z.null()]).optional(),
    remark: z.union([z.string(), z.null()]).optional(),
    banned: z.union([z.boolean(), z.null()]).optional(),
});
export type UpdateUserFormDto = z.infer<typeof UpdateUserFormSchema>;

export type UserRoleRelationDto = {
    id: number;
    name: string;
    code: string;
    description?: string | null;
    status: string;
};

export type UserMenuRelationDto = {
    id: number;
    title: string;
    type: string;
    requiredPermissionCode: string;
    pid?: number | null;
    status?: string;
};

export type UserGroupRelationDto = {
    id: number;
    name: string;
    code: string;
    description?: string | null;
    status: string;
    roleIds: number[];
    roles: UserRoleRelationDto[];
};

export type UserRelationsDto = {
    user: UserDetailFormDto & RbacUserDto;
    roleIds: number[];
    groupIds: number[];
    effectiveRoleIds: number[];
    effectivePermissionIds: number[];
    userGroupIds: number[];
    visibleMenuIds: number[];
    inheritedRoleIds: number[];
    isSuperAdmin: boolean;
};

export type UserSessionRecordDto = {
    id: string;
    token: string;
    userId: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    impersonatedBy?: string | null;
};

export type UserPublicSessionRecordDto = Omit<UserSessionRecordDto, "token" | "userId"> & {
    userId?: string;
};

export type UserAccountRecordDto = {
    id: string;
    accountId: string;
    providerId: string;
    scope?: string | null;
    accessTokenExpiresAt?: string | Date | null;
    refreshTokenExpiresAt?: string | Date | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
};

export type ShiroBetterAuthUserDto = {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    role?: string | null;
    banned?: boolean | null;
    banReason?: string | null;
    banExpires?: string | Date | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    phoneNumber?: string | null;
    phoneNumberVerified?: boolean | null;
    username?: string | null;
    displayUsername?: string | null;
};

export type UserDetailDto = UserDetailFormDto &
    RbacUserDto & {
        betterAuthUser?: ShiroBetterAuthUserDto;
        roleCount?: number;
        groupCount?: number;
        effectiveRoleCount?: number;
        effectivePermissionCount?: number;
        visibleMenuCount?: number;
        accountCount?: number;
        sessionCount?: number;
        activeSessionCount?: number;
        accounts?: UserAccountRecordDto[];
        recentSessions?: UserPublicSessionRecordDto[];
        effectivePermissionIds?: number[];
        visibleMenuIds?: number[];
        isSuperAdmin?: boolean;
    };

/**
 * 创建后台用户。
 */
export function createUserApi(data: CreateUserFormDto) {
    return request({
        method: "post",
        url: "/user/create_user",
        data,
    });
}

/**
 * 更新后台用户。
 */
export function updateUserApi(id: string, data: UpdateUserFormDto) {
    return request({
        method: "post",
        url: "/user/update_user",
        params: { id },
        data,
    });
}

/**
 * 删除后台用户。
 */
export function deleteUserApi(id: string) {
    return request({
        method: "post",
        url: "/user/delete_user",
        params: { id },
    });
}

/**
 * 获取后台用户分页列表。
 */
export function queryUserList(params?: { page?: number; pageSize?: number; [key: string]: any }) {
    return request.post<PaginatedUserResponse<UserDetailFormDto, UserListMetaDto>>(
        "/user/query_user_list",
        params ?? {},
    );
}

/**
 * 获取后台用户详情。
 */
export function getUserDetailApi(id: string) {
    return request.get<UserDetailDto>("/user/detail", { params: { id } });
}

/**
 * 获取后台用户的 RBAC 关系视图。
 */
export function getUserRelationsApi(id: string) {
    return request.get<UserRelationsDto>("/user/get_user_relations", { params: { id } });
}

/**
 * 分页查询后台用户的角色关系。
 */
export function getUserRelationRolesApi(data: {
    userId: string;
    relation: "direct" | "effective" | "inherited";
    page?: number;
    pageSize?: number;
    keyword?: string;
    name?: string;
    code?: string;
    description?: string;
    status?: string;
}) {
    return request.post("/user/query_relation_roles", data);
}

/**
 * 分页查询后台用户的用户组关系。
 */
export function getUserRelationUserGroupsApi(data: {
    userId: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
    name?: string;
    code?: string;
    description?: string;
    status?: string;
}) {
    return request.post("/user/query_relation_user_groups", data);
}

/**
 * 分页查询后台用户可分配角色。
 */
export function queryUserAssignableRolesApi(data: {
    userId: string;
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
    return request.post<PaginatedUserResponse<RbacAssigned<RbacRoleDto>>>(
        "/user/query_assignable_roles",
        data,
    );
}

/**
 * 分页查询后台用户可分配用户组。
 */
export function queryUserAssignableUserGroupsApi(data: {
    userId: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
    name?: string;
    code?: string;
    description?: string;
    assigned?: boolean;
    status?: string;
    draftGroupIds: number[];
}) {
    return request.post<PaginatedUserResponse<RbacAssigned<RbacUserGroupDto>>>(
        "/user/query_assignable_user_groups",
        data,
    );
}

/**
 * 分页查询后台用户可见菜单。
 */
export function getUserRelationMenusApi(data: {
    userId: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
    title?: string;
    requiredPermissionCode?: string;
    path?: string;
    type?: string;
    status?: string;
}) {
    return request.post("/user/query_relation_menus", data);
}

/**
 * 重置后台用户密码。
 */
export function resetUserPasswordApi(data: { id: string; password: string }) {
    return request.post("/user/reset_password", data);
}

/**
 * 封禁后台用户。
 */
export function banUserApi(data: { id: string; banReason?: string }) {
    return request.post<UserDetailDto>("/user/ban_user", data);
}

/**
 * 解封后台用户。
 */
export function unbanUserApi(id: string) {
    return request.post<UserDetailDto>("/user/unban_user", { id });
}

/**
 * 分页查询后台用户会话列表。
 */
export function queryUserSessionsApi(data: { id: string; page?: number; pageSize?: number }) {
    return request.post("/user/query_user_sessions", data);
}

/**
 * 撤销后台用户全部会话。
 */
export function revokeUserSessionsApi(id: string) {
    return request.post("/user/revoke_user_sessions", { id });
}

/**
 * 撤销后台用户的单个会话。
 */
export function revokeUserSessionApi(sessionToken: string) {
    return request.post("/user/revoke_user_session", { sessionToken });
}

/**
 * 从用户视角替换直接角色集合。
 */
export function assignUserRolesApi(data: { userId: string; roleIds: number[] }) {
    return request.post<null>("/user/assign_roles", data);
}

/**
 * 从用户视角替换所属用户组集合。
 */
export function assignUserGroupsApi(data: { userId: string; groupIds: number[] }) {
    return request.post<null>("/user/assign_user_groups", data);
}
