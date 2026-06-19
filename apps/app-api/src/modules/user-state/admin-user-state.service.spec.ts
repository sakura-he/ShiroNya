import {
    APP_API_MENU_VERSION_REDIS_KEY,
    APP_API_ROLE_VERSION_REDIS_KEY_PREFIX,
    APP_API_USER_STATE_REDIS_KEY_PREFIX,
    createAppApiRoleVersionDbName,
    createAppApiRoleVersionRedisKey,
    createAppApiUserVersionRedisKey
} from '@app/common/constants';
import { PrismaService } from '@app/prisma-app';
import { StateVersionType } from '@app/prisma-app/generated/client';
import { RedisToken } from '@nestjs-redis/client';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';
import fc from 'fast-check';
import { AdminUserStateService } from './admin-user-state.service';

jest.mock('@app/common', () => ({
    createRuntimeLogger: () => ({
        info: Object.assign(jest.fn(), { title: jest.fn() }),
        debug: Object.assign(jest.fn(), { title: jest.fn() }),
        verbose: Object.assign(jest.fn(), { title: jest.fn() }),
        warn: Object.assign(jest.fn(), { title: jest.fn() }),
        error: Object.assign(jest.fn(), { title: jest.fn() }),
        system: jest.fn(),
        userAction: jest.fn(),
        audit: jest.fn()
    })
}));

type AppStateRecord = {
    type: StateVersionType;
    name: string;
    version: string;
};

type PrismaMockShape = {
    stateVersion: {
        findUnique: jest.Mock;
        create: jest.Mock;
        upsert: jest.Mock;
    };
};

type RedisMockShape = {
    get: jest.Mock;
    set: jest.Mock;
};

type PrismaFixture = {
    mock: PrismaMockShape;
    state: Map<string, string>;
};

type RedisFixture = {
    mock: RedisMockShape;
    state: Map<string, string>;
};

type ServiceFixture = {
    moduleRef: TestingModule;
    service: AdminUserStateService;
    prisma: PrismaFixture;
    redis?: RedisFixture;
};

type SessionRole = {
    id: number;
    name: string;
};

type ResponseCollector = {
    response: Response;
    headers: Map<string, string>;
    setHeader: jest.Mock;
};

const REDIS_PROVIDER_TOKEN = RedisToken('DEFAULT_REDIS');
const HEADER_VERSION = 'x-user-state-version';
const HEADER_CHANGED = 'x-user-state-changed';
const ADMIN_PREFIX = APP_API_USER_STATE_REDIS_KEY_PREFIX;
const MENU_CACHE_KEY = APP_API_MENU_VERSION_REDIS_KEY;
const ROLE_CACHE_KEY_PREFIX = APP_API_ROLE_VERSION_REDIS_KEY_PREFIX;

const userIdArbitrary = fc.stringMatching(/^[a-zA-Z0-9_-]{1,24}$/);
const roleIdArbitrary = fc.integer({ min: 1, max: 100_000 });
const roleNameArbitrary = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,15}$/);
const roleArbitrary = fc.record({
    id: roleIdArbitrary
});
const sessionRoleArbitrary = fc.record({
    id: roleIdArbitrary,
    name: roleNameArbitrary
});
const roleListArbitrary = fc.uniqueArray(roleArbitrary, {
    selector: (role) => role.id,
    minLength: 1,
    maxLength: 5
});
const shuffledRoleListArbitrary = fc.uniqueArray(roleArbitrary, {
    selector: (role) => role.id,
    minLength: 2,
    maxLength: 5
});
const validSessionArbitrary = fc.record({
    userId: userIdArbitrary,
    roles: fc.uniqueArray(sessionRoleArbitrary, {
        selector: (role) => role.id,
        minLength: 1,
        maxLength: 4
    })
});
const differentRoleSetsArbitrary = roleListArbitrary.chain((rolesA) =>
    roleArbitrary
        .filter((role) => rolesA.every((current) => current.id !== role.id))
        .map((extraRole) => ({
            rolesA,
            rolesB: [...rolesA, extraRole]
        }))
);

