import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SpiceDbGuard } from '../src/guard.js';

function createGuard(metadata: unknown, spiceDbService: Record<string, any>) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(metadata),
    get: vi.fn(),
  };

  return new SpiceDbGuard(reflector as any, spiceDbService as any, { defaultGuardBehavior: 'throw' } as any);
}

function createContext(): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({}),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

const baseMetadata = {
  resourceType: 'document',
  resourceId: 'doc-1',
  subject: {
    type: 'user',
    id: 'alice',
  },
};

describe('SpiceDbGuard', () => {
  it('should use native bulk checks for multiple permissions', async () => {
    const spiceDbService = {
      checkPermission: vi.fn(),
      checkBulkPermissions: vi.fn().mockResolvedValue({
        results: [{ allowed: true }, { allowed: true }],
      }),
    };
    const guard = createGuard(
      {
        ...baseMetadata,
        permissions: ['view', 'edit'],
        mode: 'AND',
      },
      spiceDbService
    );

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
    expect(spiceDbService.checkPermission).not.toHaveBeenCalled();
    expect(spiceDbService.checkBulkPermissions).toHaveBeenCalledTimes(1);
  });

  it('should deny empty permission metadata', async () => {
    const spiceDbService = {
      checkPermission: vi.fn(),
      checkBulkPermissions: vi.fn(),
    };
    const guard = createGuard(
      {
        ...baseMetadata,
        permissions: [],
      },
      spiceDbService
    );

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(ForbiddenException);
    expect(spiceDbService.checkPermission).not.toHaveBeenCalled();
    expect(spiceDbService.checkBulkPermissions).not.toHaveBeenCalled();
  });

  it('should deny partially invalid permission metadata', async () => {
    const spiceDbService = {
      checkPermission: vi.fn(),
      checkBulkPermissions: vi.fn(),
    };
    const guard = createGuard(
      {
        ...baseMetadata,
        permissions: ['view', ''],
        mode: 'AND',
      },
      spiceDbService
    );

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(ForbiddenException);
    expect(spiceDbService.checkPermission).not.toHaveBeenCalled();
    expect(spiceDbService.checkBulkPermissions).not.toHaveBeenCalled();
  });

  it('should deny bulk result count mismatch', async () => {
    const spiceDbService = {
      checkPermission: vi.fn(),
      checkBulkPermissions: vi.fn().mockResolvedValue({
        results: [],
      }),
    };
    const guard = createGuard(
      {
        ...baseMetadata,
        permissions: ['view', 'edit'],
        mode: 'AND',
      },
      spiceDbService
    );

    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
