import { Metadata } from '@grpc/grpc-js';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, Observable } from 'rxjs';
import { getRequestContext } from '../logger/request-context';
import { writeUserActionLog } from '../logger/runtime-logger';
import { ShiroGrpcLogContextInterceptor } from './grpc-log-context.interceptor';

jest.mock('../logger/runtime-logger', () => ({
    writeUserActionLog: jest.fn()
}));

class TestGrpcController {
    listBusinessUsers() {
        return undefined;
    }
}

function createExecutionContext(input: {
    request: unknown;
    metadata: Metadata;
    serverCall: {
        getPath: jest.Mock<string, []>;
        getPeer: jest.Mock<string, []>;
        sendMetadata: jest.Mock<void, [Metadata]>;
    };
}): ExecutionContext {
    return {
        getType: () => 'rpc',
        getClass: () => TestGrpcController,
        getHandler: () => TestGrpcController.prototype.listBusinessUsers,
        switchToRpc: () => ({
            getData: () => input.request
        }),
        getArgByIndex: (index: number) => {
            if (index === 1) return input.metadata;
            if (index === 2) return input.serverCall;
            return undefined;
        }
    } as unknown as ExecutionContext;
}

describe('ShiroGrpcLogContextInterceptor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('keeps protobuf response raw and writes grpc request context log', async () => {
        const metadata = new Metadata();
        metadata.set('x-request-id', 'req-grpc-1');
        metadata.set('x-shiro-source-app', 'admin-api');
        metadata.set('x-shiro-target-rpc-method', 'ListBusinessUsers');
        metadata.set('x-shiro-actor-id', 'admin-1');
        metadata.set('x-shiro-actor-name', 'Admin');
        metadata.set('authorization', 'Bearer secret-token');

        const serverCall = {
            getPath: jest.fn(() => '/shiro.app.AppUserAdmin/ListBusinessUsers'),
            getPeer: jest.fn(() => 'ipv4:127.0.0.1:50051'),
            sendMetadata: jest.fn()
        };
        const executionContext = createExecutionContext({
            request: { page: 1 },
            metadata,
            serverCall
        });
        const response = { items: [] };
        let capturedRequestId: string | undefined;
        const next: CallHandler = {
            handle: () =>
                new Observable((subscriber) => {
                    capturedRequestId = getRequestContext()?.requestId;
                    subscriber.next(response);
                    subscriber.complete();
                })
        };

        const result = await firstValueFrom(new ShiroGrpcLogContextInterceptor().intercept(executionContext, next));

        expect(result).toBe(response);
        expect(capturedRequestId).toBe('req-grpc-1');
        expect(serverCall.sendMetadata).toHaveBeenCalledTimes(1);
        expect(serverCall.sendMetadata.mock.calls[0][0].get('x-request-id')).toEqual(['req-grpc-1']);
        expect(writeUserActionLog).toHaveBeenCalledWith(
            expect.objectContaining({
                level: 'info',
                module: 'TestGrpc',
                userId: 'admin-1',
                event: 'grpc_response',
                requestId: 'req-grpc-1',
                actor: {
                    id: 'admin-1',
                    type: 'admin',
                    name: 'Admin'
                },
                rpc: expect.objectContaining({
                    transport: 'grpc',
                    service: 'AppUserAdmin',
                    method: 'ListBusinessUsers',
                    path: '/shiro.app.AppUserAdmin/ListBusinessUsers',
                    peer: 'ipv4:127.0.0.1:50051',
                    grpcStatus: 0,
                    durationMs: expect.any(Number),
                    requestMetadata: expect.objectContaining({
                        'x-request-id': 'req-grpc-1',
                        'x-shiro-source-app': 'admin-api',
                        authorization: 'Bearer secret-token'
                    }),
                    requestBody: { page: 1 }
                })
            })
        );
    });

    it('keeps errors unformatted so ShiroGrpcExceptionFilter can handle them', async () => {
        const metadata = new Metadata();
        metadata.set('x-request-id', 'req-grpc-error');
        const serverCall = {
            getPath: jest.fn(() => '/shiro.app.AppUserAdmin/CreateBusinessUser'),
            getPeer: jest.fn(() => 'ipv4:127.0.0.1:50051'),
            sendMetadata: jest.fn()
        };
        const executionContext = createExecutionContext({
            request: { username: 'test' },
            metadata,
            serverCall
        });
        const error = new Error('boom');
        let capturedRequestId: string | undefined;
        const next: CallHandler = {
            handle: () =>
                new Observable((subscriber) => {
                    capturedRequestId = getRequestContext()?.requestId;
                    subscriber.error(error);
                })
        };

        await expect(firstValueFrom(new ShiroGrpcLogContextInterceptor().intercept(executionContext, next))).rejects.toBe(
            error
        );

        expect(capturedRequestId).toBe('req-grpc-error');
        expect(writeUserActionLog).not.toHaveBeenCalled();
    });
});
