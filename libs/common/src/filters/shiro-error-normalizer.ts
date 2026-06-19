import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCodes } from '../constants/error-code.constant';
import { BusinessException } from '../exceptions/biz.exception';
import { UnauthException } from '../exceptions/unauth.exception';
import type { ShiroErrorResponse } from './types';

export type ShiroNormalizedErrorCategory = 'business' | 'unauth' | 'http' | 'internal';

export type ShiroNormalizedException = {
    category: ShiroNormalizedErrorCategory;
    statusCode: number;
    body: ShiroErrorResponse;
};

type PrismaKnownRequestErrorLike = Error & {
    code: string;
    meta?: unknown;
};

/**
 * 识别 Prisma 已知请求错误，避免把数据库错误全部吞成未知异常。
 */
function isPrismaKnownRequestError(exception: unknown): exception is PrismaKnownRequestErrorLike {
    if (!(exception instanceof Error)) {
        return false;
    }

    if (exception.name !== 'PrismaClientKnownRequestError') {
        return false;
    }

    return 'code' in exception && typeof (exception as { code?: unknown }).code === 'string';
}

/**
 * 从 HttpException 响应对象中提取统一的 code / message / data。
 */
function buildHttpExceptionBody(
    statusCode: number,
    exceptionResponse: unknown,
    fallbackMessage: string
): ShiroErrorResponse {
    let code = statusCode;
    let message = fallbackMessage;
    let data: unknown = null;

    if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseRecord = exceptionResponse as Record<string, unknown>;
        const rawCode = responseRecord.code;
        const rawMessage = responseRecord.message;
        const rawData = responseRecord.data;

        if (typeof rawCode === 'number') {
            code = rawCode;
        }

        if (typeof rawMessage === 'string' && rawMessage.length > 0) {
            message = rawMessage;
        } else if (Array.isArray(rawMessage) && rawMessage.length > 0) {
            message = rawMessage.map((item) => String(item)).join(', ');
        }

        if (rawData !== undefined) {
            data = rawData;
        }
    }

    return {
        data,
        code,
        message
    };
}

/**
 * 将 Prisma 错误转换成和 HTTP 错误风格一致的统一响应体。
 */
function buildPrismaExceptionResult(exception: PrismaKnownRequestErrorLike): ShiroNormalizedException {
    if (exception.code === 'P2002') {
        return {
            category: 'http',
            statusCode: HttpStatus.CONFLICT,
            body: {
                data: {
                    prismaCode: exception.code
                },
                code: ErrorCodes.DATABASE.CONFLICT.code,
                message: ErrorCodes.DATABASE.CONFLICT.message
            }
        };
    }

    if (exception.code === 'P2025') {
        return {
            category: 'http',
            statusCode: HttpStatus.NOT_FOUND,
            body: {
                data: {
                    prismaCode: exception.code
                },
                code: ErrorCodes.DATABASE.NOT_FOUND.code,
                message: ErrorCodes.DATABASE.NOT_FOUND.message
            }
        };
    }

    return {
        category: 'http',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        body: {
            data: {
                prismaCode: exception.code
            },
            code: ErrorCodes.DATABASE.ERROR.code,
            message: ErrorCodes.DATABASE.ERROR.message
        }
    };
}

/**
 * 将异常统一归一化成 Shiro 项目内部通用的错误结构。
 */
export function normalizeExceptionToShiroErrorResponse(exception: unknown): ShiroNormalizedException {
    if (exception instanceof BusinessException) {
        return {
            category: 'business',
            statusCode: exception.getStatus(),
            body: {
                data: null,
                code: exception.bizCode,
                message: exception.bizMessage
            }
        };
    }

    if (exception instanceof UnauthException) {
        return {
            category: 'unauth',
            statusCode: HttpStatus.UNAUTHORIZED,
            body: {
                data: null,
                code: exception.bizCode,
                message: exception.bizMessage
            }
        };
    }

    if (exception instanceof HttpException) {
        const statusCode = exception.getStatus();
        return {
            category: 'http',
            statusCode,
            body: buildHttpExceptionBody(statusCode, exception.getResponse(), exception.message)
        };
    }

    if (isPrismaKnownRequestError(exception)) {
        return buildPrismaExceptionResult(exception);
    }

    if (exception instanceof Error) {
        const message =
            exception.message.length > 0
                ? `${ErrorCodes.DEFAULT.message}: ${exception.message}`
                : ErrorCodes.DEFAULT.message;

        return {
            category: 'internal',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            body: {
                data: null,
                code: ErrorCodes.DEFAULT.code,
                message
            }
        };
    }

    return {
        category: 'internal',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        body: {
            data: null,
            code: ErrorCodes.DEFAULT.code,
            message: ErrorCodes.DEFAULT.message
        }
    };
}
