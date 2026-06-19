import { Metadata, status as GrpcStatus } from '@grpc/grpc-js';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { context as otelContext, SpanStatusCode, trace, type Span } from '@opentelemetry/api';
import { catchError, finalize, Observable, tap, throwError } from 'rxjs';
import {
    APP_USER_ADMIN_ACTOR_ID_METADATA_KEY,
    APP_USER_ADMIN_ACTOR_NAME_METADATA_KEY,
    APP_USER_ADMIN_REASON_METADATA_KEY,
    APP_USER_ADMIN_SCOPES_METADATA_KEY,
    getGrpcMetadataStringValue,
    serializeGrpcMetadata,
    SHIRO_GRPC_REQUEST_ID_METADATA_KEY,
    SHIRO_GRPC_SOURCE_APP_METADATA_KEY,
    SHIRO_GRPC_SOURCE_HANDLER_METADATA_KEY,
    SHIRO_GRPC_SOURCE_HTTP_METHOD_METADATA_KEY,
    SHIRO_GRPC_TARGET_METHOD_METADATA_KEY
} from '../grpc';
import { runWithRequestContext } from '../logger/request-context';
import type { RuntimeLogActor, RuntimeLogRecord, RuntimeRequestContext, RuntimeRpcSnapshot } from '../logger/runtime-log.types';
import { writeUserActionLog } from '../logger/runtime-logger';
import { createRequestId, normalizeModuleName, sanitizeForLogging } from '../logger/runtime-log.util';

type GrpcServerCallLike = {
    getPath?: () => string;
    getPeer?: () => string;
    sendMetadata?: (metadata: Metadata) => void;
};

type GrpcPathInfo = {
    service?: string;
    method?: string;
};

function parseGrpcPath(path: string | undefined): GrpcPathInfo {
    if (!path) {
        return {};
    }

    const segments = path.split('/').filter((item) => item.length > 0);
    if (segments.length < 2) {
        return {};
    }

    const serviceSegments = segments[0].split('.');
    return {
        service: serviceSegments[serviceSegments.length - 1],
        method: segments[1]
    };
}

