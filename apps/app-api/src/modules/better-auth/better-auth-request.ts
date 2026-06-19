import type { AuthService } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import type { IncomingHttpHeaders } from 'node:http';
import type { BetterAuthSession } from './better-auth-session.type';

const BETTER_AUTH_SESSION_PROMISE_KEY = Symbol.for('admin-api.app-api.better-auth.session-promise');

export type BetterAuthRequest = Request & {
    session?: BetterAuthSession;
    user?: BetterAuthSession['user'] | null;
    [BETTER_AUTH_SESSION_PROMISE_KEY]?: Promise<BetterAuthSession | null>;
};

/**
 * 把 Node 请求头转换成 Better Auth API 识别的 Headers 对象。
 */
export function buildBetterAuthHeaders(headers: IncomingHttpHeaders): Headers {
    const result = new Headers();

    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined) {
            continue;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => result.append(key, item));
            continue;
        }

        result.set(key, value);
    }

    return result;
}

/**
 * 在同一个 HTTP request 内只解析一次 Better Auth session。
 */
export async function resolveBetterAuthRequestSession(
    request: BetterAuthRequest,
    authService: AuthService<any>
): Promise<BetterAuthSession | null> {
    if (request.session?.user?.id) {
        return request.session;
    }

    const cachedPromise = request[BETTER_AUTH_SESSION_PROMISE_KEY];
    if (cachedPromise) {
        return await cachedPromise;
    }

    const sessionPromise = authService.api
        .getSession({
            headers: buildBetterAuthHeaders(request.headers)
        })
        .then((session: BetterAuthSession | null) => {
            request.session = session ?? undefined;
            request.user = session?.user ?? null;
            return session;
        })
        .catch((error: unknown) => {
            request[BETTER_AUTH_SESSION_PROMISE_KEY] = undefined;
            throw error;
        });

    request[BETTER_AUTH_SESSION_PROMISE_KEY] = sessionPromise;
    return await sessionPromise;
}
