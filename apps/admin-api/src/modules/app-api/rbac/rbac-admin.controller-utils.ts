import type { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { BetterAuthSession } from '../../better-auth/better-auth-session.type';

export type ShiroRequest = Request & {
    __shiroLogContext?: {
        requestId?: string;
    };
};

export function getRequestId(request: ShiroRequest): string | undefined {
    return request.__shiroLogContext?.requestId;
}

export function getActor(session: BetterAuthSession) {
    return {
        id: session.user.id,
        name: session.user.name || session.user.username || session.user.email
    };
}

export const PositiveIntPipe = new ZodValidationPipe(z.coerce.number().int().positive());
