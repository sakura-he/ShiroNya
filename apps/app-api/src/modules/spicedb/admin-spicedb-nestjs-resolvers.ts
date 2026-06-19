import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { SpiceDbModuleOptions, SpiceDbSubject } from '@spicedb-toolkit/nestjs';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { resolveBetterAuthRequestSession, type BetterAuthRequest } from '../better-auth/better-auth-request';

/**
 * 从 Better Auth 会话解析 SpiceDB subject，缺少会话时明确返回 401。
 */
async function resolveSessionSubject(
    context: ExecutionContext,
    authService: AuthService<any>
): Promise<SpiceDbSubject> {
    const request = context.switchToHttp().getRequest<BetterAuthRequest>();
    const session = await resolveBetterAuthRequestSession(request, authService);
    const userId = session?.user?.id;
    if (!userId) {
        throw new UnauthorizedException('当前请求缺少后台会话，无法执行 SpiceDB 权限校验');
    }

    return {
        type: 'user',
        id: userId
    };
}

/**
 * 构建 spicedb-toolkit NestJS 模块配置。
 *
 * 这里只解析 SpiceDB subject，不从 RBAC 权限码或菜单表推导 resource。
 * 路由级 resource 必须通过 @SpiceDbPermission({ resourceType, resourceId })
 * 或 @SpiceDbResolvers({ resource }) 显式声明，保证 SpiceDB 鉴权可以独立替换 RBAC。
 */
export function createSpiceDbNestOptions(...args: unknown[]): SpiceDbModuleOptions {
    const [authService] = args as [AuthService<any>];

    return {
        configFile: true,
        defaultGuardBehavior: 'throw',
        resolvers: {
            subject: (context) => resolveSessionSubject(context, authService)
        }
    };
}