afterEach(() => {
    jest.clearAllMocks();
});

/**
 * 组装 Prisma 持久化记录的内存索引键。
 */
function buildStateRecordKey(type: StateVersionType, name: string): string {
    return `${type}:${name}`;
}

/**
 * 组装 admin 角色状态版本的稳定 DB name。
 */
function buildRoleDbName(roleId: number): string {
    return createAppApiRoleVersionDbName(roleId);
}

/**
 * 创建带内存状态的 PrismaService mock，用于模拟角色和菜单版本持久化。
 */
function createPrismaMock(initialRecords: AppStateRecord[] = []): PrismaFixture {
    const state = new Map<string, string>(
        initialRecords.map((record) => [buildStateRecordKey(record.type, record.name), record.version])
    );

    const mock: PrismaMockShape = {
        stateVersion: {
            findUnique: jest.fn(async (args: any) => {
                const stateKey = buildStateRecordKey(args.where.type_name.type, args.where.type_name.name);
                const version = state.get(stateKey);
                return version ? { version } : null;
            }),
            create: jest.fn(async (args: any) => {
                const { type, name, version } = args.data;
                state.set(buildStateRecordKey(type, name), version);
                return args.data;
            }),
            upsert: jest.fn(async (args: any) => {
                const stateKey = buildStateRecordKey(args.where.type_name.type, args.where.type_name.name);

                if (state.has(stateKey)) {
                    state.set(stateKey, args.update.version);
                    return {
                        type: args.where.type_name.type,
                        name: args.where.type_name.name,
                        version: args.update.version
                    };
                }

                state.set(stateKey, args.create.version);
                return args.create;
            })
        }
    };

    return {
        mock,
        state
    };
}

/**
 * 创建带内存状态的 Redis mock，用于模拟缓存命中与回填。
 */
function createRedisMock(initialEntries: Record<string, string> = {}): RedisFixture {
    const state = new Map<string, string>(Object.entries(initialEntries));

    const mock: RedisMockShape = {
        get: jest.fn(async (key: string) => state.get(key) ?? null),
        set: jest.fn(async (key: string, value: string) => {
            state.set(key, value);
            return 'OK';
        })
    };

    return {
        mock,
        state
    };
}

/**
 * 通过 NestJS 测试模块创建带依赖 mock 的 AdminUserStateService。
 */
async function createServiceFixture(options?: {
    initialDbRecords?: AppStateRecord[];
    initialRedisEntries?: Record<string, string>;
    enableRedis?: boolean;
}): Promise<ServiceFixture> {
    const prisma = createPrismaMock(options?.initialDbRecords);
    const redis = options?.enableRedis === false ? undefined : createRedisMock(options?.initialRedisEntries);

    const providers: any[] = [
        AdminUserStateService,
        {
            provide: PrismaService,
            useValue: prisma.mock
        }
    ];

    if (redis) {
        providers.push({
            provide: REDIS_PROVIDER_TOKEN,
            useValue: redis.mock
        });
    }

    const moduleRef = await Test.createTestingModule({
        providers
    }).compile();

    return {
        moduleRef,
        service: moduleRef.get(AdminUserStateService),
        prisma,
        redis
    };
}

/**
 * 构造带 BetterAuthSession 形状的最小请求对象，便于测试响应头写入逻辑。
 */
function createSessionRequest(input: {
    userId: string;
    roles: SessionRole[];
    incomingVersion?: string;
}): Request & { session?: any } {
    const headers: Record<string, string> = {};

    if (input.incomingVersion) {
        headers[HEADER_VERSION] = input.incomingVersion;
    }

    return {
        headers,
        session: {
            user: { id: input.userId },
            roles: input.roles
        }
    } as Request & { session?: any };
}

