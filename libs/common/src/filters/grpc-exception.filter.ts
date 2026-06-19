import { ArgumentsHost, Catch } from '@nestjs/common';
import type { RpcExceptionFilter } from '@nestjs/common';
import { BaseRpcExceptionFilter, RpcException } from '@nestjs/microservices';
import { throwError } from 'rxjs';
import {
    buildGrpcErrorPayload,
    createGrpcErrorMetadata,
    getGrpcMetadataStringValue,
    serializeGrpcMetadata,
    SHIRO_GRPC_REQUEST_ID_METADATA_KEY,
    SHIRO_GRPC_SOURCE_APP_METADATA_KEY,
    SHIRO_GRPC_SOURCE_HANDLER_METADATA_KEY,
    SHIRO_GRPC_SOURCE_HTTP_METHOD_METADATA_KEY,
    SHIRO_GRPC_TARGET_METHOD_METADATA_KEY
} from '../grpc/grpc-error.helpers';
import { sanitizeForLogging } from '../logger/runtime-log.util';
import { getRequestContext } from '../logger/request-context';
import { writeSystemLog } from '../logger/runtime-logger';
import { normalizeExceptionToShiroErrorResponse } from './shiro-error-normalizer';

type GrpcServerCallLike = {
    getPath?: () => string;
    getPeer?: () => string;
};

/**
 * 从 gRPC path 中提取 service / method，便于写入结构化日志。
 */
function parseGrpcPath(path: string | undefined): { service?: string; method?: string } {
    if (!path) {
        return {};
    }

    const segments = path.split('/').filter((item) => item.length > 0);
    if (segments.length < 2) {
        return {};
    }

    const fullServiceName = segments[0];
    const method = segments[1];
    const serviceSegments = fullServiceName.split('.');
    const service = serviceSegments[serviceSegments.length - 1];

    return {
        service,
        method
    };
}

/**
 * 全局 gRPC 异常过滤器。
 * 作用是把项目内部的统一错误结构转换成 gRPC status + metadata。
 */
@Catch()
export class ShiroGrpcExceptionFilter extends BaseRpcExceptionFilter implements RpcExceptionFilter<unknown> {
    /**
     * 将 RPC 处理过程中的异常统一转换成 grpc-js 可识别的错误对象。
     */
    catch(exception: unknown, host: ArgumentsHost) {
        const normalizedTarget = exception instanceof RpcException ? (exception as RpcException).getError() : exception;
        const normalizedError = normalizeExceptionToShiroErrorResponse(normalizedTarget);
        const payload = buildGrpcErrorPayload(normalizedError);
        const requestBody = host.switchToRpc().getData();
        const requestMetadata = host.getArgByIndex(1);
        const serverCall = host.getArgByIndex(2) as GrpcServerCallLike | undefined;
        const grpcPath = typeof serverCall?.getPath === 'function' ? serverCall.getPath() : undefined;
        const grpcPeer = typeof serverCall?.getPeer === 'function' ? serverCall.getPeer() : undefined;
        const grpcPathInfo = parseGrpcPath(grpcPath);
        const requestId = getGrpcMetadataStringValue(requestMetadata, SHIRO_GRPC_REQUEST_ID_METADATA_KEY);
        const requestContext = getRequestContext();
        const actor = requestContext?.actor;
        const durationMs = requestContext?.startAt ? Date.now() - requestContext.startAt : undefined;
        const sourceApp = getGrpcMetadataStringValue(requestMetadata, SHIRO_GRPC_SOURCE_APP_METADATA_KEY);
        const sourceHttpMethod = getGrpcMetadataStringValue(
            requestMetadata,
            SHIRO_GRPC_SOURCE_HTTP_METHOD_METADATA_KEY
        );
        const sourceHandler = getGrpcMetadataStringValue(requestMetadata, SHIRO_GRPC_SOURCE_HANDLER_METADATA_KEY);
        const targetRpcMethod = getGrpcMetadataStringValue(requestMetadata, SHIRO_GRPC_TARGET_METHOD_METADATA_KEY);

        writeSystemLog({
            level: payload.httpStatus >= 500 ? 'error' : 'warn',
            module: 'grpc_exception_filter',
            userId: actor?.id ?? 'system',
            message: payload.message,
            event: 'grpc_exception',
            requestId: requestContext?.requestId ?? requestId,
            actor,
            rpc: {
                ...(requestContext?.rpc ?? {}),
                transport: 'grpc',
                service: grpcPathInfo.service ?? requestContext?.rpc?.service,
                method: grpcPathInfo.method ?? targetRpcMethod ?? requestContext?.rpc?.method,
                path: grpcPath ?? requestContext?.rpc?.path,
                peer: grpcPeer ?? requestContext?.rpc?.peer,
                requestMetadata: sanitizeForLogging(serializeGrpcMetadata(requestMetadata)),
                requestBody: sanitizeForLogging(requestBody),
                grpcStatus: payload.grpcStatus,
                durationMs
            },
            result: {
                success: false,
                message: payload.message
            },
            error:
                normalizedTarget instanceof Error
                    ? {
                          name: normalizedTarget.name,
                          code: payload.code,
                          message: payload.message,
                          stack: normalizedTarget.stack
                      }
                    : {
                          code: payload.code,
                          message: payload.message
                      },
            context: sanitizeForLogging({
                category: payload.category,
                httpStatus: payload.httpStatus,
                sourceApp,
                sourceHttpMethod,
                sourceHandler,
                targetRpcMethod,
                shiroGrpcError: payload
            }) as Record<string, unknown>
        });

        return throwError(() => ({
            code: payload.grpcStatus,
            details: payload.message,
            message: payload.message,
            metadata: createGrpcErrorMetadata(payload)
        }));
    }
}
