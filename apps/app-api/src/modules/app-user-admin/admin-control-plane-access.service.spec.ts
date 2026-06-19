import { Metadata } from '@grpc/grpc-js';
import { HttpException } from '@nestjs/common';
import {
    APP_USER_ADMIN_ACTOR_ID_METADATA_KEY,
    APP_USER_ADMIN_SCOPES_METADATA_KEY,
    SHIRO_GRPC_REQUEST_ID_METADATA_KEY,
    SHIRO_GRPC_SOURCE_APP_METADATA_KEY
} from '@app/common';
import { AdminControlPlaneAccessService } from './admin-control-plane-access.service';

function createService(values: Record<string, string | undefined> = {}): AdminControlPlaneAccessService {
    return new AdminControlPlaneAccessService({
        get: jest.fn((key: string) => values[key])
    } as any);
}

function createMetadata(values: Record<string, string>): Metadata {
    const metadata = new Metadata();
    for (const [key, value] of Object.entries(values)) {
        metadata.set(key, value);
    }
    return metadata;
}

describe('AdminControlPlaneAccessService', () => {
    it('默认强制要求来源、actor、requestId 与 scope 同时有效', () => {
        const service = createService();
        const metadata = createMetadata({
            [SHIRO_GRPC_SOURCE_APP_METADATA_KEY]: 'admin-api',
            [APP_USER_ADMIN_ACTOR_ID_METADATA_KEY]: 'admin_1',
            [SHIRO_GRPC_REQUEST_ID_METADATA_KEY]: 'req_1',
            [APP_USER_ADMIN_SCOPES_METADATA_KEY]: 'app.user.read app.user.update'
        });

        const context = service.assertRpcAccess('UpdateBusinessUser', metadata);

        expect(context.actorId).toBe('admin_1');
        expect(context.requiredScope).toBe('app.user.update');
        expect(context.requestId).toBe('req_1');
    });

    it('缺少来源、actor、requestId 或 scope 时拒绝控制面调用', () => {
        const service = createService();
        const metadata = createMetadata({
            [SHIRO_GRPC_SOURCE_APP_METADATA_KEY]: 'admin-api',
            [APP_USER_ADMIN_ACTOR_ID_METADATA_KEY]: 'admin_1',
            [SHIRO_GRPC_REQUEST_ID_METADATA_KEY]: 'req_1',
            [APP_USER_ADMIN_SCOPES_METADATA_KEY]: 'app.user.read'
        });

        expect(() => service.assertRpcAccess('UpdateBusinessUser', metadata)).toThrow(HttpException);
        expect(() => service.assertRpcAccess('ListBusinessUsers', new Metadata())).toThrow(HttpException);
    });
});
