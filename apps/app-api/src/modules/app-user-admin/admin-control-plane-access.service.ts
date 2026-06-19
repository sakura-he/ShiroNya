import {
    APP_USER_ADMIN_ACTOR_ID_METADATA_KEY,
    APP_USER_ADMIN_ACTOR_NAME_METADATA_KEY,
    APP_USER_ADMIN_REASON_METADATA_KEY,
    APP_USER_ADMIN_RPC_SCOPE_MAP,
    APP_USER_ADMIN_SCOPES_METADATA_KEY,
    type AppUserAdminRpcMethod,
    getGrpcMetadataStringValue,
    SHIRO_GRPC_REQUEST_ID_METADATA_KEY,
    SHIRO_GRPC_SOURCE_APP_METADATA_KEY
} from '@app/common';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminErrorCodes } from '../../common/constants/index';

export type AdminControlPlaneContext = {
    method: AppUserAdminRpcMethod;
    requiredScope: string;
    requestId: string;
    sourceApp: string;
    actorId: string;
    actorName?: string;
    reason?: string;
    scopes: string[];
};

function splitScopes(rawScopes: string | undefined): string[] {
    if (!rawScopes) {
        return [];
    }

    return rawScopes
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

function buildHttpError(status: HttpStatus, error: { code: number; message: string }): HttpException {
    return new HttpException({ code: error.code, message: error.message }, status);
}

/**
 * 校验 admin-api -> app-api 后台控制面 gRPC 调用上下文。
 *
 * 服务身份由 gRPC mTLS transport 保证；这里强制校验调用来源、操作人、requestId 和方法级 scope。
 * admin 侧已经完成用户权限判断，app-api 只确认本次 RPC 来自可信控制面并保留 actor 审计上下文。
 */
@Injectable()
export class AdminControlPlaneAccessService {
    constructor(private readonly configService: ConfigService) {}

    assertRpcAccess(method: AppUserAdminRpcMethod, metadata: unknown): AdminControlPlaneContext {
        const requiredScope = APP_USER_ADMIN_RPC_SCOPE_MAP[method];
        if (!requiredScope) {
            throw buildHttpError(HttpStatus.BAD_REQUEST, AdminErrorCodes.CONTROL_PLANE.METHOD_SCOPE_NOT_DECLARED);
        }

        const requestId = getGrpcMetadataStringValue(metadata, SHIRO_GRPC_REQUEST_ID_METADATA_KEY);
        const sourceApp = getGrpcMetadataStringValue(metadata, SHIRO_GRPC_SOURCE_APP_METADATA_KEY);
        const actorId = getGrpcMetadataStringValue(metadata, APP_USER_ADMIN_ACTOR_ID_METADATA_KEY);
        const actorName = getGrpcMetadataStringValue(metadata, APP_USER_ADMIN_ACTOR_NAME_METADATA_KEY);
        const reason = getGrpcMetadataStringValue(metadata, APP_USER_ADMIN_REASON_METADATA_KEY);
        const scopes = splitScopes(getGrpcMetadataStringValue(metadata, APP_USER_ADMIN_SCOPES_METADATA_KEY));

        const expectedSourceApp = this.configService.get<string>('APP_USER_ADMIN_ALLOWED_SOURCE_APP') || 'admin-api';
        if (sourceApp !== expectedSourceApp) {
            throw buildHttpError(HttpStatus.UNAUTHORIZED, AdminErrorCodes.CONTROL_PLANE.SOURCE_INVALID);
        }

        if (!actorId) {
            throw buildHttpError(HttpStatus.UNAUTHORIZED, AdminErrorCodes.CONTROL_PLANE.ACTOR_REQUIRED);
        }

        if (!requestId) {
            throw buildHttpError(HttpStatus.BAD_REQUEST, AdminErrorCodes.CONTROL_PLANE.REQUEST_ID_REQUIRED);
        }

        if (!scopes.includes(requiredScope)) {
            throw buildHttpError(HttpStatus.FORBIDDEN, AdminErrorCodes.CONTROL_PLANE.SCOPE_REQUIRED);
        }

        return {
            method,
            requiredScope,
            requestId,
            sourceApp,
            actorId,
            actorName,
            reason,
            scopes
        };
    }
}
