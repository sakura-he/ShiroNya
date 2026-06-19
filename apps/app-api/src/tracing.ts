/**
 * OpenTelemetry 链路追踪初始化
 *
 * 重要：本文件必须在 main.ts 的最顶部以 `import './tracing'` 形式被引入，
 * 必须早于 NestFactory.create 之前执行；否则部分 instrumentation 将无法注入到底层模块。
 *
 * 通过环境变量控制是否启用：
 * - OTEL_SDK_DISABLED=true 时直接跳过初始化（默认开启）
 * - OTEL_EXPORTER_OTLP_ENDPOINT 配置 OTLP 接收端（如 SigNoz/Jaeger 的 4318 端口）
 * - OTEL_SERVICE_NAME 配置服务名（默认 app-api）
 */

import { createRuntimeLogger } from '@app/common';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { B3InjectEncoding, B3Propagator } from '@opentelemetry/propagator-b3';
import { JaegerPropagator } from '@opentelemetry/propagator-jaeger';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

process.env.SHIRO_APP_NAME ||= 'app-api';
if (!process.env.OTEL_SERVICE_NAME || process.env.OTEL_SERVICE_NAME === 'admin-api') {
    process.env.OTEL_SERVICE_NAME = 'app-api';
}

const sdkDisabled = (process.env.OTEL_SDK_DISABLED ?? '').toLowerCase() === 'true';

if (!sdkDisabled) {
    const tracingLogger = createRuntimeLogger('app_otel_tracing');
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
    const tracesEndpoint =
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || `${otlpEndpoint.replace(/\/$/, '')}/v1/traces`;
    const serviceName = process.env.OTEL_SERVICE_NAME || 'app-api';

    const sdk = new NodeSDK({
        serviceName,
        contextManager: new AsyncLocalStorageContextManager(),
        spanProcessors: [
            new BatchSpanProcessor(
                new OTLPTraceExporter({
                    url: tracesEndpoint
                })
            )
        ],
        textMapPropagator: new CompositePropagator({
            propagators: [
                new W3CTraceContextPropagator(),
                new W3CBaggagePropagator(),
                new JaegerPropagator(),
                new B3Propagator(),
                new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER })
            ]
        }),
        instrumentations: [
            getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-fs': { enabled: false },
                '@opentelemetry/instrumentation-net': { enabled: false },
                '@opentelemetry/instrumentation-dns': { enabled: false },
                '@opentelemetry/instrumentation-http': {
                    ignoreIncomingRequestHook: (req) => {
                        const url = req.url ?? '';
                        return (
                            url.startsWith('/health') ||
                            url.startsWith('/metrics') ||
                            url.startsWith('/app/health') ||
                            url.startsWith('/app/api-docs') ||
                            url === '/favicon.ico'
                        );
                    }
                }
            })
        ]
    });

    try {
        sdk.start();
        tracingLogger.info.title(`[otel] tracing started: service=${serviceName}, endpoint=${tracesEndpoint}`);
    } catch (err) {
        tracingLogger.error('[otel] failed to start tracing SDK', { error: err });
    }

    process.on('SIGTERM', () => {
        sdk.shutdown()
            .then(() => {
                tracingLogger.info.title('[otel] tracing SDK shut down');
            })
            .catch((err) => {
                tracingLogger.error('[otel] error shutting down tracing SDK', { error: err });
            });
    });
}
