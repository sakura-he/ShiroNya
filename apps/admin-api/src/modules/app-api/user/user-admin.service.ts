import {
    toBoolValue,
    toInt32ListValue,
    toStringPatch,
    toStringValue,
    type BoolValueMessage,
    type StringValueMessage,
    type UserMessage,
    type UserProfileMessage
} from '@app/common';
import { Injectable } from '@nestjs/common';
import { RbacAuthorizationService } from '../../system/rbac/rbac-authorization.service';
import { RBAC_PERMISSIONS } from '../../system/rbac/rbac-permissions';
import type {
    CreateUserDto,
    DeleteUserDto,
    QueryUserListDto,
    ResetUserPasswordDto,
    UpdateUserDto,
    UpdateUserStatusDto
} from './dto/user-admin.dto';
import { UserAdminGrpcClient, type ControlPlaneActor } from './user-admin.grpc-client';

type UserCapabilityMap = {
    viewerCanCreateUser: boolean;
    viewerCanViewUserDetail: boolean;
    viewerCanUpdateUser: boolean;
    viewerCanUpdateUserStatus: boolean;
    viewerCanSoftDeleteUser: boolean;
    viewerCanDeleteUser: boolean;
    viewerCanResetUserPassword: boolean;
};

type BusinessUserView = ReturnType<typeof toBusinessUserView> & UserCapabilityMap;
type BusinessRoleView = ReturnType<typeof toBusinessRoleView>;

function unwrapString(value: StringValueMessage | undefined): string | null {
    return value?.value ?? null;
}

function unwrapBool(value: BoolValueMessage | undefined): boolean | null {
    return value?.value ?? null;
}

function toBusinessUserProfileView(profile: UserProfileMessage | undefined) {
    if (!profile) {
        return null;
    }

    return {
        id: profile.id,
        userId: profile.userId,
        nickname: unwrapString(profile.nickname),
        avatar: unwrapString(profile.avatar),
        gender: profile.gender,
        level: profile.level,
        exp: profile.exp,
        status: profile.status,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt
    };
}

function toBusinessUserView(user: UserMessage) {
    const profile = toBusinessUserProfileView(user.profile);
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: unwrapString(user.image),
        banned: user.banned,
        banReason: unwrapString(user.banReason),
        banExpires: unwrapString(user.banExpires),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        phoneNumber: unwrapString(user.phoneNumber),
        phoneNumberVerified: unwrapBool(user.phoneNumberVerified),
        profile,
        nickname: profile?.nickname ?? null,
        avatar: profile?.avatar ?? unwrapString(user.image),
        status: profile?.status ?? (user.banned ? 0 : 1),
        roleIds: user.roleIds
    };
}

function toBusinessRoleView(role: {
    id: number;
    name: string;
    code: string;
    description?: StringValueMessage;
    status: string;
}) {
    return {
        id: role.id,
        name: role.name,
        code: role.code,
        description: unwrapString(role.description),
        status: role.status
    };
}

function withCapabilities(user: ReturnType<typeof toBusinessUserView>, capabilities: UserCapabilityMap) {
    return {
        ...user,
        ...capabilities
    };
}

@Injectable()
export class UserAdminService {
    constructor(
        private readonly grpcClient: UserAdminGrpcClient,
        private readonly rbacAuthorizationService: RbacAuthorizationService
    ) {}

    async getUserList(query: QueryUserListDto, actor: ControlPlaneActor, requestId?: string) {
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 10;
        const [response, capabilities] = await Promise.all([
            this.grpcClient.listBusinessUsers(
                {
                    id: query.id ? toStringValue(query.id) : undefined,
                    name: query.name ? toStringValue(query.name) : undefined,
                    nickname: query.nickname ? toStringValue(query.nickname) : undefined,
                    email: query.email ? toStringValue(query.email) : undefined,
                    phoneNumber: query.phoneNumber ? toStringValue(query.phoneNumber) : undefined,
                    status: query.status !== undefined ? { value: query.status } : undefined,
                    roleId: query.roleId !== undefined ? { value: query.roleId } : undefined,
                    emailVerified: toBoolValue(query.emailVerified),
                    phoneNumberVerified: toBoolValue(query.phoneNumberVerified),
                    createdAtStart: query.createdAtStart ? toStringValue(query.createdAtStart) : undefined,
                    createdAtEnd: query.createdAtEnd ? toStringValue(query.createdAtEnd) : undefined,
                    updatedAtStart: query.updatedAtStart ? toStringValue(query.updatedAtStart) : undefined,
                    updatedAtEnd: query.updatedAtEnd ? toStringValue(query.updatedAtEnd) : undefined,
                    page,
                    pageSize
                },
                { actor, requestId, reason: 'list app-api business users' }
            ),
            this.getViewerCapabilities(actor.id)
        ]);

        return {
            records: response.records.map((record) => withCapabilities(toBusinessUserView(record), capabilities)),
            pagination: response.pagination,
            meta: capabilities
        };
    }

    async getUserDetail(
        id: string,
        actor: ControlPlaneActor,
        requestId?: string
    ): Promise<BusinessUserView> {
        const [user, capabilities] = await Promise.all([
            this.grpcClient.getBusinessUser({ id }, { actor, requestId, reason: `get app-api business user ${id}` }),
            this.getViewerCapabilities(actor.id)
        ]);

        return withCapabilities(toBusinessUserView(user), capabilities);
    }

