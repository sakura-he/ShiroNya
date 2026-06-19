import type { Request, Response } from 'express';
import { normalizeCreatedStatusToOkMiddleware } from './http-status.middleware';

function createMockResponse(initialStatusCode = 200) {
    const calls: unknown[][] = [];
    const response = {
        statusCode: initialStatusCode,
        status(statusCode: number) {
            this.statusCode = statusCode;
            return this;
        },
        writeHead(statusCode: number, ...args: unknown[]) {
            calls.push([statusCode, ...args]);
            this.statusCode = statusCode;
            return this;
        }
    } as unknown as Response & { statusCode: number };

    return { response, calls };
}

describe('normalizeCreatedStatusToOkMiddleware', () => {
    it('将 Express status(201) 转换成 status(200)', () => {
        const { response } = createMockResponse();
        const next = jest.fn();

        normalizeCreatedStatusToOkMiddleware({} as Request, response, next);
        response.status(201);

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.statusCode).toBe(200);
    });

    it('将显式写出的 201 响应转换成 200', () => {
        const { response, calls } = createMockResponse(201);
        const next = jest.fn();

        normalizeCreatedStatusToOkMiddleware({} as Request, response, next);
        response.writeHead(201, { 'x-test': '1' });

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.statusCode).toBe(200);
        expect(calls).toEqual([[200, { 'x-test': '1' }]]);
    });

    it('当响应对象已经被设置为 201 时，也会在写 header 前转成 200', () => {
        const { response, calls } = createMockResponse(201);
        const next = jest.fn();

        normalizeCreatedStatusToOkMiddleware({} as Request, response, next);
        response.writeHead(200);

        expect(response.statusCode).toBe(200);
        expect(calls).toEqual([[200]]);
    });

    it('保持非 201 响应状态不变', () => {
        const { response, calls } = createMockResponse(204);
        const next = jest.fn();

        normalizeCreatedStatusToOkMiddleware({} as Request, response, next);
        response.writeHead(204);

        expect(response.statusCode).toBe(204);
        expect(calls).toEqual([[204]]);
    });
});
