import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { Prisma } from '../generated/client';

const prismaTracer = trace.getTracer('admin-api.prisma');

function normalizePrismaModelName(model: string | undefined): string | undefined {
    if (!model) {
        return undefined;
    }

    return `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
}

function buildPrismaSpanName(model: string | undefined, operation: string): string {
    const normalizedModel = normalizePrismaModelName(model);
    return normalizedModel ? `prisma.${normalizedModel}.${operation}` : `prisma.${operation}`;
}

export const prismaQueryTracingExtension = Prisma.defineExtension({
    name: 'prismaQueryTracing',
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }: any) {
                const normalizedModel = normalizePrismaModelName(model);
                const spanName = buildPrismaSpanName(model, operation);

                return await prismaTracer.startActiveSpan(
                    spanName,
                    {
                        kind: SpanKind.CLIENT,
                        attributes: {
                            'db.system': 'postgresql',
                            'db.operation.name': operation,
                            'db.prisma.model': normalizedModel ?? model,
                            'db.prisma.operation': operation,
                            'prisma.model': normalizedModel ?? model,
                            'prisma.operation': operation
                        }
                    },
                    async (span) => {
                        try {
                            return await query(args);
                        } catch (error) {
                            span.recordException(error as Error);
                            span.setStatus({
                                code: SpanStatusCode.ERROR,
                                message: error instanceof Error ? error.message : String(error)
                            });
                            throw error;
                        } finally {
                            span.end();
                        }
                    }
                );
            }
        }
    }
});
