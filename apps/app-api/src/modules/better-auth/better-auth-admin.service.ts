import { BusinessException, ErrorCodes, toBoolValue, toStringValue } from '@app/common';
import type {
    BanAdminUserRequest,
    CheckAdminUserPermissionRequest,
    CreateAdminUserRequest,
    GetAdminUserRequest,
    ImpersonateAdminUserRequest,
    ImpersonationResponse,
    ListAdminUserSessionsRequest,
    ListAdminUsersRequest,
    ListAdminUsersResponse,
    RemoveAdminUserRequest,
    RevokeAdminUserSessionRequest,
    RevokeAdminUserSessionsRequest,
    SessionMessage,
    SetAdminUserPasswordRequest,
    StopImpersonatingAdminUserRequest,
    SuccessResponse,
    UnbanAdminUserRequest,
    UpdateAdminUserRequest,
    UserMessage
} from '@app/common';
import { PrismaService } from '@app/prisma-app';
import { Prisma } from '@app/prisma-app/generated/client';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { BETTER_AUTH_USER_ROLE } from './role.constants';
import { RbacAuthorizationService } from '../system/rbac/rbac-authorization.service';
import { BetterAuthInternalAdminService } from './better-auth-internal-admin.service';

type BAUser = Record<string, any>;
type BASession = Record<string, any>;

function toIsoDateTime(value: Date | string): string {
    if (value instanceof Date) {
        return value.toISOString();
    }

    return new Date(value).toISOString();
}

function buildAdminUserMessage(user: Record<string, any>): UserMessage {
    return {
        id: String(user.id),
        name: String(user.name ?? ''),
        email: String(user.email ?? ''),
        emailVerified: Boolean(user.emailVerified),
        image: toStringValue(user.image),
        role: toStringValue(BETTER_AUTH_USER_ROLE),
        banned: Boolean(user.banned),
        banReason: toStringValue(user.banReason),
        banExpires: toStringValue(user.banExpires ? toIsoDateTime(user.banExpires) : undefined),
        createdAt: user.createdAt ? toIsoDateTime(user.createdAt) : '',
        updatedAt: user.updatedAt ? toIsoDateTime(user.updatedAt) : '',
        phoneNumber: toStringValue(user.phoneNumber),
        phoneNumberVerified: toBoolValue(user.phoneNumberVerified),
        roleIds: []
    };
}

function buildSessionMessage(session: Record<string, any>): SessionMessage {
    return {
        id: String(session.id),
        expiresAt: toIsoDateTime(session.expiresAt),
        token: String(session.token),
        createdAt: toIsoDateTime(session.createdAt),
        updatedAt: toIsoDateTime(session.updatedAt),
        ipAddress: toStringValue(session.ipAddress),
        userAgent: toStringValue(session.userAgent),
        userId: String(session.userId),
        impersonatedBy: toStringValue(session.impersonatedBy)
    };
}

