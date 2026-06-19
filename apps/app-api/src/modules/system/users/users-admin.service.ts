import { BusinessException, ErrorCodes, fromStringPatch, toBoolValue, toStringValue } from '@app/common';
import type {
    BusinessRoleMessage,
    CreateBusinessUserRequest,
    GetBusinessUserRequest,
    GetBusinessUserRoleIdsRequest,
    ListBusinessRolesResponse,
    ListBusinessUsersRequest,
    ListBusinessUsersResponse,
    PaginationMessage,
    ResetBusinessUserPasswordRequest,
    DeleteBusinessUserRequest,
    SoftDeleteBusinessUserRequest,
    UpdateBusinessUserRequest,
    UpdateBusinessUserStatusRequest,
    UserMessage,
    UserProfileMessage
} from '@app/common';
import { PrismaService } from '@app/prisma-app';
import { RbacStatus, Prisma } from '@app/prisma-app/generated/client';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { AdminUserStateService } from '../../user-state/admin-user-state.service';
import { BetterAuthInternalAdminService } from '../../better-auth/better-auth-internal-admin.service';
import { SystemRbacGraphService } from '../rbac/rbac-graph.service';

const APP_USER_BAN_REASON = '管理员禁用账号';

type BusinessUserRecord = Prisma.BetterAuthUserGetPayload<{
    include: {
        profile: true;
        rbacUserRoles: { select: { roleId: true } };
    };
}>;

type BusinessRoleRecord = Prisma.RbacRoleGetPayload<{}>;

type BAUser = Record<string, any>;

function toIsoDateTime(value: Date | string): string {
    if (value instanceof Date) {
        return value.toISOString();
    }

    return new Date(value).toISOString();
}

function buildUserProfileMessage(
    profile: BusinessUserRecord['profile'],
    banned: boolean
): UserProfileMessage | undefined {
    if (!profile) {
        return undefined;
    }

    return {
        id: profile.id,
        userId: profile.userId,
        nickname: toStringValue(profile.nickname),
        avatar: toStringValue(profile.avatar),
        gender: profile.gender,
        level: profile.level,
        exp: profile.exp,
        status: banned ? 0 : 1,
        createdAt: toIsoDateTime(profile.createdAt),
        updatedAt: toIsoDateTime(profile.updatedAt)
    };
}

function buildBusinessUserMessage(record: BusinessUserRecord): UserMessage {
    const phoneNumberVerified = record.phoneNumberVerified;
    return {
        id: record.id,
        name: record.name,
        email: record.email,
        emailVerified: record.emailVerified,
        image: toStringValue(record.image),
        banned: record.banned === true,
        banReason: toStringValue(record.banReason),
        banExpires: record.banExpires ? { value: toIsoDateTime(record.banExpires) } : undefined,
        createdAt: toIsoDateTime(record.createdAt),
        updatedAt: toIsoDateTime(record.updatedAt),
        phoneNumber: toStringValue(record.phoneNumber),
        phoneNumberVerified: toBoolValue(phoneNumberVerified),
        profile: buildUserProfileMessage(record.profile, record.banned === true),
        roleIds: record.rbacUserRoles.map((item) => item.roleId)
    };
}

function buildBusinessRoleMessage(record: BusinessRoleRecord): BusinessRoleMessage {
    return {
        id: record.id,
        name: record.name,
        code: record.code,
        description: toStringValue(record.description),
        status: record.status
    };
}

function buildPaginationMessage(input: { total: number; page: number; pageSize: number }): PaginationMessage {
    return {
        total: input.total,
        totalPages: Math.ceil(input.total / input.pageSize),
        page: input.page,
        pageSize: input.pageSize
    };
}

function parseQueryDateTime(value: string | undefined): Date | undefined {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new BusinessException(ErrorCodes.PARAM.INVALID);
    }
    return date;
}

function buildDateTimeRangeFilter(
    start: string | undefined,
    end: string | undefined
): Prisma.DateTimeFilter | undefined {
    const gte = parseQueryDateTime(start);
    const lte = parseQueryDateTime(end);
    if (!gte && !lte) {
        return undefined;
    }
    return {
        ...(gte && { gte }),
        ...(lte && { lte })
    };
}

