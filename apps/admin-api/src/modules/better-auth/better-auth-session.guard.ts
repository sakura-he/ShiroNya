import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { PUBLIC_KEY, type HttpLoggingRequest } from '@app/common';
import { resolveBetterAuthRequestSession, type BetterAuthRequest } from './better-auth-request';
import type { BetterAuthSession } from './better-auth-session.type';
import { isActiveBetterAuthBan } from './better-auth-ban';

const BETTER_AUTH_PUBLIC_KEY = 'PUBLIC';
const BETTER_AUTH_OPTIONAL_KEY = 'OPTIONAL';

/**
 * admin-api 专用 Better Auth 认证守卫。
 *
 * 官方 Better Auth guard 每个 guard 执行点都会调用一次 getSession。
 * 这里把 session 解析收敛到 request 级共享 resolver；业务授权由 RbacGuard 执行。
 */
@Injectable()
export class BetterAuthSessionGuard implements CanActivate {
    private readonly tracer = trace.getTracer('admin-api.admin.better_auth.session');

    constructor(
        private readonly reflector: Reflector,
        private readonly authService: AuthService<any>
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        return await this.tracer.startActiveSpan(
            'better_auth.session_guard',
            {
                attributes: {
                    'code.namespace': context.getClass().name,
                    'code.function': context.getHandler().name
                }
            },
            async (span) => {
                try {
                    const publicRoute = this.isPublicRoute(context);
                    span.setAttribute('auth.route.public', publicRoute);
                    if (publicRoute) {
                        span.setAttribute('auth.session.required', false);
                        return true;
                    }

                    const optionalRoute = this.isOptionalRoute(context);
                    const request = context.switchToHttp().getRequest<BetterAuthRequest & HttpLoggingRequest>();
                    attachRequestIdToSpan(span, request.__shiroLogContext?.requestId);
                    const session = await resolveBetterAuthRequestSession(request, this.authService);
                    span.setAttributes({
                        'auth.route.optional': optionalRoute,
                        'auth.session.present': Boolean(session)
                    });

                    if (!session) {
                        if (optionalRoute) {
                            return true;
                        }

                        throw new UnauthorizedException('当前请求缺少后台会话');
                    }

                    attachSessionUserToSpan(span, session);

                    if (isActiveBetterAuthBan(session.user)) {
                        throw new UnauthorizedException('当前后台账号已被封禁');
                    }

                    // Better Auth 在 admin 后端只负责身份与 session 生命周期，不读取其角色/组织权限 metadata 做业务授权。
                    return true;
                } catch (error) {
                    recordSpanException(span, error);
                    throw error;
                } finally {
                    span.end();
                }
            }
        );
    }

    private isPublicRoute(context: ExecutionContext): boolean {
        return Boolean(
            this.reflector.getAllAndOverride<boolean>(BETTER_AUTH_PUBLIC_KEY, [
                context.getHandler(),
                context.getClass()
            ]) || this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [context.getHandler(), context.getClass()])
        );
    }

    private isOptionalRoute(context: ExecutionContext): boolean {
        return Boolean(
            this.reflector.getAllAndOverride<boolean>(BETTER_AUTH_OPTIONAL_KEY, [
                context.getHandler(),
                context.getClass()
            ])
        );
    }
}

function attachRequestIdToSpan(span: Span, requestId?: string): void {
    if (!requestId) {
        return;
    }

    span.setAttributes({
        'request.id': requestId,
        'http.request_id': requestId,
        'shiro.request_id': requestId
    });
}

function attachSessionUserToSpan(span: Span, session: BetterAuthSession): void {
    const userId = session.user.id || session.session.userId;
    if (!userId) {
        return;
    }

    span.setAttributes({
        'auth.user.id': userId,
        'enduser.id': userId,
        'user.id': userId,
        'shiro.user_id': userId,
        'auth.roles.count': session.roles.length
    });
}

function recordSpanException(span: Span, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    span.recordException(error instanceof Error ? error : new Error(message));
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message
    });
}
