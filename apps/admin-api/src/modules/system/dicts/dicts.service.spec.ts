import { BusinessException } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { AdminErrorCodes } from '../../../common/constants/index';
import {
    CreateDictCategorySchema,
    CreateDictSchema,
    DeleteDictCategorySchema,
    DictDisabledStatus,
    DictEnabledStatus,
    QueryDictOptionsSchema,
    UpdateDictSchema
} from './dto/dict.dto';
import { SystemDictsService } from './dicts.service';

const mockPrismaService = {
    $transaction: jest.fn(),
    dict: {
        findManyAndCount: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
    },
    dictCategory: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        upsert: jest.fn()
    },
    dictKey: {
        findManyAndCount: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn()
    }
};

/**
 * 构造字典主表记录，方便测试只覆盖关键字段。
 */
function createDictRecord(overrides: Record<string, unknown> = {}) {
    const now = new Date('2026-05-03T00:00:00.000Z');
    return {
        id: 1,
        category: 'system',
        name: '用户状态',
        value: 'user_status',
        description: null,
        status: DictEnabledStatus,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

/**
 * 构造字典项记录，方便测试复用默认值。
 */
function createDictItemRecord(overrides: Record<string, unknown> = {}) {
    const now = new Date('2026-05-03T00:00:00.000Z');
    return {
        id: 10,
        dictId: 1,
        key: 'ENABLE',
        value: '启用',
        description: null,
        status: DictEnabledStatus,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe('SystemDictsService', () => {
    let service: SystemDictsService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPrismaService.$transaction.mockImplementation(async (operations) => Promise.all(operations));
        mockPrismaService.dict.findFirst.mockResolvedValue(null);
        mockPrismaService.dict.groupBy.mockResolvedValue([]);
        mockPrismaService.dictCategory.findMany.mockResolvedValue([]);
        mockPrismaService.dictCategory.findUnique.mockResolvedValue(null);
        mockPrismaService.dictCategory.upsert.mockResolvedValue({ id: 1, name: 'system' });
        mockPrismaService.dictKey.findFirst.mockResolvedValue(null);
        service = new SystemDictsService(mockPrismaService as unknown as PrismaService);
    });

    it('创建分类 DTO 应使用 Zod 修剪分类名称', () => {
        const result = CreateDictCategorySchema.parse({
            name: ' system '
        });

        expect(result).toEqual({
            name: 'system'
        });
    });

    it('删除分类 DTO 应使用 Zod 修剪分类名称', () => {
        const result = DeleteDictCategorySchema.parse({
            name: ' system '
        });

        expect(result).toEqual({
            name: 'system'
        });
    });

    it('创建字典 DTO 应使用 Zod 修剪字段并接受空描述 null', () => {
        const result = CreateDictSchema.parse({
            category: ' system ',
            name: ' 用户状态 ',
            value: ' user_status ',
            description: null,
            status: DictEnabledStatus,
            sortOrder: 10
        });

        expect(result).toEqual({
            category: 'system',
            name: '用户状态',
            value: 'user_status',
            description: null,
            status: DictEnabledStatus,
            sortOrder: 10
        });
    });

    it('更新字典 DTO 应拒绝表格展示字段，避免前端冗余字段透传到业务层', () => {
        const result = UpdateDictSchema.safeParse({
            id: 1,
            name: '用户状态',
            createdAt: '2026-05-03T00:00:00.000Z',
            itemCount: 2
        });

        expect(result.success).toBe(false);
    });

    it('分页查询字典时，应附带字典项数量并保持稳定排序', async () => {
        const dict = createDictRecord({
            _count: {
                dictKey: 2
            }
        });
        const pagination = {
            total: 1,
            totalPages: 1,
            pageSize: 10,
            page: 1
        };
        mockPrismaService.dict.findManyAndCount.mockResolvedValue([[dict], pagination]);

        const result = await service.getDictList({
            page: 1,
            pageSize: 10,
            category: 'system'
        });

        expect(mockPrismaService.dict.findManyAndCount).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    category: 'system'
                }),
                include: {
                    _count: {
                        select: {
                            dictKey: true
                        }
                    }
                },
                orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }]
            })
        );
        expect(result.records).toEqual([
            expect.objectContaining({
                id: 1,
                itemCount: 2
            })
        ]);
        expect(result.records[0]).not.toHaveProperty('_count');
    });

    it('创建字典时，同一分类下 value 重复应抛业务异常', async () => {
        mockPrismaService.dict.findFirst.mockResolvedValue({ id: 99 });

        await expect(
            service.createDict({
                category: 'system',
                name: '重复字典',
                value: 'user_status',
                description: null,
                status: DictEnabledStatus,
                sortOrder: 1
            })
        ).rejects.toMatchObject({
            bizCode: AdminErrorCodes.DICT.CODE_EXISTS.code
        });
        expect(mockPrismaService.dictCategory.upsert).not.toHaveBeenCalled();
        expect(mockPrismaService.dict.create).not.toHaveBeenCalled();
    });

    it('创建字典分类时，分类名已存在应抛业务异常', async () => {
        mockPrismaService.dictCategory.findUnique.mockResolvedValue({ id: 1 });

        await expect(service.createDictCategory({ name: 'system' })).rejects.toMatchObject({
            bizCode: AdminErrorCodes.DICT.CATEGORY_EXISTS.code
        });
        expect(mockPrismaService.dictCategory.create).not.toHaveBeenCalled();
    });

    it('删除字典分类时，分类下仍存在字典应抛业务异常', async () => {
        mockPrismaService.dictCategory.findUnique.mockResolvedValue({ id: 1 });
        mockPrismaService.dict.findFirst.mockResolvedValue({ id: 10 });

        await expect(service.deleteDictCategory({ name: 'system' })).rejects.toMatchObject({
            bizCode: AdminErrorCodes.DICT.CATEGORY_IN_USE.code
        });
        expect(mockPrismaService.dictCategory.delete).not.toHaveBeenCalled();
    });

    it('删除字典分类时，分类不存在应抛业务异常', async () => {
        mockPrismaService.dictCategory.findUnique.mockResolvedValue(null);
        mockPrismaService.dict.findFirst.mockResolvedValue(null);

        await expect(service.deleteDictCategory({ name: 'missing' })).rejects.toMatchObject({
            bizCode: AdminErrorCodes.DICT.CATEGORY_NOT_FOUND.code
        });
        expect(mockPrismaService.dictCategory.delete).not.toHaveBeenCalled();
    });

    it('删除字典分类时，应只删除没有字典引用的空分类', async () => {
        mockPrismaService.dictCategory.findUnique.mockResolvedValue({ id: 1 });
        mockPrismaService.dict.findFirst.mockResolvedValue(null);
        mockPrismaService.dictCategory.delete.mockResolvedValue({ id: 1, name: 'system' });

        await expect(service.deleteDictCategory({ name: 'system' })).resolves.toBeNull();

        expect(mockPrismaService.dictCategory.delete).toHaveBeenCalledWith({
            where: {
                name: 'system'
            }
        });
    });

    it('创建字典时，应先确保分类表存在对应分类', async () => {
        const dict = createDictRecord();
        mockPrismaService.dict.create.mockResolvedValue(dict);

        await service.createDict({
            category: 'system',
            name: '用户状态',
            value: 'user_status',
            description: null,
            status: DictEnabledStatus,
            sortOrder: 1
        });

        expect(mockPrismaService.dictCategory.upsert).toHaveBeenCalledWith({
            where: {
                name: 'system'
            },
            create: {
                name: 'system'
            },
            update: {}
        });
    });

    it('删除字典时，应先删除其下字典项再删除字典主记录', async () => {
        const dict = createDictRecord();
        mockPrismaService.dict.findUnique.mockResolvedValue(dict);
        mockPrismaService.dictKey.deleteMany.mockReturnValue({ kind: 'delete-items' });
        mockPrismaService.dict.delete.mockReturnValue({ kind: 'delete-dict' });

        await expect(service.deleteDict({ id: dict.id })).resolves.toBeNull();

        expect(mockPrismaService.$transaction).toHaveBeenCalledWith([
            { kind: 'delete-items' },
            { kind: 'delete-dict' }
        ]);
        expect(mockPrismaService.dictKey.deleteMany).toHaveBeenCalledWith({
            where: {
                dictId: dict.id
            }
        });
        expect(mockPrismaService.dict.delete).toHaveBeenCalledWith({
            where: {
                id: dict.id
            }
        });
    });

    it('级联更新字典状态时，应同步更新字典项状态', async () => {
        const dict = createDictRecord();
        mockPrismaService.dict.findUnique.mockResolvedValue(dict);
        mockPrismaService.dict.update.mockReturnValue({ kind: 'update-dict' });
        mockPrismaService.dictKey.updateMany.mockReturnValue({ kind: 'update-items' });

        await expect(
            service.updateDictStatus({
                id: dict.id,
                status: DictDisabledStatus,
                cascadeItems: true
            })
        ).resolves.toBeNull();

        expect(mockPrismaService.$transaction).toHaveBeenCalledWith([
            { kind: 'update-dict' },
            { kind: 'update-items' }
        ]);
        expect(mockPrismaService.dictKey.updateMany).toHaveBeenCalledWith({
            where: {
                dictId: dict.id
            },
            data: {
                status: DictDisabledStatus
            }
        });
    });

    it('创建字典项时，应校验所属字典和同字典下 key 唯一', async () => {
        const dict = createDictRecord();
        const item = createDictItemRecord();
        mockPrismaService.dict.findUnique.mockResolvedValue(dict);
        mockPrismaService.dictKey.create.mockResolvedValue(item);

        const result = await service.createDictItem({
            dictId: dict.id,
            key: 'ENABLE',
            value: '启用',
            description: null,
            status: DictEnabledStatus,
            sortOrder: 1
        });

        expect(mockPrismaService.dict.findUnique).toHaveBeenCalledWith({
            where: {
                id: dict.id
            }
        });
        expect(mockPrismaService.dictKey.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    dictId: dict.id,
                    key: 'ENABLE'
                },
                select: {
                    id: true
                }
            })
        );
        expect(result).toBe(item);
    });

    it('更新字典项所属字典时，应重新校验目标字典和 key 唯一', async () => {
        const item = createDictItemRecord();
        const targetDict = createDictRecord({ id: 2 });
        mockPrismaService.dictKey.findUnique.mockResolvedValue(item);
        mockPrismaService.dict.findUnique.mockResolvedValue(targetDict);
        mockPrismaService.dictKey.update.mockResolvedValue({
            ...item,
            dictId: 2
        });

        await service.updateDictItem({
            id: item.id,
            dictId: 2
        });

        expect(mockPrismaService.dict.findUnique).toHaveBeenCalledWith({
            where: {
                id: 2
            }
        });
        expect(mockPrismaService.dictKey.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    dictId: 2,
                    key: item.key,
                    id: {
                        not: item.id
                    }
                }
            })
        );
    });

    it('查询下拉选项时，默认只返回启用字典项并映射 label/value', async () => {
        const dict = createDictRecord();
        const item = createDictItemRecord();
        mockPrismaService.dict.findUnique.mockResolvedValue(dict);
        mockPrismaService.dictKey.findMany.mockResolvedValue([item]);

        const result = await service.getDictOptions({
            dictId: dict.id,
            enabledOnly: true
        });

        expect(mockPrismaService.dictKey.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    dictId: dict.id,
                    status: DictEnabledStatus
                }
            })
        );
        expect(result).toEqual([
            {
                label: item.value,
                value: item.key,
                key: item.key,
                description: item.description,
                status: item.status,
                sortOrder: item.sortOrder
            }
        ]);
    });

    it('查询下拉选项时，应接受布尔 false 作为不过滤禁用项', async () => {
        const dict = createDictRecord();
        mockPrismaService.dict.findUnique.mockResolvedValue(dict);
        mockPrismaService.dictKey.findMany.mockResolvedValue([]);

        const query = QueryDictOptionsSchema.parse({
            dictId: dict.id,
            enabledOnly: false
        });
        await service.getDictOptions(query);

        expect(query.enabledOnly).toBe(false);
        expect(mockPrismaService.dictKey.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    dictId: dict.id,
                    status: undefined
                }
            })
        );
    });

    it('字典不存在时，应返回字典不存在业务异常', async () => {
        mockPrismaService.dict.findUnique.mockResolvedValue(null);

        await expect(service.getDictDetail(404)).rejects.toBeInstanceOf(BusinessException);
        await expect(service.getDictDetail(404)).rejects.toMatchObject({
            bizCode: AdminErrorCodes.DICT.NOT_FOUND.code
        });
    });
});
