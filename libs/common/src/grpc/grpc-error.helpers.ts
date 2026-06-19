import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { HttpStatus } from '@nestjs/common';
import type { ShiroErrorResponse } from '../filters/types';
import type { ShiroNormalizedErrorCategory, ShiroNormalizedException } from '../filters/shiro-error-normalizer';
import {
    APP_USER_ADMIN_ACTOR_ID_METADATA_KEY,
    APP_USER_ADMIN_ACTOR_NAME_METADATA_KEY,
    APP_USER_ADMIN_REASON_METADATA_KEY,
    APP_USER_ADMIN_SCOPES_METADATA_KEY
} from './app-user-admin-control-plane';

export const SHIRO_GRPC_ERROR_METADATA_KEY = 'x-shiro-error';
export const SHIRO_GRPC_REQUEST_ID_METADATA_KEY = 'x-request-id';
export const SHIRO_GRPC_SOURCE_APP_METADATA_KEY = 'x-shiro-source-app';
export const SHIRO_GRPC_SOURCE_HTTP_METHOD_METADATA_KEY = 'x-shiro-source-http-method';
export const SHIRO_GRPC_SOURCE_HANDLER_METADATA_KEY = 'x-shiro-source-handler';
export const SHIRO_GRPC_TARGET_METHOD_METADATA_KEY = 'x-shiro-target-rpc-method';

export type ShiroGrpcErrorPayload = ShiroErrorResponse & {
    category: ShiroNormalizedErrorCategory;
    httpStatus: number;
    grpcStatus: number;
};

type GrpcMetadataLike = {
    get: (key: string) => unknown[];
    getMap?: () => Record<string, string | Buffer>;
};

export type ShiroGrpcRequestMetadataContext = {
    requestId?: string;
    sourceApp?: string;
    sourceHttpMethod?: string;
    sourceHandler?: string;
    targetRpcMethod?: string;
    actorId?: string;
    actorName?: string;
    scopes?: string[];
    reason?: string;
    authorization?: string;
};

/**
 * 将 HTTP 语义映射成 gRPC 状态码，保证两端传输时语义稳定。
 */
export function mapHttpStatusToGrpcStatus(httpStatus: number, category: ShiroNormalizedErrorCategory): number {
    if (category === 'business') {
        return GrpcStatus.FAILED_PRECONDITION;
    }

    if (category === 'unauth') {
        return GrpcStatus.UNAUTHENTICATED;
    }

    if (httpStatus === HttpStatus.BAD_REQUEST) {
        return GrpcStatus.INVALID_ARGUMENT;
    }

    if (httpStatus === HttpStatus.UNAUTHORIZED) {
        return GrpcStatus.UNAUTHENTICATED;
    }

    if (httpStatus === HttpStatus.FORBIDDEN) {
        return GrpcStatus.PERMISSION_DENIED;
    }

    if (httpStatus === HttpStatus.NOT_FOUND) {
        return GrpcStatus.NOT_FOUND;
    }

    if (httpStatus === HttpStatus.CONFLICT) {
        return GrpcStatus.ALREADY_EXISTS;
    }

    if (httpStatus === HttpStatus.TOO_MANY_REQUESTS) {
        return GrpcStatus.RESOURCE_EXHAUSTED;
    }

    return GrpcStatus.INTERNAL;
}

/**
 * 将统一错误结构转换成 gRPC 传输载荷。
 */
export function buildGrpcErrorPayload(normalized: ShiroNormalizedException): ShiroGrpcErrorPayload {
    return {
        ...normalized.body,
        category: normalized.category,
        httpStatus: normalized.statusCode,
        grpcStatus: mapHttpStatusToGrpcStatus(normalized.statusCode, normalized.category)
    };
}

/**
 * 将结构化错误写入 gRPC metadata，避免只能依赖 details/message 传递错误。
 */
export function createGrpcErrorMetadata(payload: ShiroGrpcErrorPayload): Metadata {
    const metadata = new Metadata();
    metadata.set(SHIRO_GRPC_ERROR_METADATA_KEY, JSON.stringify(payload));
    return metadata;
}

/**
 * 为业务 gRPC 调用创建统一 metadata，用于 requestId 透传和日志串联。
 */
