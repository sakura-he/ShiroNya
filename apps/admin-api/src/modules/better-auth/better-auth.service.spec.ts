import { PrismaService } from '@app/prisma-admin';
import { RbacStatus } from '@app/prisma-admin/generated/client';
import { BetterAuthService } from './better-auth.service';

describe('BetterAuthService', () => {
    it('buildCustomSession 应通过 effective role relation 一次带出启用角色元数据', async () => {
        const role = {
            id: 1,
            code: 'admin',
            name: '管理员',
            status: RbacStatus.ENABLE
        };
        const profile = {
            userId: 'user_1',
            remark: null
        };
        const prismaService = {
            rbacEffectiveUserRole: {
                findMany: jest.fn().mockResolvedValue([{ role }])
            },
            betterAuthUserProfile: {
                findUnique: jest.fn().mockResolvedValue(profile)
            },
            rbacRole: {
                findMany: jest.fn()
            }
        };
        const service = new BetterAuthService(prismaService as unknown as PrismaService);

        await expect(
            service.buildCustomSession({
                user: { id: 'user_1', email: 'admin@example.com' } as any,
                session: { id: 'session_1', userId: 'user_1' } as any
            })
        ).resolves.toMatchObject({
            roles: [role],
            profile
        });

        expect(prismaService.rbacEffectiveUserRole.findMany).toHaveBeenCalledWith({
            where: {
                userId: 'user_1',
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
        });
        expect(prismaService.rbacRole.findMany).not.toHaveBeenCalled();
    });

    it('touchLastLoginAt 只在交互式登录创建 session 后刷新最后登录时间', async () => {
        const prismaService = {
            betterAuthUserProfile: {
                upsert: jest.fn().mockResolvedValue(undefined)
            }
        };
        const service = new BetterAuthService(prismaService as unknown as PrismaService);

        await service.touchLastLoginAt({ userId: 'user_1' } as any, { path: '/sign-in/username' } as any);

        expect(prismaService.betterAuthUserProfile.upsert).toHaveBeenCalledWith({
            where: {
                userId: 'user_1'
            },
            create: {
                userId: 'user_1',
                lastLoginAt: expect.any(Date)
            },
            update: {
                lastLoginAt: expect.any(Date)
            }
        });
    });

    it('touchLastLoginAt 不把伪装等非登录 session 当成最后登录', async () => {
        const prismaService = {
            betterAuthUserProfile: {
                upsert: jest.fn()
            }
        };
        const service = new BetterAuthService(prismaService as unknown as PrismaService);

        await service.touchLastLoginAt({ userId: 'user_1' } as any, { path: '/admin/impersonate-user' } as any);

        expect(prismaService.betterAuthUserProfile.upsert).not.toHaveBeenCalled();
    });
});