@Injectable()
export class SystemUsersAdminService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly adminUserStateService: AdminUserStateService,
        private readonly betterAuthAdminService: BetterAuthInternalAdminService,
        private readonly rbacGraphService: SystemRbacGraphService
    ) {}

    private mapBusinessUserAdminError(error: unknown): BusinessException | undefined {
        if (error instanceof APIError) {
            const errorRecord = error as APIError & {
                body?: Record<string, unknown>;
            };
            const body = errorRecord.body ? errorRecord.body : {};
            const rawCode = typeof body.code === 'string' ? body.code : '';

            if (rawCode === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
                return new BusinessException(ErrorCodes.APP_USER.EMAIL_EXISTS);
            }

            if (rawCode === 'USER_NOT_FOUND') {
                return new BusinessException(ErrorCodes.APP_USER.NOT_FOUND);
            }

            if (rawCode === 'PASSWORD_TOO_SHORT') {
                return new BusinessException(ErrorCodes.USER.PASSWORD_TOO_SHORT);
            }

            if (rawCode === 'PASSWORD_TOO_LONG') {
                return new BusinessException(ErrorCodes.USER.PASSWORD_TOO_LONG);
            }
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
                const rawTarget = error.meta?.target;
                let targetText = '';

                if (Array.isArray(rawTarget)) {
                    targetText = rawTarget.map((item) => String(item)).join(',');
                } else if (typeof rawTarget === 'string') {
                    targetText = rawTarget;
                }

                if (targetText.includes('email')) {
                    return new BusinessException(ErrorCodes.APP_USER.EMAIL_EXISTS);
                }

                if (targetText.includes('phoneNumber') || targetText.includes('phone_number')) {
                    return new BusinessException(ErrorCodes.APP_USER.PHONE_EXISTS);
                }
            }
        }

        return undefined;
    }

    private async runAdminOperation<T>(
        executor: () => Promise<T>,
        options?: {
            businessUserError?: boolean;
        }
    ): Promise<T> {
        try {
            return await executor();
        } catch (error) {
            let normalizedError: unknown = error;

            if (options && options.businessUserError === true) {
                const mappedBusinessError = this.mapBusinessUserAdminError(normalizedError);
                if (mappedBusinessError) {
                    normalizedError = mappedBusinessError;
                }
            }

            if (normalizedError instanceof BusinessException || normalizedError instanceof HttpException) {
                throw normalizedError;
            }

            if (normalizedError instanceof APIError) {
                const errorRecord = normalizedError as APIError & {
                    body?: Record<string, unknown>;
                    status?: string;
                    statusCode?: number;
                };
                const body = errorRecord.body ? errorRecord.body : {};
                const rawCode = body.code;
                const rawMessage = body.message;
                let message = normalizedError.message;
                if (typeof rawMessage === 'string' && rawMessage.length > 0) {
                    message = rawMessage;
                }

                let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
                if (errorRecord.status === 'BAD_REQUEST') {
                    httpStatus = HttpStatus.BAD_REQUEST;
                } else if (errorRecord.status === 'UNAUTHORIZED') {
                    httpStatus = HttpStatus.UNAUTHORIZED;
                } else if (errorRecord.status === 'FORBIDDEN') {
                    httpStatus = HttpStatus.FORBIDDEN;
                } else if (errorRecord.status === 'NOT_FOUND') {
                    httpStatus = HttpStatus.NOT_FOUND;
                } else if (errorRecord.status === 'CONFLICT') {
                    httpStatus = HttpStatus.CONFLICT;
                } else if (errorRecord.status === 'TOO_MANY_REQUESTS') {
                    httpStatus = HttpStatus.TOO_MANY_REQUESTS;
                }

                throw new HttpException(
                    {
                        code: httpStatus,
                        message,
                        data: {
                            source: 'better_auth',
                            betterAuthCode: rawCode,
                            betterAuthStatus: errorRecord.status,
                            betterAuthStatusCode: errorRecord.statusCode
                        }
                    },
                    httpStatus
                );
            }

            if (normalizedError instanceof Prisma.PrismaClientKnownRequestError) {
                let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
                let code: number = ErrorCodes.DATABASE.ERROR.code;
                let message: string = ErrorCodes.DATABASE.ERROR.message;

                if (normalizedError.code === 'P2002') {
                    httpStatus = HttpStatus.CONFLICT;
                    code = ErrorCodes.DATABASE.CONFLICT.code;
                    message = ErrorCodes.DATABASE.CONFLICT.message;
                } else if (normalizedError.code === 'P2025') {
                    httpStatus = HttpStatus.NOT_FOUND;
                    code = ErrorCodes.DATABASE.NOT_FOUND.code;
                    message = ErrorCodes.DATABASE.NOT_FOUND.message;
                }

                throw new HttpException(
                    {
                        code,
                        message,
                        data: {
                            source: 'prisma',
                            prismaCode: normalizedError.code
                        }
                    },
                    httpStatus
                );
            }

            if (normalizedError instanceof Error) {
                throw normalizedError;
            }

            throw new Error(ErrorCodes.DEFAULT.message);
        }
    }

    private async validateRoleIds(roleIds: number[]): Promise<void> {
        if (roleIds.length === 0) return;
        const found = await this.prismaService.rbacRole.count({
            where: { id: { in: roleIds }, status: RbacStatus.ENABLE, deletedAt: null }
        });
        if (found !== roleIds.length) {
            throw new BusinessException(ErrorCodes.APP_ROLE.NOT_FOUND);
        }
    }

    private async rebuildUserRoles(userId: string, roleIds: number[], actorId: string): Promise<void> {
        const uniqueRoleIds = [...new Set(roleIds)];
        await this.prismaService.$transaction(async (tx) => {
            await tx.rbacUserRole.deleteMany({ where: { userId } });
            if (uniqueRoleIds.length > 0) {
                await tx.rbacUserRole.createMany({
                    data: uniqueRoleIds.map((roleId) => ({ userId, roleId, createdBy: actorId })),
                    skipDuplicates: true
                });
            }
        });
        await this.rbacGraphService.applyRebuild([userId]);
    }

    private async upsertProfile(
        userId: string,
        data: { nickname?: string | null; avatar?: string | null }
    ): Promise<void> {
        await this.prismaService.betterAuthUserProfile.upsert({
            where: { userId },
            create: { userId, nickname: data.nickname ?? null, avatar: data.avatar ?? null },
            update: data
        });
    }

    private async syncBanStatus(userId: string, status: number, banReason = APP_USER_BAN_REASON): Promise<void> {
        if (status === 0) {
            await this.runAdminOperation(() => this.betterAuthAdminService.banUser(userId, banReason), {
                businessUserError: true
            });
        } else {
            await this.runAdminOperation(() => this.betterAuthAdminService.unbanUser(userId), {
                businessUserError: true
            });
        }
    }

    private async assertActiveBusinessUser(userId: string): Promise<void> {
        const user = await this.prismaService.betterAuthUser.findFirst({
            where: {
                id: userId,
                deletedAt: null
            },
            select: {
                id: true
            }
        });

        if (!user) {
            throw new BusinessException(ErrorCodes.APP_USER.NOT_FOUND);
        }
    }

    async listBusinessUsers(request: ListBusinessUsersRequest): Promise<ListBusinessUsersResponse> {
        const createdAt = buildDateTimeRangeFilter(request.createdAtStart?.value, request.createdAtEnd?.value);
        const updatedAt = buildDateTimeRangeFilter(request.updatedAtStart?.value, request.updatedAtEnd?.value);
        const where: Prisma.BetterAuthUserWhereInput = {
            deletedAt: null,
            ...(request.id && { id: { contains: request.id.value } }),
            ...(request.name && { name: { contains: request.name.value } }),
            ...(request.nickname && { profile: { is: { nickname: { contains: request.nickname.value } } } }),
            ...(request.email && { email: { contains: request.email.value } }),
            ...(request.phoneNumber && { phoneNumber: { contains: request.phoneNumber.value } }),
            ...(request.status && { banned: request.status.value === 0 }),
            ...(request.roleId && { rbacUserRoles: { some: { roleId: request.roleId.value } } }),
            ...(request.emailVerified !== undefined && { emailVerified: request.emailVerified.value }),
            ...(request.phoneNumberVerified !== undefined && {
                phoneNumberVerified: request.phoneNumberVerified.value
            }),
            ...(createdAt && { createdAt }),
            ...(updatedAt && { updatedAt })
        };

        const [records, total] = await this.prismaService.$transaction([
            this.prismaService.betterAuthUser.findMany({
                where,
                skip: (request.page - 1) * request.pageSize,
                take: request.pageSize,
                orderBy: { createdAt: 'desc' },
                include: { profile: true, rbacUserRoles: { select: { roleId: true } } }
            }),
            this.prismaService.betterAuthUser.count({ where })
        ]);

        return {
            records: records.map((item) => buildBusinessUserMessage(item)),
            pagination: buildPaginationMessage({
                total,
                page: request.page,
                pageSize: request.pageSize
            })
        };
    }

    async listBusinessRoles(): Promise<ListBusinessRolesResponse> {
        const records = await this.prismaService.rbacRole.findMany({
            where: { deletedAt: null },
            orderBy: [{ status: 'asc' }, { sort: 'asc' }, { id: 'asc' }]
        });

        return {
            records: records.map((record) => buildBusinessRoleMessage(record))
        };
    }

    async getBusinessUser(request: GetBusinessUserRequest): Promise<UserMessage> {
        const user = await this.prismaService.betterAuthUser.findFirst({
            where: {
                id: request.id,
                deletedAt: null
            },
            include: {
                profile: true,
                rbacUserRoles: {
                    select: {
                        roleId: true
                    }
                }
            }
        });

        if (!user) {
            throw new BusinessException(ErrorCodes.APP_USER.NOT_FOUND);
        }

        return buildBusinessUserMessage(user);
    }

    async getBusinessUserRoleIds(request: GetBusinessUserRoleIdsRequest): Promise<{ values: number[] }> {
        await this.assertActiveBusinessUser(request.userId);
        const roles = await this.prismaService.rbacUserRole.findMany({
            where: { userId: request.userId },
            select: { roleId: true }
        });
        return { values: roles.map((role) => role.roleId) };
    }

    async createBusinessUser(request: CreateBusinessUserRequest, actorId: string): Promise<UserMessage> {
        const roleIds = [...new Set(request.roleIds)];
        await this.validateRoleIds(roleIds);

        const body: Record<string, unknown> = {
            email: request.email,
            name: request.name,
            password: request.password
        };
        if (request.phoneNumber) body.data = { phoneNumber: request.phoneNumber.value };

        const user = await this.runAdminOperation<BAUser>(() => this.betterAuthAdminService.createUser(body), {
            businessUserError: true
        });
        const userId = user.id;

        await this.upsertProfile(userId, {
            nickname: request.nickname?.value,
            avatar: request.avatar?.value
        });
        await this.rebuildUserRoles(userId, roleIds, actorId);

        if (request.status === 0) {
            await this.syncBanStatus(userId, 0);
        }

        return this.getBusinessUser({ id: userId });
    }

    async updateBusinessUser(request: UpdateBusinessUserRequest, actorId: string): Promise<UserMessage> {
        await this.assertActiveBusinessUser(request.id);
        const phonePatch = fromStringPatch(request.phoneNumber);
        const nicknamePatch = fromStringPatch(request.nickname);
        const avatarPatch = fromStringPatch(request.avatar);
        const roleIds = request.roleIds ? [...new Set(request.roleIds.values)] : null;

        if (roleIds) await this.validateRoleIds(roleIds);

        const mainData: Record<string, unknown> = {};
        if (request.name) mainData.name = request.name.value;
        if (request.email) mainData.email = request.email.value;
        if (phonePatch.hasValue) mainData.phoneNumber = phonePatch.value;

        if (Object.keys(mainData).length > 0) {
            await this.runAdminOperation(() => this.betterAuthAdminService.updateUser(request.id, mainData), {
                businessUserError: true
            });
        }

        const profileData: { nickname?: string | null; avatar?: string | null } = {};
        if (nicknamePatch.hasValue) profileData.nickname = nicknamePatch.value;
        if (avatarPatch.hasValue) profileData.avatar = avatarPatch.value;
        if (Object.keys(profileData).length > 0) {
            await this.upsertProfile(request.id, profileData);
        }

        if (request.status) {
            await this.syncBanStatus(request.id, request.status.value);
        }

        if (roleIds !== null) {
            await this.rebuildUserRoles(request.id, roleIds, actorId);
        } else {
            await this.adminUserStateService.bumpUserStateVersion(request.id);
        }
        return this.getBusinessUser({ id: request.id });
    }

    async updateBusinessUserStatus(request: UpdateBusinessUserStatusRequest): Promise<void> {
        await this.assertActiveBusinessUser(request.id);
        await this.syncBanStatus(request.id, request.status, request.banReason?.value);
        await this.adminUserStateService.bumpUserStateVersion(request.id);
    }

    async softDeleteBusinessUser(request: SoftDeleteBusinessUserRequest): Promise<void> {
        await this.assertActiveBusinessUser(request.id);
        await this.prismaService.betterAuthUser.update({
            where: {
                id: request.id
            },
            data: {
                deletedAt: new Date(),
                deleteReason: request.deleteReason?.value ?? null
            }
        });
        await this.runAdminOperation(() => this.betterAuthAdminService.revokeUserSessions(request.id), {
            businessUserError: true
        });
        await this.adminUserStateService.bumpUserStateVersion(request.id);
    }

    async deleteBusinessUser(request: DeleteBusinessUserRequest): Promise<void> {
        await this.assertActiveBusinessUser(request.id);
        await this.runAdminOperation(() => this.betterAuthAdminService.removeUser(request.id), {
            businessUserError: true
        });
        await this.adminUserStateService.bumpUserStateVersion(request.id);
    }

    async resetBusinessUserPassword(request: ResetBusinessUserPasswordRequest): Promise<void> {
        await this.assertActiveBusinessUser(request.id);
        await this.runAdminOperation(() => this.betterAuthAdminService.setUserPassword(request.id, request.password), {
            businessUserError: true
        });
    }
}
