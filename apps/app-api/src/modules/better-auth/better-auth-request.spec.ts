import type { BetterAuthSession } from './better-auth-session.type';
import { buildBetterAuthHeaders, resolveBetterAuthRequestSession, type BetterAuthRequest } from './better-auth-request';

function createSession(userId = 'user_1'): BetterAuthSession {
    return {
        user: {
            id: userId
        },
        session: {
            userId
        },
        roles: [],
        profile: null
    } as BetterAuthSession;
}

describe('better-auth-request', () => {
    it('buildBetterAuthHeaders 应保留普通头与多值头', () => {
        const headers = buildBetterAuthHeaders({
            authorization: 'Bearer token_1',
            cookie: ['a=1', 'b=2']
        });

        expect(headers.get('authorization')).toBe('Bearer token_1');
        expect(headers.get('cookie')).toBe('a=1; b=2');
    });

    it('request.session 已存在时不应再次调用 Better Auth getSession', async () => {
        const session = createSession();
        const request = {
            headers: {},
            session
        } as BetterAuthRequest;
        const authService = {
            api: {
                getSession: jest.fn()
            }
        };

        await expect(resolveBetterAuthRequestSession(request, authService as any)).resolves.toBe(session);
        expect(authService.api.getSession).not.toHaveBeenCalled();
    });

    it('同一个 request 内并发解析 session 时应复用同一个 getSession Promise', async () => {
        const session = createSession('user_2');
        let resolveSession!: (value: BetterAuthSession) => void;
        const getSessionPromise = new Promise<BetterAuthSession>((resolve) => {
            resolveSession = resolve;
        });
        const request = {
            headers: {
                authorization: 'Bearer token_2'
            }
        } as BetterAuthRequest;
        const authService = {
            api: {
                getSession: jest.fn(() => getSessionPromise)
            }
        };

        const first = resolveBetterAuthRequestSession(request, authService as any);
        const second = resolveBetterAuthRequestSession(request, authService as any);

        expect(authService.api.getSession).toHaveBeenCalledTimes(1);
        resolveSession(session);

        await expect(Promise.all([first, second])).resolves.toEqual([session, session]);
        expect(request.session).toBe(session);
        expect(request.user).toBe(session.user);
    });
});
