import { HttpStatus } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const CREATED_STATUS_NORMALIZER_BOUND = Symbol('shiro.created-status-normalizer-bound');

type NormalizedResponse = Response & {
    [CREATED_STATUS_NORMALIZER_BOUND]?: boolean;
};

/**
 * NestJS defaults POST handlers to 201. Shiro APIs use the response body code for
 * business success, so successful Created responses are normalized to HTTP 200.
 */
export function normalizeCreatedStatusToOkMiddleware(_request: Request, response: Response, next: NextFunction): void {
    const normalizedResponse = response as NormalizedResponse;
    if (normalizedResponse[CREATED_STATUS_NORMALIZER_BOUND]) {
        next();
        return;
    }

    normalizedResponse[CREATED_STATUS_NORMALIZER_BOUND] = true;
    const originalStatus = typeof response.status === 'function' ? response.status.bind(response) : undefined;
    const originalWriteHead = response.writeHead.bind(response);

    if (originalStatus) {
        response.status = ((statusCode: number) =>
            originalStatus(
                Number(statusCode) === HttpStatus.CREATED ? HttpStatus.OK : statusCode
            )) as Response['status'];
    }

    response.writeHead = ((statusCode: number, ...args: unknown[]) => {
        const normalizedStatusCode = Number(statusCode) === HttpStatus.CREATED ? HttpStatus.OK : statusCode;
        if (response.statusCode === HttpStatus.CREATED) {
            response.statusCode = HttpStatus.OK;
        }

        return originalWriteHead(normalizedStatusCode, ...(args as any[]));
    }) as Response['writeHead'];

    next();
}