    async getRoleList(
        actor: ControlPlaneActor,
        requestId?: string
    ): Promise<{ records: BusinessRoleView[] }> {
        const response = await this.grpcClient.listBusinessRoles({
            actor,
            requestId,
            reason: 'list app-api business roles'
        });

        return {
            records: response.records.map((record) => toBusinessRoleView(record))
        };
    }

    async createUser(actor: ControlPlaneActor, dto: CreateUserDto, requestId?: string) {
        const user = await this.grpcClient.createBusinessUser(
            {
                name: dto.name,
                email: dto.email,
                phoneNumber: dto.phoneNumber ? toStringValue(dto.phoneNumber) : undefined,
                password: dto.password,
                nickname: dto.nickname ? toStringValue(dto.nickname) : undefined,
                avatar: dto.avatar ? toStringValue(dto.avatar) : undefined,
                status: dto.status,
                roleIds: dto.roleIds
            },
            { actor, requestId, reason: 'create app-api business user' }
        );

        return toBusinessUserView(user);
    }

    async updateUser(id: string, dto: UpdateUserDto, actor: ControlPlaneActor, requestId?: string) {
        const user = await this.grpcClient.updateBusinessUser(
            {
                id,
                name: dto.name ? toStringValue(dto.name) : undefined,
                email: dto.email ? toStringValue(dto.email) : undefined,
                phoneNumber: dto.phoneNumber !== undefined ? toStringPatch(dto.phoneNumber) : undefined,
                nickname: dto.nickname !== undefined ? toStringPatch(dto.nickname) : undefined,
                avatar: dto.avatar !== undefined ? toStringPatch(dto.avatar) : undefined,
                status: dto.status !== undefined ? { value: dto.status } : undefined,
                roleIds: dto.roleIds !== undefined ? toInt32ListValue(dto.roleIds) : undefined
            },
            { actor, requestId, reason: `update app-api business user ${id}` }
        );

        return toBusinessUserView(user);
    }

    async updateUserStatus(
        dto: UpdateUserStatusDto,
        actor: ControlPlaneActor,
        requestId?: string
    ): Promise<null> {
        await this.grpcClient.updateBusinessUserStatus(
            {
                id: dto.id,
                status: dto.status,
                banReason: dto.status === 0 && dto.banReason ? toStringValue(dto.banReason) : undefined
            },
            { actor, requestId, reason: `update app-api business user ${dto.id} status` }
        );
        return null;
    }

    async softDeleteUser(
        dto: DeleteUserDto,
        actor: ControlPlaneActor,
        requestId?: string
    ): Promise<null> {
        await this.grpcClient.softDeleteBusinessUser(
            {
                id: dto.id,
                deleteReason: toStringValue(dto.deleteReason)
            },
            { actor, requestId, reason: `soft delete app-api business user ${dto.id}` }
        );
        return null;
    }

    async deleteUser(dto: DeleteUserDto, actor: ControlPlaneActor, requestId?: string): Promise<null> {
        await this.grpcClient.deleteBusinessUser(
            {
                id: dto.id,
                deleteReason: toStringValue(dto.deleteReason)
            },
            { actor, requestId, reason: `delete app-api business user ${dto.id}` }
        );
        return null;
    }

    async resetUserPassword(
        dto: ResetUserPasswordDto,
        actor: ControlPlaneActor,
        requestId?: string
    ): Promise<null> {
        await this.grpcClient.resetBusinessUserPassword(
            { id: dto.id, password: dto.password },
            { actor, requestId, reason: `reset app-api business user ${dto.id} password` }
        );
        return null;
    }

    private async getViewerCapabilities(actorId: string): Promise<UserCapabilityMap> {
        const permissions = await this.rbacAuthorizationService.checkPermissions(actorId, [
            RBAC_PERMISSIONS.APP_USER_CREATE,
            RBAC_PERMISSIONS.APP_USER_DETAIL,
            RBAC_PERMISSIONS.APP_USER_UPDATE,
            RBAC_PERMISSIONS.APP_USER_STATUS_UPDATE,
            RBAC_PERMISSIONS.APP_USER_SOFT_DELETE,
            RBAC_PERMISSIONS.APP_USER_DELETE,
            RBAC_PERMISSIONS.APP_USER_RESET_PASSWORD
        ]);

        return {
            viewerCanCreateUser: permissions.get(RBAC_PERMISSIONS.APP_USER_CREATE) ?? false,
            viewerCanViewUserDetail: permissions.get(RBAC_PERMISSIONS.APP_USER_DETAIL) ?? false,
            viewerCanUpdateUser: permissions.get(RBAC_PERMISSIONS.APP_USER_UPDATE) ?? false,
            viewerCanUpdateUserStatus: permissions.get(RBAC_PERMISSIONS.APP_USER_STATUS_UPDATE) ?? false,
            viewerCanSoftDeleteUser: permissions.get(RBAC_PERMISSIONS.APP_USER_SOFT_DELETE) ?? false,
            viewerCanDeleteUser: permissions.get(RBAC_PERMISSIONS.APP_USER_DELETE) ?? false,
            viewerCanResetUserPassword: permissions.get(RBAC_PERMISSIONS.APP_USER_RESET_PASSWORD) ?? false
        };
    }
}
