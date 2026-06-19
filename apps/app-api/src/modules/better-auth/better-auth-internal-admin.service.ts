import { BusinessException, ErrorCodes, fromAdminFilterValue } from '@app/common';
import type { ListAdminUsersRequest } from '@app/common';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { BETTER_AUTH_USER_ROLE } from './role.constants';

const BETTER_AUTH_ROLE_QUERY_UNSUPPORTED_MESSAGE = 'app-api 用户 Better Auth role 固定为 user，不支持按 BA role 查询或排序';

type BetterAuthUser = Record<string, any>;
type BetterAuthSession = Record<string, any>;
type BetterAuthCreateUserResult = { user: BetterAuthUser };

@Injectable()
export class BetterAuthInternalAdminService {
    constructor(private readonly authService: AuthService<any>) {}

    async getAuthContext() {
        return await this.authService.instance.$context;
    }

    private assertNoBetterAuthRoleQueryField(field: string | undefined): string | undefined {
        const normalizedField = field?.trim();
        if (normalizedField?.toLowerCase() === 'role') {
            throw new HttpException(
                {
                    code: HttpStatus.BAD_REQUEST,
                    message: BETTER_AUTH_ROLE_QUERY_UNSUPPORTED_MESSAGE
                },
                HttpStatus.BAD_REQUEST
            );
        }

        return normalizedField;
    }

    async ensureUserExists(userId: string): Promise<BetterAuthUser> {
        const authContext = await this.getAuthContext();
        const user = await authContext.internalAdapter.findUserById(userId);
        if (!user) {
            throw new BusinessException(ErrorCodes.APP_USER.NOT_FOUND);
        }
        return user;
    }

    async listUsers(request: ListAdminUsersRequest): Promise<{ users: BetterAuthUser[]; total: number }> {
        const authContext = await this.getAuthContext();
        const where: Array<{ field: string; operator: string; value: unknown }> = [];
        const searchField = this.assertNoBetterAuthRoleQueryField(request.searchField?.value) || 'email';
        const filterField = this.assertNoBetterAuthRoleQueryField(request.filterField?.value) || 'email';
        const sortBy = this.assertNoBetterAuthRoleQueryField(request.sortBy?.value);

        if (request.searchValue) {
            where.push({
                field: searchField,
                operator: request.searchOperator?.value || 'contains',
                value: request.searchValue.value
            });
        }
        if (request.filterValue) {
            where.push({
                field: filterField,
                operator: request.filterOperator?.value || 'eq',
                value: fromAdminFilterValue(request.filterValue)
            });
        }

        const filter = where.length > 0 ? where : undefined;
        const users = await authContext.internalAdapter.listUsers(
            request.limit?.value || undefined,
            request.offset?.value || undefined,
            sortBy
                ? {
                      field: sortBy,
                      direction: request.sortDirection?.value || 'asc'
                  }
                : undefined,
            filter
        );
        const total = await authContext.internalAdapter.countTotalUsers(filter);
        return { users, total };
    }

    async getUser(userId: string): Promise<BetterAuthUser> {
        return await this.ensureUserExists(userId);
    }

    async createUser(body: Record<string, unknown>): Promise<BetterAuthUser> {
        const result = (await this.authService.api.createUser({
            body: {
                ...body,
                role: BETTER_AUTH_USER_ROLE
            }
        })) as BetterAuthCreateUserResult;
        return result.user;
    }

    async updateUser(userId: string, data: Record<string, unknown>): Promise<BetterAuthUser> {
        if (Object.keys(data).length === 0) {
            throw new HttpException(
                { code: HttpStatus.BAD_REQUEST, message: '没有需要更新的用户字段' },
                HttpStatus.BAD_REQUEST
            );
        }

        await this.ensureUserExists(userId);
        const authContext = await this.getAuthContext();
        const updateData = this.normalizeUpdateData(data);
        return await authContext.internalAdapter.updateUser(userId, updateData);
    }

    async banUser(userId: string, banReason = '管理员封禁账号', banExpiresIn?: number): Promise<BetterAuthUser> {
        await this.ensureUserExists(userId);
        const authContext = await this.getAuthContext();
        const user = await authContext.internalAdapter.updateUser(userId, {
            banned: true,
            banReason,
            banExpires: banExpiresIn ? new Date(Date.now() + banExpiresIn * 1000) : null,
            role: BETTER_AUTH_USER_ROLE,
            updatedAt: new Date()
        });
        await authContext.internalAdapter.deleteSessions(userId);
        return user;
    }

    async unbanUser(userId: string): Promise<BetterAuthUser> {
        await this.ensureUserExists(userId);
        const authContext = await this.getAuthContext();
        return await authContext.internalAdapter.updateUser(userId, {
            banned: false,
            banReason: null,
            banExpires: null,
            role: BETTER_AUTH_USER_ROLE,
            updatedAt: new Date()
        });
    }

    async listUserSessions(userId: string): Promise<BetterAuthSession[]> {
        await this.ensureUserExists(userId);
        const authContext = await this.getAuthContext();
        return await authContext.internalAdapter.listSessions(userId);
    }

    async revokeUserSession(sessionToken: string): Promise<void> {
        const authContext = await this.getAuthContext();
        await authContext.internalAdapter.deleteSession(sessionToken);
    }

    async revokeUserSessions(userId: string): Promise<void> {
        await this.ensureUserExists(userId);
        const authContext = await this.getAuthContext();
        await authContext.internalAdapter.deleteSessions(userId);
    }

    async removeUser(userId: string): Promise<void> {
        await this.ensureUserExists(userId);
        const authContext = await this.getAuthContext();
        await authContext.internalAdapter.deleteSessions(userId);
        await authContext.internalAdapter.deleteUser(userId);
    }

    async setUserPassword(userId: string, newPassword: string): Promise<void> {
        await this.ensureUserExists(userId);
        const authContext = await this.getAuthContext();

        const minPasswordLength = authContext.password.config.minPasswordLength;
        if (newPassword.length < minPasswordLength) {
            throw new BusinessException(ErrorCodes.USER.PASSWORD_TOO_SHORT);
        }

        const maxPasswordLength = authContext.password.config.maxPasswordLength;
        if (newPassword.length > maxPasswordLength) {
            throw new BusinessException(ErrorCodes.USER.PASSWORD_TOO_LONG);
        }

        const hashedPassword = await authContext.password.hash(newPassword);
        await authContext.internalAdapter.updatePassword(userId, hashedPassword);
    }

    private normalizeUpdateData(data: Record<string, unknown>): Record<string, unknown> {
        const updateData: Record<string, unknown> = { ...data };
        if (typeof updateData.email === 'string') {
            updateData.email = updateData.email.toLowerCase();
        }
        updateData.role = BETTER_AUTH_USER_ROLE;
        return updateData;
    }
}
