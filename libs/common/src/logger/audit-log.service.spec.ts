import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AuditLogService } from './audit-log.service';
import type { AuditLogWriteInput } from './runtime-log.types';

const baseAuditInput: AuditLogWriteInput = {
    app: 'jest-app',
    module: 'auth',
    action: 'login',
    summary: '用户登录',
    resourceType: 'account',
    requestId: 'req-audit-1',
    actorId: 'user-1',
    actorType: 'user',
    result: 'SUCCESS'
};

describe('AuditLogService', () => {
    let originalAppName: string | undefined;
    let originalNodeEnv: string | undefined;
    let originalLogDir: string | undefined;

    beforeEach(() => {
        originalAppName = process.env.SHIRO_APP_NAME;
        originalNodeEnv = process.env.NODE_ENV;
        originalLogDir = process.env.LOKI_LOG_DIR;
        process.env.SHIRO_APP_NAME = 'jest-audit-service';
        process.env.NODE_ENV = 'development';
        process.env.LOKI_LOG_DIR = mkdtempSync(path.join(os.tmpdir(), 'shiro-audit-service-'));
        jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
        jest.spyOn(console._stdout, 'write').mockImplementation(() => true);
        jest.spyOn(console._stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        process.env.SHIRO_APP_NAME = originalAppName;
        process.env.NODE_ENV = originalNodeEnv;
        process.env.LOKI_LOG_DIR = originalLogDir;
        jest.restoreAllMocks();
    });

    it('returns persisted=true after audit row is inserted', async () => {
        const create = jest.fn().mockResolvedValue({});
        const service = new AuditLogService({ auditLog: { create } } as any);

        const result = await service.writeAuditLog(baseAuditInput);

        expect(result).toEqual({ persisted: true });
        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    app: 'jest-app',
                    module: 'auth',
                    action: 'login',
                    requestId: 'req-audit-1',
                    actorId: 'user-1'
                })
            })
        );
    });

    it('returns structured error when audit persistence fails', async () => {
        const persistenceError = Object.assign(new Error('database unavailable'), { code: 'P1001' });
        const create = jest.fn().mockRejectedValue(persistenceError);
        const service = new AuditLogService({ auditLog: { create } } as any);

        const result = await service.writeAuditLog(baseAuditInput);

        expect(result.persisted).toBe(false);
        expect(result.error).toEqual(
            expect.objectContaining({
                name: 'Error',
                code: 'P1001',
                message: 'database unavailable',
                stack: expect.stringContaining('database unavailable')
            })
        );
        expect(create).toHaveBeenCalledTimes(1);
    });
});
