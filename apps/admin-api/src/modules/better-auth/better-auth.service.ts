import { PrismaService } from '@app/prisma-admin';
import { Injectable } from '@nestjs/common';
import type { GenericEndpointContext, Session, User } from 'better-auth';
import { RbacStatus } from '@app/prisma-admin/generated/client';

type BaUser = User & Record<string, unknown>;
type BaSession = Session & Record<string, unknown>;

function isInteractiveLoginPath(path: unknown): boolean {
    return path === '/sign-in/username' || path === '/sign-in/phone-number' || path === '/phone-number/verify';
}

/**
 * 提供 admin 项目 Better Auth 的业务钩子能力。
 */
@Injectable()
export class BetterAuthService {
    constructor(private readonly prismaService: PrismaService) {}

    /**
     * 校验后台用户名，允许中文、字母、数字、下划线和短横线。
     */
    validateAdminUsername(username: string): boolean {
        return /^[\u4e00-\u9fa5A-Za-z0-9_-]{1,64}$/.test(username);
    }

    /**
     * 在 Better Auth 用户创建后补齐后台资料表默认行。
     */
    async initializeNewUser(user: BaUser): Promise<void> {
        await this.prismaService.betterAuthUserProfile.upsert({
            where: {
                userId: user.id
            },
            create: {
                userId: user.id
            },
            update: {}
        });
    }

    /**
     * 在交互式登录成功创建 session 后刷新后台用户最后登录时间。
     */
    async touchLastLoginAt(session: BaSession, ctx?: GenericEndpointContext): Promise<void> {
        if (!session.userId || !isInteractiveLoginPath(ctx?.path)) {
            return;
        }

        const lastLoginAt = new Date();
        await this.prismaService.betterAuthUserProfile.upsert({
            where: {
                userId: session.userId
            },
            create: {
                userId: session.userId,
                lastLoginAt
            },
            update: {
                lastLoginAt
            }
        });
    }

    /**
     * 组装 admin 项目 customSession，直接把角色与资料放进会话上下文。
     */
    async buildCustomSession(
        context: { user: BaUser; session: BaSession },
        _ctx?: GenericEndpointContext
    ): Promise<Record<string, unknown>> {
        const { user, session } = context;
        const [roleRows, profile] = await Promise.all([
            this.prismaService.rbacEffectiveUserRole.findMany({
                where: {
                    userId: user.id,
                    role: {
                        status: RbacStatus.ENABLE,
                        deletedAt: null
                    }
                },
                select: {
                    role: true
                },
                orderBy: {
                    roleId: 'asc'
                }
            }),
            this.prismaService.betterAuthUserProfile.findUnique({
                where: {
                    userId: user.id
                }
            })
        ]);
        const roles = roleRows.map((row) => row.role);

        return {
            user,
            session,
            roles,
            profile
        };
    }
}
