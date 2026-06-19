import { request } from "@/api/index";

export type AppApiUserProfileDto = {
    id: number;
    userId: string;
    nickname?: string | null;
    avatar?: string | null;
    gender: number;
    level: number;
    exp: number;
    status: number;
    createdAt: string;
    updatedAt: string;
};

export type AppApiUserRecordDto = {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: string | null;
    banned: boolean;
    banReason?: string | null;
    banExpires?: string | null;
    createdAt: string;
    updatedAt: string;
    phoneNumber?: string | null;
    phoneNumberVerified?: boolean | null;
    profile?: AppApiUserProfileDto | null;
    nickname?: string | null;
    avatar?: string | null;
    status: number;
    roleIds: number[];
    viewerCanCreateUser?: boolean;
    viewerCanViewUserDetail?: boolean;
    viewerCanUpdateUser?: boolean;
    viewerCanUpdateUserStatus?: boolean;
    viewerCanSoftDeleteUser?: boolean;
    viewerCanDeleteUser?: boolean;
    viewerCanResetUserPassword?: boolean;
};

export type AppApiUserListMetaDto = {
    viewerCanCreateUser: boolean;
    viewerCanViewUserDetail: boolean;
    viewerCanUpdateUser: boolean;
    viewerCanUpdateUserStatus: boolean;
    viewerCanSoftDeleteUser: boolean;
    viewerCanDeleteUser: boolean;
    viewerCanResetUserPassword: boolean;
};

export type AppApiUserListResponseDto = {
    records: AppApiUserRecordDto[];
    pagination: {
        total: number;
        totalPages: number;
        page: number;
        pageSize: number;
    };
    meta: AppApiUserListMetaDto;
};

export type AppApiRoleRecordDto = {
    id: number;
    name: string;
    code: string;
    description?: string | null;
    status: string;
};

export type AppApiRoleListResponseDto = {
    records: AppApiRoleRecordDto[];
};

export type AppApiUserQueryDto = {
    page?: number;
    pageSize?: number;
    id?: string;
    name?: string;
    nickname?: string;
    email?: string;
    phoneNumber?: string;
    status?: number;
    roleId?: number;
    emailVerified?: boolean;
    phoneNumberVerified?: boolean;
    createdAtStart?: string;
    createdAtEnd?: string;
    updatedAtStart?: string;
    updatedAtEnd?: string;
};

export type CreateAppApiUserDto = {
    name: string;
    email: string;
    phoneNumber?: string | null;
    password: string;
    nickname?: string | null;
    avatar?: string | null;
    status: number;
    roleIds: number[];
};

export type UpdateAppApiUserDto = Partial<Omit<CreateAppApiUserDto, "password">>;

export function queryAppApiUserListApi(params?: AppApiUserQueryDto & Record<string, unknown>) {
    return request.post<AppApiUserListResponseDto>("/app-api/user/query_user_list", params ?? {});
}

export function getAppApiUserDetailApi(id: string) {
    return request.get<AppApiUserRecordDto>("/app-api/user/detail", { params: { id } });
}

export function getAppApiRoleListApi() {
    return request.get<AppApiRoleListResponseDto>("/app-api/user/get_role_list");
}

export function createAppApiUserApi(data: CreateAppApiUserDto) {
    return request.post<AppApiUserRecordDto>("/app-api/user/create_user", data);
}

export function updateAppApiUserApi(id: string, data: UpdateAppApiUserDto) {
    return request.post<AppApiUserRecordDto>("/app-api/user/update_user", data, {
        params: { id },
    });
}

export function updateAppApiUserStatusApi(id: string, status: number, banReason?: string) {
    return request.post<null>("/app-api/user/update_status", { id, status, banReason });
}

export function softDeleteAppApiUserApi(id: string, deleteReason: string) {
    return request.post<null>("/app-api/user/soft_delete", { id, deleteReason });
}

export function deleteAppApiUserApi(id: string, deleteReason: string) {
    return request.post<null>("/app-api/user/delete", { id, deleteReason });
}

export function resetAppApiUserPasswordApi(id: string, password: string) {
    return request.post<null>("/app-api/user/reset_password", { id, password });
}