/**
 * 构造可收集 setHeader 调用结果的响应对象。
 */
function createResponseCollector(): ResponseCollector {
    const headers = new Map<string, string>();
    const setHeader = jest.fn((name: string, value: string) => {
        headers.set(name.toLowerCase(), String(value));
    });

    return {
        headers,
        setHeader,
        response: {
            setHeader
        } as unknown as Response
    };
}

/**
 * 读取响应头收集器中的某个 header 值。
 */
function readHeader(headers: Map<string, string>, key: string): string | undefined {
    return headers.get(key.toLowerCase());
}

describe('AdminUserStateService', () => {
    describe('属性测试', () => {
        // Feature: admin-user-version, Property 1: bumpUserStateVersion 后 getUserVersion 返回不同版本
        it('性质 1：bumpUserStateVersion 后 getUserVersion 应返回不同版本', async () => {
            const fixture = await createServiceFixture();

            try {
                await fc.assert(
                    fc.asyncProperty(userIdArbitrary, async (userId) => {
                        const previousVersion = await fixture.service.getUserVersion(userId);

                        await fixture.service.bumpUserStateVersion(userId);

                        const latestVersion = await fixture.service.getUserVersion(userId);

                        expect(latestVersion).not.toBe(previousVersion);
                    }),
                    { numRuns: 100 }
                );
            } finally {
                await fixture.moduleRef.close();
            }
        });

        // Feature: admin-user-version, Property 2: bumpRoleStateVersion 后 getRoleStateVersion 返回不同版本
        it('性质 2：bumpRoleStateVersion 后 getRoleStateVersion 应返回不同版本', async () => {
            const fixture = await createServiceFixture();

            try {
                await fc.assert(
                    fc.asyncProperty(roleIdArbitrary, async (roleId) => {
                        const previousVersion = await fixture.service.getRoleStateVersion(roleId);

                        await fixture.service.bumpRoleStateVersion(roleId);

                        const latestVersion = await fixture.service.getRoleStateVersion(roleId);

                        expect(latestVersion).not.toBe(previousVersion);
                    }),
                    { numRuns: 100 }
                );
            } finally {
                await fixture.moduleRef.close();
            }
        });

        // Feature: admin-user-version, Property 3: bumpMenuStateVersion 后 getMenuStateVersion 返回不同版本
        it('性质 3：bumpMenuStateVersion 后 getMenuStateVersion 应返回不同版本', async () => {
            const fixture = await createServiceFixture();

            try {
                await fc.assert(
                    fc.asyncProperty(fc.constant(undefined), async () => {
                        const previousVersion = await fixture.service.getMenuStateVersion();

                        await fixture.service.bumpMenuStateVersion();

                        const latestVersion = await fixture.service.getMenuStateVersion();

                        expect(latestVersion).not.toBe(previousVersion);
                    }),
                    { numRuns: 100 }
                );
            } finally {
                await fixture.moduleRef.close();
            }
        });

        // Feature: admin-user-version, Property 4: 所有 Redis 键以 ver:app-api: 开头
        it('性质 4：所有 Redis 键都应以 ver:app-api: 开头', async () => {
            const fixture = await createServiceFixture();

            try {
                await fc.assert(
                    fc.asyncProperty(userIdArbitrary, roleIdArbitrary, async (userId, roleId) => {
                        fixture.redis?.mock.get.mockClear();
                        fixture.redis?.mock.set.mockClear();

                        await fixture.service.getUserVersion(userId);
                        await fixture.service.getRoleStateVersion(roleId);
                        await fixture.service.getMenuStateVersion();
                        await fixture.service.getCompositeStateVersion({
                            userId,
                            roles: [{ id: roleId }]
                        });

                        const touchedKeys = [
                            ...(fixture.redis?.mock.get.mock.calls.map(([key]: [string]) => key) ?? []),
                            ...(fixture.redis?.mock.set.mock.calls.map(([key]: [string]) => key) ?? [])
                        ];

                        expect(touchedKeys).toEqual(
                            expect.arrayContaining([
                                createAppApiUserVersionRedisKey(userId),
                                createAppApiRoleVersionRedisKey(roleId),
                                MENU_CACHE_KEY
                            ])
                        );
                        expect(touchedKeys.every((key) => key.startsWith(ADMIN_PREFIX))).toBe(true);
                    }),
                    { numRuns: 100 }
                );
            } finally {
                await fixture.moduleRef.close();
            }
        });

        // Feature: admin-user-version, Property 5: getCompositeStateVersion 角色顺序打乱后结果相同
        it('性质 5：getCompositeStateVersion 在角色顺序打乱后结果应保持不变', async () => {
            const fixture = await createServiceFixture();

            try {
                await fc.assert(
                    fc.asyncProperty(userIdArbitrary, shuffledRoleListArbitrary, async (userId, roles) => {
                        const reversedRoles = [...roles].reverse();

                        const versionA = await fixture.service.getCompositeStateVersion({
                            userId,
                            roles
                        });
                        const versionB = await fixture.service.getCompositeStateVersion({
                            userId,
                            roles: reversedRoles
                        });

                        expect(versionA).toBe(versionB);
                    }),
                    { numRuns: 100 }
                );
            } finally {
                await fixture.moduleRef.close();
            }
        });

        // Feature: admin-user-version, Property 6: 不同角色集合产生不同综合版本号
        it('性质 6：不同角色集合应产生不同综合版本号', async () => {
            const fixture = await createServiceFixture();

            try {
                await fc.assert(
                    fc.asyncProperty(userIdArbitrary, differentRoleSetsArbitrary, async (userId, roleSets) => {
                        const versionA = await fixture.service.getCompositeStateVersion({
                            userId,
                            roles: roleSets.rolesA
                        });
                        const versionB = await fixture.service.getCompositeStateVersion({
                            userId,
                            roles: roleSets.rolesB
                        });

                        expect(versionA).not.toBe(versionB);
                    }),
                    { numRuns: 100 }
                );
            } finally {
                await fixture.moduleRef.close();
            }
        });

        // Feature: admin-user-version, Property 7: 有效会话写入 x-user-state-version 头（64 字符 hex）
        it('性质 7：有效会话应写入 64 字符十六进制的 x-user-state-version 头', async () => {
            const fixture = await createServiceFixture();

            try {
                await fc.assert(
                    fc.asyncProperty(validSessionArbitrary, async ({ userId, roles }) => {
                        const request = createSessionRequest({ userId, roles });
                        const responseCollector = createResponseCollector();

                        await fixture.service.attachUserStateHeaders(request, responseCollector.response);

                        const versionHeader = readHeader(responseCollector.headers, HEADER_VERSION);

                        expect(versionHeader).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));
                    }),
                    { numRuns: 100 }
                );
            } finally {
                await fixture.moduleRef.close();
            }
        });

        // Feature: admin-user-version, Property 8: 版本不一致时追加 x-user-state-changed: 1，一致时不追加
        it('性质 8：版本不一致时应追加 changed 标记，一致时不应追加', async () => {
            const fixture = await createServiceFixture();

            try {
                await fc.assert(
                    fc.asyncProperty(validSessionArbitrary, async ({ userId, roles }) => {
                        const baselineResponse = createResponseCollector();

                        await fixture.service.attachUserStateHeaders(
                            createSessionRequest({ userId, roles }),
                            baselineResponse.response
                        );

                        const latestVersion = readHeader(baselineResponse.headers, HEADER_VERSION);

                        expect(latestVersion).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));
                        if (!latestVersion) {
                            throw new Error('缺少最新版本响应头');
                        }

                        const unchangedResponse = createResponseCollector();
                        await fixture.service.attachUserStateHeaders(
                            createSessionRequest({ userId, roles, incomingVersion: latestVersion }),
                            unchangedResponse.response
                        );

                        expect(readHeader(unchangedResponse.headers, HEADER_CHANGED)).toBeUndefined();

                        // 使用固定过期版本值，避免与最新版本偶然相同。
                        const staleVersion = latestVersion === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
                        const changedResponse = createResponseCollector();

                        await fixture.service.attachUserStateHeaders(
                            createSessionRequest({ userId, roles, incomingVersion: staleVersion }),
                            changedResponse.response
                        );

                        expect(readHeader(changedResponse.headers, HEADER_CHANGED)).toBe('1');
                    }),
                    { numRuns: 100 }
                );
            } finally {
                await fixture.moduleRef.close();
            }
        });

        // Feature: admin-user-version, Property 9: getCompositeStateVersion 内部抛异常时 attachUserStateHeaders 不向外传播
        it('性质 9：getCompositeStateVersion 内部抛异常时，attachUserStateHeaders 不应向外传播异常', async () => {
            const fixture = await createServiceFixture();

            try {
                await fc.assert(
                    fc.asyncProperty(validSessionArbitrary, async ({ userId, roles }) => {
                        const request = createSessionRequest({ userId, roles });
                        const responseCollector = createResponseCollector();
                        const compositeSpy = jest
                            .spyOn(fixture.service, 'getCompositeStateVersion')
                            .mockRejectedValueOnce(new Error('综合版本计算失败'));

                        await expect(
                            fixture.service.attachUserStateHeaders(request, responseCollector.response)
                        ).resolves.toBeUndefined();
                        expect(responseCollector.setHeader).not.toHaveBeenCalled();

                        compositeSpy.mockRestore();
                    }),
                    { numRuns: 100 }
                );
            } finally {
                await fixture.moduleRef.close();
            }
        });
    });

    describe('单元测试', () => {
        it('Redis 不可用时应降级到 DB 路径，并静默跳过缓存能力', async () => {
            const fixture = await createServiceFixture({
                enableRedis: false,
                initialDbRecords: [
                    {
                        type: StateVersionType.role,
                        name: buildRoleDbName(1),
                        version: 'db-role-version'
                    },
                    {
                        type: StateVersionType.menu,
                        name: 'app_api_global',
                        version: 'db-menu-version'
                    }
                ]
            });

            try {
                expect(await fixture.service.getRoleStateVersion(1)).toBe('db-role-version');
                expect(await fixture.service.getMenuStateVersion()).toBe('db-menu-version');
                expect(fixture.prisma.state.get(buildStateRecordKey(StateVersionType.role, buildRoleDbName(1)))).toBe(
                    'db-role-version'
                );

                const firstUserVersion = await fixture.service.getUserVersion('user_without_redis');
                const secondUserVersion = await fixture.service.getUserVersion('user_without_redis');

                expect(firstUserVersion).not.toBe(secondUserVersion);
            } finally {
                await fixture.moduleRef.close();
            }
        });

        it('角色版本 Redis 未命中时应优先回源稳定 DB key 并回填 Redis', async () => {
            const fixture = await createServiceFixture({
                initialDbRecords: [
                    {
                        type: StateVersionType.role,
                        name: buildRoleDbName(7),
                        version: 'db-role-version'
                    }
                ]
            });

            try {
                const version = await fixture.service.getRoleStateVersion(7);

                expect(version).toBe('db-role-version');
                expect(fixture.prisma.mock.stateVersion.findUnique).toHaveBeenCalledWith({
                    where: { type_name: { type: StateVersionType.role, name: buildRoleDbName(7) } },
                    select: { version: true }
                });
                expect(fixture.prisma.mock.stateVersion.findUnique).toHaveBeenCalledTimes(1);
                expect(fixture.redis?.mock.set).toHaveBeenCalledWith(`${ROLE_CACHE_KEY_PREFIX}7`, 'db-role-version');
            } finally {
                await fixture.moduleRef.close();
            }
        });

        it('重置角色版本时应只写稳定 DB key', async () => {
            const fixture = await createServiceFixture();

            try {
                const nextVersion = await fixture.service.bumpRoleStateVersion(7);

                expect(nextVersion).toEqual(expect.any(String));
                expect(fixture.prisma.mock.stateVersion.upsert).toHaveBeenCalledWith({
                    where: { type_name: { type: StateVersionType.role, name: buildRoleDbName(7) } },
                    update: { version: nextVersion },
                    create: {
                        type: StateVersionType.role,
                        name: buildRoleDbName(7),
                        version: nextVersion
                    }
                });
                expect(fixture.prisma.state.get(buildStateRecordKey(StateVersionType.role, buildRoleDbName(7)))).toBe(
                    nextVersion
                );
                expect(fixture.redis?.mock.set).toHaveBeenCalledWith(`${ROLE_CACHE_KEY_PREFIX}7`, nextVersion);
            } finally {
                await fixture.moduleRef.close();
            }
        });

        it('菜单版本应使用 app_api_global，而不是 global', async () => {
            const fixture = await createServiceFixture({
                initialDbRecords: [
                    {
                        type: StateVersionType.menu,
                        name: 'app_api_global',
                        version: 'db-menu-version'
                    }
                ]
            });

            try {
                const version = await fixture.service.getMenuStateVersion();

                expect(version).toBe('db-menu-version');
                expect(fixture.prisma.mock.stateVersion.findUnique).toHaveBeenCalledWith({
                    where: { type_name: { type: StateVersionType.menu, name: 'app_api_global' } },
                    select: { version: true }
                });
                expect(fixture.prisma.mock.stateVersion.findUnique).not.toHaveBeenCalledWith({
                    where: { type_name: { type: StateVersionType.menu, name: 'global' } },
                    select: { version: true }
                });
            } finally {
                await fixture.moduleRef.close();
            }
        });

        it('无会话请求应跳过版本头写入', async () => {
            const fixture = await createServiceFixture();
            const responseCollector = createResponseCollector();

            try {
                await fixture.service.attachUserStateHeaders(
                    {
                        headers: {}
                    } as Request & { session?: any },
                    responseCollector.response
                );

                expect(responseCollector.setHeader).not.toHaveBeenCalled();
            } finally {
                await fixture.moduleRef.close();
            }
        });

        it('同一 request 内重复写入响应头时应复用综合版本计算', async () => {
            const fixture = await createServiceFixture({
                initialRedisEntries: {
                    [MENU_CACHE_KEY]: 'menu-version',
                    [createAppApiUserVersionRedisKey('user_1')]: 'user-version',
                    [`${ROLE_CACHE_KEY_PREFIX}2`]: 'role-2-version',
                    [`${ROLE_CACHE_KEY_PREFIX}5`]: 'role-5-version'
                }
            });
            const request = createSessionRequest({
                userId: 'user_1',
                roles: [
                    { id: 5, name: 'ops' },
                    { id: 2, name: 'admin' }
                ]
            });
            const firstResponse = createResponseCollector();
            const secondResponse = createResponseCollector();

            try {
                const [firstVersion, secondVersion] = await Promise.all([
                    fixture.service
                        .attachUserStateHeaders(request, firstResponse.response)
                        .then(() => readHeader(firstResponse.headers, HEADER_VERSION)),
                    fixture.service
                        .attachUserStateHeaders(request, secondResponse.response)
                        .then(() => readHeader(secondResponse.headers, HEADER_VERSION))
                ]);

                expect(firstVersion).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));
                expect(secondVersion).toBe(firstVersion);
                expect(fixture.redis?.mock.get).toHaveBeenCalledTimes(4);
                expect(fixture.redis?.mock.set).not.toHaveBeenCalled();
            } finally {
                await fixture.moduleRef.close();
            }
        });
    });
});
