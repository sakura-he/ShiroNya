import { BusinessException, ErrorCodes } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { Prisma } from '@app/prisma-admin/generated/client';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth/api';

const DEFAULT_BAN_REASON = '管理员封禁账号';

type BetterAuthUser = Record<string, any>;

/**
 * 统一封装后台用户主表、密码和会话的 Better Auth 管理能力。
 */
@Injectable()
export class AdminUserAdminService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly authService: AuthService<any>
    ) {}

    /**
     * 获取 Better Auth 运行时上下文，便于复用内部适配器与密码能力。
     */
    private async getAuthContext() {
        return await this.authService.instance.$context;
    }

    /**
     * 确认目标用户存在，避免内部适配器直接抛出不透明错误。
     */
    private async ensureUserExists(userId: string): Promise<BetterAuthUser> {
        const authContext = await this.getAuthContext();
        const user = await authContext.internalAdapter.findUserById(userId);

        if (!user) {
            throw new BusinessException(ErrorCodes.USER.NOT_FOUND);
        }

        return user;
    }

    /**
     * 把 Better Auth / Prisma 用户管理错误统一翻译成项目异常。
     */
    private normalizeAdminUserError(error: unknown): never {
        if (error instanceof BusinessException || error instanceof HttpException) {
            throw error;
        }

        if (error instanceof APIError) {
            const errorBody = (error as APIError & { body?: Record<string, unknown> }).body ?? {};
            const errorCode = typeof errorBody.code === 'string' ? errorBody.code : '';
            const message = typeof errorBody.message === 'string' ? errorBody.message : error.message;

            if (errorCode === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' || errorCode === 'USERNAME_IS_ALREADY_TAKEN') {
                throw new BusinessException(ErrorCodes.USER.EXISTS);
            }

            if (errorCode === 'USER_NOT_FOUND') {
                throw new BusinessException(ErrorCodes.USER.NOT_FOUND);
            }

            if (errorCode === 'PASSWORD_TOO_SHORT') {
                throw new BusinessException(ErrorCodes.USER.PASSWORD_TOO_SHORT);
            }

            if (errorCode === 'PASSWORD_TOO_LONG') {
                throw new BusinessException(ErrorCodes.USER.PASSWORD_TOO_LONG);
            }

            let status = HttpStatus.INTERNAL_SERVER_ERROR;
            if (error.status === 'BAD_REQUEST') {
                status = HttpStatus.BAD_REQUEST;
            } else if (error.status === 'UNAUTHORIZED') {
                status = HttpStatus.UNAUTHORIZED;
            } else if (error.status === 'FORBIDDEN') {
                status = HttpStatus.FORBIDDEN;
            } else if (error.status === 'NOT_FOUND') {
                status = HttpStatus.NOT_FOUND;
            } else if (error.status === 'CONFLICT') {
                status = HttpStatus.CONFLICT;
            }

            throw new HttpException(
                {
                    code: status,
                    message,
                    data: {
                        source: 'better_auth',
                        betterAuthCode: errorCode,
                        betterAuthStatus: error.status
                    }
                },
                status
            );
        }

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
                throw new BusinessException(ErrorCodes.USER.EXISTS);
            }

            if (error.code === 'P2025') {
                throw new BusinessException(ErrorCodes.USER.NOT_FOUND);
            }
        }

        if (error instanceof Error) {
            throw error;
        }

        throw new Error(ErrorCodes.DEFAULT.message);
    }

    /**
     * 创建后台用户主表记录，并交给 Better Auth 负责密码账户初始化。
     */
    async createUser(input: {
        email: string;
        name: string;
        password: string;
        username: string;
        image?: string | null;
        phoneNumber?: string | null;
    }): Promise<BetterAuthUser> {
        try {
            const result = (await this.authService.api.createUser({
                body: {
                    email: input.email.toLowerCase(),
                    name: input.name,
                    password: input.password,
                    role: 'user',
                    data: {
                        username: input.username,
                        displayUsername: input.name,
                        image: input.image ?? null,
                        phoneNumber: input.phoneNumber ?? null,
                        phoneNumberVerified: false
                    }
                }
            })) as { user: BetterAuthUser };

            return result.user;
        } catch (error) {
            this.normalizeAdminUserError(error);
        }
    }

    /**
     * 更新后台用户主表字段，不引入 Better Auth admin 角色耦合。
     */
    async updateUser(
        userId: string,
        data: {
            email?: string;
            name?: string;
            username?: string;
            image?: string | null;
            phoneNumber?: string | null;
        }
    ): Promise<BetterAuthUser> {
        try {
            await this.ensureUserExists(userId);

            const authContext = await this.getAuthContext();
            const updateData: Record<string, unknown> = { ...data };

            if (typeof updateData.email === 'string') {
                updateData.email = updateData.email.toLowerCase();
            }

            if (data.name !== undefined) {
                updateData.displayUsername = data.name;
            }

            return await authContext.internalAdapter.updateUser(userId, updateData);
        } catch (error) {
            this.normalizeAdminUserError(error);
        }
    }

    /**
     * 查询指定后台用户主表记录。
     */
    async getUser(userId: string): Promise<BetterAuthUser> {
        try {
            return await this.ensureUserExists(userId);
        } catch (error) {
            this.normalizeAdminUserError(error);
        }
    }

    /**
     * 封禁指定后台用户。
     */
    async banUser(userId: string, banReason = DEFAULT_BAN_REASON): Promise<void> {
        try {
            const authContext = await this.getAuthContext();
            await this.ensureUserExists(userId);

            await authContext.internalAdapter.updateUser(userId, {
                banned: true,
                banReason,
                banExpires: null
            });
            await authContext.internalAdapter.deleteSessions(userId);
        } catch (error) {
            this.normalizeAdminUserError(error);
        }
    }

    /**
     * 解封指定后台用户。
     */
    async unbanUser(userId: string): Promise<void> {
        try {
            const authContext = await this.getAuthContext();
            await this.ensureUserExists(userId);

            await authContext.internalAdapter.updateUser(userId, {
                banned: false,
                banReason: null,
                banExpires: null
            });
        } catch (error) {
            this.normalizeAdminUserError(error);
        }
    }

    /**
     * 设置指定后台用户密码，并沿用 Better Auth 密码长度约束。
     */
    async setUserPassword(userId: string, newPassword: string): Promise<void> {
        try {
            const authContext = await this.getAuthContext();
            await this.ensureUserExists(userId);

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
        } catch (error) {
            this.normalizeAdminUserError(error);
        }
    }

    /**
     * 删除指定后台用户。
     */
    async removeUser(userId: string): Promise<void> {
        try {
            const authContext = await this.getAuthContext();
            await this.ensureUserExists(userId);
            await authContext.internalAdapter.deleteUser(userId);
        } catch (error) {
            this.normalizeAdminUserError(error);
        }
    }

    /**
     * 撤销指定后台用户的全部会话。
     */
    async revokeUserSessions(userId: string): Promise<void> {
        try {
            const authContext = await this.getAuthContext();
            await this.ensureUserExists(userId);
            await authContext.internalAdapter.deleteSessions(userId);
        } catch (error) {
            this.normalizeAdminUserError(error);
        }
    }

    /**
     * 撤销指定会话。
     */
    async revokeUserSession(sessionToken: string): Promise<void> {
        try {
            const authContext = await this.getAuthContext();
            await authContext.internalAdapter.deleteSession(sessionToken);
        } catch (error) {
            this.normalizeAdminUserError(error);
        }
    }
}
