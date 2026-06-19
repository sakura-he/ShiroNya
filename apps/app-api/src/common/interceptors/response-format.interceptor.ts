import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, map, mergeMap, Observable } from 'rxjs';
import { ErrorCodes } from '@app/common';
import { AdminUserStateService } from '../../modules/user-state/admin-user-state.service';
import type { BetterAuthSession } from '../../modules/better-auth/better-auth-session.type';
import {
    buildSpiceDbDebugPayload,
    collectCurrentSpiceDbDebugTraces,
    collectSpiceDbDebugTraces,
    runWithSpiceDbDebugTraceStore
} from '../../modules/spicedb/spicedb-debug-trace';
import { isAdminApiDevtoolsDebugEnabled } from '../utils/admin-devtools-debug';

const ADMIN_DEVTOOLS_REQUEST_HEADER = 'x-app-api-devtools';
const ADMIN_DEVTOOLS_ENABLED_HEADER = 'x-app-api-devtools-enabled';

@Injectable()
export class ResponseFormatInterceptor implements NestInterceptor {
    constructor(private readonly adminUserStateService: AdminUserStateService) {}

    /** 统一包装响应体，并附带用户状态版本响应头 */
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest<Request & { session?: BetterAuthSession }>();
        const response = context.switchToHttp().getResponse<Response>();
        if (request.path === '/metrics' || request.path === '/app/metrics') {
            // Prometheus 指标必须保持原始 text/plain 响应，不能被统一 JSON 包装。
            return next.handle();
        }
        this.attachDevtoolsModeHeader(response);

        const buildResponse$ = () => next.handle().pipe(
            mergeMap((res) =>
                from(this.adminUserStateService.attachUserStateHeaders(request, response)).pipe(map(() => res))
            ),
            map((res) => {
                const debug = this.buildDebugPayload(request, res);
                // 将业务数据统一包装为 { data, code, message } 格式
                return {
                    data: res === undefined ? null : res,
                    code: ErrorCodes.SUCCESS.code,
                    message: ErrorCodes.SUCCESS.message,
                    ...(debug ? { debug } : {})
                };
            })
        );

        if (!this.isDevtoolsRequestEnabled(request)) {
            return buildResponse$();
        }

        return new Observable((subscriber) =>
            runWithSpiceDbDebugTraceStore(() => buildResponse$().subscribe(subscriber))
        );
    }

    private buildDebugPayload(request: Request & { session?: BetterAuthSession }, res: unknown) {
        if (!this.isDevtoolsDebugAllowed()) {
            return undefined;
        }

        if (!this.isDevtoolsRequestEnabled(request)) {
            return undefined;
        }

        const spiceDb = buildSpiceDbDebugPayload([
            ...collectCurrentSpiceDbDebugTraces(),
            ...collectSpiceDbDebugTraces(res)
        ]);
        const requestId = (request as { __shiroLogContext?: { requestId?: string } }).__shiroLogContext?.requestId;
        return {
            ...(requestId ? { requestId } : {}),
            http: {
                serverDurationMs: this.resolveServerDurationMs(request)
            },
            ...(spiceDb ? { spicedb: spiceDb } : {})
        };
    }

    private resolveServerDurationMs(request: Request): number {
        const startAt = (request as { __shiroLogContext?: { startAt?: number } }).__shiroLogContext?.startAt;
        if (!startAt) {
            return 0;
        }

        return Date.now() - startAt;
    }

    private attachDevtoolsModeHeader(response: Response): void {
        response.setHeader?.(ADMIN_DEVTOOLS_ENABLED_HEADER, this.isDevtoolsDebugAllowed() ? '1' : '0');
    }

    private isDevtoolsDebugAllowed(): boolean {
        return isAdminApiDevtoolsDebugEnabled();
    }

    private isDevtoolsRequestEnabled(request: Request): boolean {
        if (!this.isDevtoolsDebugAllowed()) {
            return false;
        }

        const devtoolsHeader = request.headers[ADMIN_DEVTOOLS_REQUEST_HEADER];
        return Array.isArray(devtoolsHeader) ? devtoolsHeader.includes('1') : devtoolsHeader === '1';
    }
}
