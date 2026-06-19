import { request } from "@/api/index";
import { z } from "zod";
import { resolveRbacApiPath } from "./app-rbac/target";

export enum UserGroupStatusEnum {
    ENABLE = "ENABLE",
    DISABLE = "DISABLE",
}

export const UserGroupFormSchema = z.object({
    id: z.number().optional(),
    name: z.string(),
    code: z.string(),
    description: z.string().nullable().optional(),
    status: z.nativeEnum(UserGroupStatusEnum),
});
export type UserGroupFormDto = z.infer<typeof UserGroupFormSchema>;
export type UpdateUserGroupDto = Partial<UserGroupFormDto>;

export type UserGroupRecordDto = UserGroupFormDto & {
    id: number;
    memberUserIds?: string[];
    roleIds?: number[];
    createdAt?: string;
    updatedAt?: string;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssignMember?: boolean;
    viewerCanAssignRole?: boolean;
};

export type UserGroupListMetaDto = {
    viewerCanCreateUserGroup: boolean;
};

export type UserGroupRelationUserDto = {
    id: string;
    username?: string | null;
    name: string;
    email?: string | null;
    banned?: boolean;
    image?: string | null;
};

export type UserGroupAssignableUserDto = UserGroupRelationUserDto & {
    assigned: boolean;
};

export type UserGroupRelationRoleDto = {
    id: number;
    name: string;
    code: string;
    description?: string | null;
    status: string;
};

export type UserGroupAssignableRoleDto = UserGroupRelationRoleDto & {
    assigned: boolean;
};

export type UserGroupRelationMenuDto = {
    id: number;
    title: string;
    type: string;
    requiredPermissionCode: string;
    pid?: number | null;
    status?: string;
};

export type UserGroupRelationsDto = {
    group: UserGroupRecordDto;
    memberUserIds: string[];
    roleIds: number[];
    visibleMenuIds: number[];
};

function userGroupApiPath(action: string) {
    return resolveRbacApiPath(`/user-group/${action}`, `/app-api/rbac/user-group/${action}`);
}

/**
 * 获取用户组分页列表。
 */
export function queryUserGroupListApi(params?: Record<string, any>) {
    return request({
        url: userGroupApiPath("query_user_group_list"),
        method: "post",
        data: params ?? {},
    });
}

/**
 * 创建用户组。
 */
export function createUserGroupApi(data: Record<string, any>) {
    return request({
        url: userGroupApiPath("create_user_group"),
        method: "post",
        data,
    });
}

/**
 * 更新用户组。
 */
export function updateUserGroupApi(id: number, data: Record<string, any>) {
    return request({
        url: userGroupApiPath("update_user_group"),
        method: "post",
        params: { id },
        data,
    });
}

/**
 * 删除用户组。
 */
export function deleteUserGroupApi(id: number) {
    return request({
        url: userGroupApiPath("delete_user_group"),
        method: "post",
        params: { id },
    });
}

/**
 * 获取用户组的 SpiceDB 关系视图。
 */
export function getUserGroupRelationsApi(id: number) {
    return request.get<UserGroupRelationsDto>(userGroupApiPath("relations"), { params: { id } });
}

/**
 * 分页查询用户组成员分配表。
 */
export function getUserGroupRelationMembersApi(data: {
    groupId: number;
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
    return request.post(userGroupApiPath("query_relation_members"), data);
}

/**
 * 分页查询用户组继承角色表。
 */
export function getUserGroupRelationRolesApi(data: {
    groupId: number;
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
    return request.post(userGroupApiPath("query_relation_roles"), data);
}

/**
 * 分页查询用户组可见菜单表。
 */
export function getUserGroupRelationMenusApi(data: {
    groupId: number;
    page?: number;
    pageSize?: number;
    keyword?: string;
    title?: string;
    requiredPermissionCode?: string;
    path?: string;
    type?: string;
    status?: string;
}) {
    return request.post(userGroupApiPath("query_relation_menus"), data);
}

/**
 * 从用户组视角替换成员集合。
 */
export function assignUserGroupMembersApi(data: { groupId: number; userIds: string[] }) {
    return request.post<UserGroupRelationsDto>(userGroupApiPath("assign_members"), data);
}

/**
 * 从用户组视角替换继承角色集合。
 */
export function assignUserGroupRolesApi(data: { groupId: number; roleIds: number[] }) {
    return request.post<UserGroupRelationsDto>(userGroupApiPath("assign_roles"), data);
}