@Injectable()
export class BetterAuthAdminService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly rbacAuthorizationService: RbacAuthorizationService,
        private readonly betterAuthInternalAdminService: BetterAuthInternalAdminService
    ) {}

    private async runAdminOperation<T>(executor: () => Promise<T>): Promise<T> {
        try {
            return await executor();
        } catch (error) {
            if (error instanceof BusinessException || error instanceof HttpException) {
                throw error;
            }

            if (error instanceof APIError) {
                const errorRecord = error as APIError & {
                    body?: Record<string, unknown>;
                    status?: string;
                    statusCode?: number;
                };
                const body = errorRecord.body ? errorRecord.body : {};
                const rawCode = body.code;
                const rawMessage = body.message;
                let message = error.message;
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

            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
                let code: number = ErrorCodes.DATABASE.ERROR.code;
                let message: string = ErrorCodes.DATABASE.ERROR.message;

                if (error.code === 'P2002') {
                    httpStatus = HttpStatus.CONFLICT;
                    code = ErrorCodes.DATABASE.CONFLICT.code;
                    message = ErrorCodes.DATABASE.CONFLICT.message;
                } else if (error.code === 'P2025') {
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
                            prismaCode: error.code
                        }
                    },
                    httpStatus
                );
            }

            if (error instanceof Error) {
                throw error;
            }

            throw new Error(ErrorCodes.DEFAULT.message);
        }
    }

    private parseJsonObject(json: string, fieldName = 'dataJson'): Record<string, unknown> {
        try {
            const parsed = JSON.parse(json) as unknown;
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new Error('not_object');
            }
            return parsed as Record<string, unknown>;
        } catch {
            throw new HttpException(
                { code: HttpStatus.BAD_REQUEST, message: `${fieldName} 必须是合法 JSON 对象` },
                HttpStatus.BAD_REQUEST
            );
        }
    }

    async listAdminUsers(request: ListAdminUsersRequest): Promise<ListAdminUsersResponse> {
        const result = await this.runAdminOperation(() => this.betterAuthInternalAdminService.listUsers(request));

        return {
            users: result.users.map((item: Record<string, any>) => buildAdminUserMessage(item)),
            total: result.total
        };
    }

    async getAdminUser(request: GetAdminUserRequest): Promise<UserMessage> {
        const user = await this.runAdminOperation(() => this.betterAuthInternalAdminService.getUser(request.userId));
        return buildAdminUserMessage(user);
    }

    async createAdminUser(request: CreateAdminUserRequest): Promise<UserMessage> {
        const body: Record<string, unknown> = {
            email: request.email,
            name: request.name,
            role: BETTER_AUTH_USER_ROLE
        };
        if (request.password) body.password = request.password.value;
        if (request.dataJson) body.data = this.parseJsonObject(request.dataJson.value);

        const user = await this.runAdminOperation(() => this.betterAuthInternalAdminService.createUser(body));
        return buildAdminUserMessage(user);
    }

    async updateAdminUser(request: UpdateAdminUserRequest): Promise<UserMessage> {
        const data = this.parseJsonObject(request.dataJson);
        const result = await this.runAdminOperation(() =>
            this.betterAuthInternalAdminService.updateUser(request.userId, data)
        );
        return buildAdminUserMessage(result);
    }

    async banAdminUser(request: BanAdminUserRequest): Promise<UserMessage> {
        const user = await this.runAdminOperation(() =>
            this.betterAuthInternalAdminService.banUser(
                request.userId,
                request.banReason?.value,
                request.banExpiresIn?.value
            )
        );
        return buildAdminUserMessage(user);
    }

    async unbanAdminUser(request: UnbanAdminUserRequest): Promise<UserMessage> {
        const user = await this.runAdminOperation(() => this.betterAuthInternalAdminService.unbanUser(request.userId));
        return buildAdminUserMessage(user);
    }

    async listAdminUserSessions(request: ListAdminUserSessionsRequest): Promise<{ sessions: SessionMessage[] }> {
        const sessions = await this.runAdminOperation(() =>
            this.betterAuthInternalAdminService.listUserSessions(request.userId)
        );
        return { sessions: sessions.map((session) => buildSessionMessage(session)) };
    }

    async impersonateAdminUser(request: ImpersonateAdminUserRequest): Promise<ImpersonationResponse> {
        throw new HttpException(
            {
                code: HttpStatus.NOT_IMPLEMENTED,
                message: `app-api 控制面已移除内部管理员账号，暂不支持创建可恢复的伪装会话: ${request.userId}`
            },
            HttpStatus.NOT_IMPLEMENTED
        );
    }

    async stopImpersonatingAdminUser(request: StopImpersonatingAdminUserRequest): Promise<ImpersonationResponse> {
        throw new HttpException(
            {
                code: HttpStatus.NOT_IMPLEMENTED,
                message: `app-api 控制面已移除内部管理员账号，暂不支持恢复伪装会话: ${request.sessionToken}`
            },
            HttpStatus.NOT_IMPLEMENTED
        );
    }

    async revokeAdminUserSession(request: RevokeAdminUserSessionRequest): Promise<SuccessResponse> {
        await this.runAdminOperation(() => this.betterAuthInternalAdminService.revokeUserSession(request.sessionToken));
        return { success: true };
    }

    async revokeAdminUserSessions(request: RevokeAdminUserSessionsRequest): Promise<SuccessResponse> {
        await this.runAdminOperation(() => this.betterAuthInternalAdminService.revokeUserSessions(request.userId));
        return { success: true };
    }

    async removeAdminUser(request: RemoveAdminUserRequest): Promise<SuccessResponse> {
        await this.runAdminOperation(() => this.betterAuthInternalAdminService.removeUser(request.userId));
        return { success: true };
    }

    async setAdminUserPassword(request: SetAdminUserPasswordRequest): Promise<SuccessResponse> {
        await this.runAdminOperation(() =>
            this.betterAuthInternalAdminService.setUserPassword(request.userId, request.newPassword)
        );
        return { success: true };
    }

    async checkAdminUserPermission(request: CheckAdminUserPermissionRequest): Promise<SuccessResponse> {
        const permissionCodes = this.permissionEntriesToRbacCodes(request.permissions);
        const userId = request.userId?.value?.trim();
        const roleCode = request.role?.value?.trim();
        if (Boolean(userId) === Boolean(roleCode)) {
            throw new HttpException(
                { code: HttpStatus.BAD_REQUEST, message: 'user_id 和 role 必须且只能传一个' },
                HttpStatus.BAD_REQUEST
            );
        }

        if (userId) {
            const results = await Promise.all(
                permissionCodes.map((permissionCode) =>
                    this.rbacAuthorizationService.checkPermission(userId, permissionCode)
                )
            );
            return { success: results.every(Boolean) };
        }

        const rolePermissionCodes = await this.getEffectivePermissionCodesByRoleCode(roleCode as string);
        return { success: permissionCodes.every((permissionCode) => rolePermissionCodes.has(permissionCode)) };
    }

    private permissionEntriesToRbacCodes(permissions: CheckAdminUserPermissionRequest['permissions']): string[] {
        if (permissions.length === 0) {
            throw new HttpException(
                { code: HttpStatus.BAD_REQUEST, message: 'permissions 不能为空' },
                HttpStatus.BAD_REQUEST
            );
        }

        const permissionCodes = new Set<string>();
        for (const entry of permissions) {
            const resource = this.normalizePermissionCodePart(entry.resource, 'permissions.resource');
            if (entry.actions.length === 0) {
                throw new HttpException(
                    { code: HttpStatus.BAD_REQUEST, message: 'permissions.actions 不能为空' },
                    HttpStatus.BAD_REQUEST
                );
            }

            for (const action of entry.actions) {
                permissionCodes.add(`${resource}.${this.normalizePermissionCodePart(action, 'permissions.actions')}`);
            }
        }

        return [...permissionCodes];
    }

    private normalizePermissionCodePart(value: string, fieldName: string): string {
        const normalized = value.trim();
        if (!normalized || normalized.split('.').some((segment) => segment.length === 0)) {
            throw new HttpException(
                { code: HttpStatus.BAD_REQUEST, message: `${fieldName} 不是合法权限片段` },
                HttpStatus.BAD_REQUEST
            );
        }
        return normalized;
    }

    private async getEffectivePermissionCodesByRoleCode(roleCode: string): Promise<Set<string>> {
        const role = await this.prismaService.rbacRole.findFirst({
            where: {
                code: roleCode,
                deletedAt: null
            },
            select: {
                id: true
            }
        });
        if (!role) {
            throw new BusinessException(ErrorCodes.APP_ROLE.NOT_FOUND);
        }

        const inheritRows = await this.prismaService.rbacRoleInherit.findMany({
            select: {
                roleId: true,
                parentRoleId: true
            }
        });
        const parentIndex = new Map<number, number[]>();
        for (const row of inheritRows) {
            const parents = parentIndex.get(row.roleId) ?? [];
            parents.push(row.parentRoleId);
            parentIndex.set(row.roleId, parents);
        }

        const roleIds = new Set<number>();
        const stack = [role.id];
        while (stack.length > 0) {
            const current = stack.pop() as number;
            if (roleIds.has(current)) {
                continue;
            }
            roleIds.add(current);
            stack.push(...(parentIndex.get(current) ?? []));
        }

        const rows = await this.prismaService.rbacRolePermission.findMany({
            where: {
                roleId: {
                    in: [...roleIds]
                },
                permission: {
                    deletedAt: null
                }
            },
            select: {
                permission: {
                    select: {
                        code: true
                    }
                }
            }
        });
        return new Set(rows.map((row) => row.permission.code));
    }
}