function compactRecord(record: Record<string, unknown>): RuntimeLogRecord | undefined {
    const compacted: RuntimeLogRecord = {};
    for (const [key, value] of Object.entries(record)) {
        if (value !== undefined) {
            compacted[key] = value;
        }
    }
    return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function extractGrpcActor(metadata: unknown): RuntimeLogActor | undefined {
    const actorId = getGrpcMetadataStringValue(metadata, APP_USER_ADMIN_ACTOR_ID_METADATA_KEY);
    if (!actorId) {
        return undefined;
    }

    return {
        id: actorId,
        type: 'admin',
        name: getGrpcMetadataStringValue(metadata, APP_USER_ADMIN_ACTOR_NAME_METADATA_KEY)
    };
}

function sendRequestIdMetadata(serverCall: GrpcServerCallLike | undefined, requestId: string): void {
    if (typeof serverCall?.sendMetadata !== 'function') {
        return;
    }

    const metadata = new Metadata();
    metadata.set(SHIRO_GRPC_REQUEST_ID_METADATA_KEY, requestId);
    serverCall.sendMetadata(metadata);
}

@Injectable()
export class ShiroGrpcLogContextInterceptor implements NestInterceptor {
    private readonly tracer = trace.getTracer('shiro-nya.grpc');

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType<'rpc'>() !== 'rpc') {
            return next.handle();
        }

        const startedAt = Date.now();
        const className = context.getClass().name;
        const handlerName = context.getHandler().name;
        const controllerHandler = `${className}.${handlerName}`;
        const moduleName = normalizeModuleName(className);
        const requestBody = context.switchToRpc().getData();
        const requestMetadata = context.getArgByIndex(1);
        const serverCall = context.getArgByIndex(2) as GrpcServerCallLike | undefined;
        const grpcPath = typeof serverCall?.getPath === 'function' ? serverCall.getPath() : undefined;
        const grpcPeer = typeof serverCall?.getPeer === 'function' ? serverCall.getPeer() : undefined;
        const grpcPathInfo = parseGrpcPath(grpcPath);
        const requestId = createRequestId(getGrpcMetadataStringValue(requestMetadata, SHIRO_GRPC_REQUEST_ID_METADATA_KEY));
        const actor = extractGrpcActor(requestMetadata);
        const requestMetadataSnapshot = sanitizeForLogging(serializeGrpcMetadata(requestMetadata));
        const sourceApp = getGrpcMetadataStringValue(requestMetadata, SHIRO_GRPC_SOURCE_APP_METADATA_KEY);
        const sourceHttpMethod = getGrpcMetadataStringValue(requestMetadata, SHIRO_GRPC_SOURCE_HTTP_METHOD_METADATA_KEY);
        const sourceHandler = getGrpcMetadataStringValue(requestMetadata, SHIRO_GRPC_SOURCE_HANDLER_METADATA_KEY);
        const targetRpcMethod = getGrpcMetadataStringValue(requestMetadata, SHIRO_GRPC_TARGET_METHOD_METADATA_KEY);
        const controlPlaneScopes = getGrpcMetadataStringValue(requestMetadata, APP_USER_ADMIN_SCOPES_METADATA_KEY);
        const operationReason = getGrpcMetadataStringValue(requestMetadata, APP_USER_ADMIN_REASON_METADATA_KEY);
        const methodName = grpcPathInfo.method ?? targetRpcMethod ?? handlerName;
        const serviceName = grpcPathInfo.service;

        const baseRpc: RuntimeRpcSnapshot = {
            transport: 'grpc',
            service: serviceName,
            method: methodName,
            path: grpcPath,
            peer: grpcPeer,
            requestMetadata: requestMetadataSnapshot,
            requestBody: sanitizeForLogging(requestBody)
        };
        const requestContext: RuntimeRequestContext = {
            requestId,
            startAt: startedAt,
            module: moduleName,
            controllerHandler,
            actor,
            rpc: baseRpc,
            extra: compactRecord({
                sourceApp,
                sourceHttpMethod,
                sourceHandler,
                targetRpcMethod,
                controlPlaneScopes,
                operationReason
            })
        };

        sendRequestIdMetadata(serverCall, requestId);
        attachGrpcAttributesToActiveSpan({
            moduleName,
            controllerHandler,
            requestId,
            actor,
            serviceName,
            methodName,
            path: grpcPath,
            peer: grpcPeer
        });

        const span = this.tracer.startSpan(controllerHandler, {
            attributes: {
                'code.namespace': className,
                'code.function': handlerName,
                'rpc.system': 'grpc',
                ...(serviceName ? { 'rpc.service': serviceName } : {}),
                ...(methodName ? { 'rpc.method': methodName } : {}),
                ...(grpcPath ? { 'rpc.grpc.path': grpcPath } : {}),
                ...(grpcPeer ? { 'rpc.peer': grpcPeer } : {}),
                'shiro.module': moduleName,
                'shiro.controller_handler': controllerHandler,
                'request.id': requestId,
                'shiro.request_id': requestId,
                ...(actor?.id
                    ? {
                          'enduser.id': actor.id,
                          'user.id': actor.id,
                          'shiro.user_id': actor.id
                      }
                    : {})
            }
        });
        const activeContext = trace.setSpan(otelContext.active(), span);

        return new Observable((subscriber) =>
            otelContext.with(activeContext, () =>
                runWithRequestContext(requestContext, () => {
                    try {
                        let successLogged = false;
                        return next
                            .handle()
                            .pipe(
                                tap({
                                    next: () => {
                                        if (successLogged) {
                                            return;
                                        }
                                        successLogged = true;
                                        const finalRpc: RuntimeRpcSnapshot = {
                                            ...baseRpc,
                                            grpcStatus: GrpcStatus.OK,
                                            durationMs: Date.now() - startedAt
                                        };
                                        requestContext.rpc = finalRpc;
                                        writeUserActionLog({
                                            level: 'info',
                                            module: moduleName,
                                            userId: actor?.id,
                                            message: `[完成 OK] ${serviceName ? `${serviceName}.` : ''}${methodName}`,
                                            event: 'grpc_response',
                                            requestId,
                                            actor,
                                            rpc: finalRpc,
                                            result: {
                                                success: true
                                            },
                                            context: compactRecord({
                                                sourceApp,
                                                sourceHttpMethod,
                                                sourceHandler,
                                                targetRpcMethod,
                                                controlPlaneScopes,
                                                operationReason
                                            })
                                        });
                                    }
                                }),
                                catchError((error: unknown) => {
                                    recordSpanException(span, error);
                                    return throwError(() => error);
                                }),
                                finalize(() => span.end())
                            )
                            .subscribe(subscriber);
                    } catch (error) {
                        recordSpanException(span, error);
                        span.end();
                        subscriber.error(error);
                        return undefined;
                    }
                })
            )
        );
    }
}

function attachGrpcAttributesToActiveSpan(input: {
    moduleName: string;
    controllerHandler: string;
    requestId: string;
    actor?: RuntimeLogActor;
    serviceName?: string;
    methodName?: string;
    path?: string;
    peer?: string;
}): void {
    const span = trace.getActiveSpan();
    if (!span) {
        return;
    }

    span.setAttributes({
        'rpc.system': 'grpc',
        'shiro.module': input.moduleName,
        'shiro.controller_handler': input.controllerHandler,
        'request.id': input.requestId,
        'shiro.request_id': input.requestId,
        ...(input.serviceName ? { 'rpc.service': input.serviceName } : {}),
        ...(input.methodName ? { 'rpc.method': input.methodName } : {}),
        ...(input.path ? { 'rpc.grpc.path': input.path } : {}),
        ...(input.peer ? { 'rpc.peer': input.peer } : {}),
        ...(input.actor?.id
            ? {
                  'enduser.id': input.actor.id,
                  'user.id': input.actor.id,
                  'shiro.user_id': input.actor.id
              }
            : {})
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
