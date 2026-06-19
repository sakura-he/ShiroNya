import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { map, Observable, tap } from 'rxjs';
import { ErrorCodes } from '../constants/error-code.constant';
import { createRuntimeLogger } from '../logger/runtime-logger';

const responseFormatLogger = createRuntimeLogger('response_format_interceptor');

@Injectable()
export class ResponseFormatInterceptor implements NestInterceptor {
    /** 统一包装响应体，并输出响应格式化阶段的调试日志 */
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const now = Date.now();
        const request = context.switchToHttp().getRequest<Request>();

        return next.handle().pipe(
            map((data) => {
                return {
                    data: data === undefined ? null : data,
                    code: ErrorCodes.SUCCESS.code,
                    message: ErrorCodes.SUCCESS.message
                };
            }),
            tap(() => {
                // responseFormatLogger.debug('响应格式化完成', {
                //     method: request.method,
                //     path: request.url,
                //     durationMs: Date.now() - now
                // });
            })
        );
    }
}