export function createGrpcRequestMetadata(context?: ShiroGrpcRequestMetadataContext): Metadata {
    const metadata = new Metadata();

    if (!context) {
        return metadata;
    }

    if (context.requestId) {
        metadata.set(SHIRO_GRPC_REQUEST_ID_METADATA_KEY, context.requestId);
    }
    if (context.sourceApp) {
        metadata.set(SHIRO_GRPC_SOURCE_APP_METADATA_KEY, context.sourceApp);
    }
    if (context.sourceHttpMethod) {
        metadata.set(SHIRO_GRPC_SOURCE_HTTP_METHOD_METADATA_KEY, context.sourceHttpMethod);
    }
    if (context.sourceHandler) {
        metadata.set(SHIRO_GRPC_SOURCE_HANDLER_METADATA_KEY, context.sourceHandler);
    }
    if (context.targetRpcMethod) {
        metadata.set(SHIRO_GRPC_TARGET_METHOD_METADATA_KEY, context.targetRpcMethod);
    }
    if (context.actorId) {
        metadata.set(APP_USER_ADMIN_ACTOR_ID_METADATA_KEY, context.actorId);
    }
    if (context.actorName) {
        metadata.set(APP_USER_ADMIN_ACTOR_NAME_METADATA_KEY, context.actorName);
    }
    if (context.scopes && context.scopes.length > 0) {
        metadata.set(APP_USER_ADMIN_SCOPES_METADATA_KEY, context.scopes.join(' '));
    }
    if (context.reason) {
        metadata.set(APP_USER_ADMIN_REASON_METADATA_KEY, context.reason);
    }
    if (context.authorization) {
        metadata.set('authorization', context.authorization);
    }

    return metadata;
}

/**
 * 解析 JSON 字符串形式的 gRPC 错误载荷。
 */
function parseGrpcErrorPayloadText(text: string): ShiroGrpcErrorPayload | null {
    try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (
            typeof parsed.category === 'string' &&
            typeof parsed.httpStatus === 'number' &&
            typeof parsed.grpcStatus === 'number' &&
            typeof parsed.code === 'number' &&
            typeof parsed.message === 'string'
        ) {
            return parsed as ShiroGrpcErrorPayload;
        }
    } catch {
        return null;
    }

    return null;
}

/**
 * 识别 grpc-js 的 Metadata 对象。
 */
function isGrpcMetadataLike(value: unknown): value is GrpcMetadataLike {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    return 'get' in value && typeof (value as { get?: unknown }).get === 'function';
}

/**
 * 将 gRPC metadata 转成适合记录日志的普通对象。
 */
export function serializeGrpcMetadata(metadata: unknown): Record<string, unknown> | undefined {
    if (!isGrpcMetadataLike(metadata)) {
        return undefined;
    }

    if (typeof metadata.getMap === 'function') {
        const rawMap = metadata.getMap();
        const normalizedMap: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rawMap)) {
            if (typeof value === 'string') {
                normalizedMap[key] = value;
            } else if (value instanceof Buffer) {
                normalizedMap[key] = value.toString('utf8');
            }
        }
        return normalizedMap;
    }

    return undefined;
}

/**
 * 从 metadata 中读取单个字符串值。
 */
export function getGrpcMetadataStringValue(metadata: unknown, key: string): string | undefined {
    if (!isGrpcMetadataLike(metadata)) {
        return undefined;
    }

    const values = metadata.get(key);
    if (values.length === 0) {
        return undefined;
    }

    const firstValue = values[0];
    if (typeof firstValue === 'string') {
        return firstValue;
    }
    if (firstValue instanceof Buffer) {
        return firstValue.toString('utf8');
    }

    return undefined;
}

/**
 * 从 gRPC 错误对象中优先读取 metadata，再回退到 details/message。
 */
export function parseGrpcErrorPayload(error: unknown): ShiroGrpcErrorPayload | null {
    if (typeof error !== 'object' || error === null) {
        return null;
    }

    const errorRecord = error as Record<string, unknown>;
    const metadata = errorRecord.metadata;
    if (isGrpcMetadataLike(metadata)) {
        const values = metadata.get(SHIRO_GRPC_ERROR_METADATA_KEY);
        if (values.length > 0) {
            const firstValue = values[0];
            if (typeof firstValue === 'string') {
                const payload = parseGrpcErrorPayloadText(firstValue);
                if (payload) {
                    return payload;
                }
            }

            if (firstValue instanceof Buffer) {
                const payload = parseGrpcErrorPayloadText(firstValue.toString('utf8'));
                if (payload) {
                    return payload;
                }
            }
        }
    }

    const details = errorRecord.details;
    if (typeof details === 'string' && details.startsWith('{')) {
        const payload = parseGrpcErrorPayloadText(details);
        if (payload) {
            return payload;
        }
    }

    const message = errorRecord.message;
    if (typeof message === 'string') {
        const firstJsonIndex = message.indexOf('{');
        if (firstJsonIndex >= 0) {
            return parseGrpcErrorPayloadText(message.slice(firstJsonIndex));
        }
    }

    return null;
}
