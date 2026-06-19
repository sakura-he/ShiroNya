import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { createSpiceDbNestOptions } from './admin-spicedb-nestjs-resolvers';

describe('App API SpiceDB NestJS resolvers', () => {
    const authService = {
        api: {
            getSession: jest.fn()
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    function createMockExecutionContext(args: {
        session?: { user?: { id?: string } };
        headers?: Record<string, string>;
    }): ExecutionContext {
        const request: Record<string, unknown> = {
            headers: args.headers ?? {},
            session: args.session
        };

        return {
            getHandler: () => () => null,
            getClass: () => class MockController {},
            switchToHttp: () => ({
                getRequest: () => request
            })
        } as unknown as ExecutionContext;
    }

    it('subject resolver 应从 Better Auth session 解析 user subject', async () => {
        const options = createSpiceDbNestOptions(authService as any);
        const context = createMockExecutionContext({
            session: {
                user: {
                    id: 'user_1'
                }
            }
        });

        await expect(options.resolvers!.subject(context)).resolves.toEqual({
            type: 'user',
            id: 'user_1'
        });
        expect(authService.api.getSession).not.toHaveBeenCalled();
    });

    it('subject resolver 在 request.session 缺失时应回源 Better Auth getSession', async () => {
        const options = createSpiceDbNestOptions(authService as any);
        const context = createMockExecutionContext({
            headers: {
                authorization: 'Bearer token_1'
            }
        });
        authService.api.getSession.mockResolvedValueOnce({
            user: {
                id: 'user_2'
            },
            session: {
                userId: 'user_2'
            },
            roles: [],
            profile: null
        });

        await expect(options.resolvers!.subject(context)).resolves.toEqual({
            type: 'user',
            id: 'user_2'
        });
        expect(authService.api.getSession).toHaveBeenCalledWith({
            headers: expect.any(Headers)
        });
    });

    it('subject resolver 缺少 session 时应返回 401', async () => {
        const options = createSpiceDbNestOptions(authService as any);
        const context = createMockExecutionContext({});
        authService.api.getSession.mockResolvedValueOnce(null);

        await expect(options.resolvers!.subject(context)).rejects.toThrow(UnauthorizedException);
    });

    it('不提供默认 resource resolver，路由必须显式声明 SpiceDB resource', () => {
        const options = createSpiceDbNestOptions(authService as any);

        expect(options.resolvers!.resource).toBeUndefined();
    });
});
