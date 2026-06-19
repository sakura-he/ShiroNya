import { BusinessException } from '@app/common';
import { PrismaService } from '@app/prisma-admin';
import { Prisma } from '@app/prisma-admin/generated/client';
import { Injectable } from '@nestjs/common';
import { AdminErrorCodes } from '../../../common/constants/index';
import {
    CreateDictCategoryDto,
    CreateDictDto,
    CreateDictItemDto,
    DeleteDictCategoryDto,
    DeleteDictDto,
    DeleteDictItemDto,
    DictDisabledStatus,
    DictEnabledStatus,
    QueryDictItemListDto,
    QueryDictCategoryOptionsDto,
    QueryDictListDto,
    QueryDictOptionsDto,
    UpdateDictDto,
    UpdateDictItemDto,
    UpdateDictItemStatusDto,
    UpdateDictStatusDto
} from './dto/dict.dto';

type DictUniqueInput = {
    category: string;
    value: string;
};

/**
 * 提供后台数据字典主表与字典项的完整管理能力。
 */
@Injectable()
export class SystemDictsService {
    /**
     * 注入 Prisma 服务，用于读写 shiro_dict 与 dict_key。
     */
    constructor(private readonly prisma: PrismaService) {}

    /**
     * 查询字典分类选项，并合并字典主表中已有的分类字符串。
     */
    async getDictCategoryOptions(query: QueryDictCategoryOptionsDto) {
        const keywordWhere = query.keyword
            ? {
                  name: {
                      contains: query.keyword
                  }
              }
            : undefined;
        const [categories, dictGroups] = await Promise.all([
            this.prisma.dictCategory.findMany({
                where: keywordWhere,
                orderBy: {
                    name: 'asc'
                }
            }),
            this.prisma.dict.groupBy({
                by: ['category'],
                where: query.keyword
                    ? {
                          category: {
                              contains: query.keyword
                          }
                      }
                    : undefined,
                _count: {
                    _all: true
                }
            })
        ]);
        const optionMap = new Map<string, { label: string; value: string; count: number }>();

        categories.forEach((category) => {
            optionMap.set(category.name, {
                label: category.name,
                value: category.name,
                count: 0
            });
        });
        dictGroups.forEach((group) => {
            optionMap.set(group.category, {
                label: group.category,
                value: group.category,
                count: group._count._all
            });
        });

        return [...optionMap.values()].sort((left, right) => left.label.localeCompare(right.label));
    }

    /**
     * 创建字典分类，避免新增分类只停留在前端临时状态。
     */
    async createDictCategory(data: CreateDictCategoryDto) {
        await this.ensureDictCategoryAvailable(data.name);
        return await this.prisma.dictCategory.create({
            data: {
                name: data.name
            }
        });
    }

    /**
     * 删除空字典分类，存在字典引用时拒绝删除避免导航重新聚合出该分类。
     */
    async deleteDictCategory(data: DeleteDictCategoryDto) {
        const [category, existingDict] = await Promise.all([
            this.prisma.dictCategory.findUnique({
                where: {
                    name: data.name
                },
                select: {
                    id: true
                }
            }),
            this.prisma.dict.findFirst({
                where: {
                    category: data.name
                },
                select: {
                    id: true
                }
            })
        ]);

        if (existingDict) {
            throw new BusinessException(AdminErrorCodes.DICT.CATEGORY_IN_USE);
        }
        if (!category) {
            throw new BusinessException(AdminErrorCodes.DICT.CATEGORY_NOT_FOUND);
        }

        await this.prisma.dictCategory.delete({
            where: {
                name: data.name
            }
        });
        return null;
    }

    /**
     * 分页查询字典主表，并附带每个字典的字典项数量。
     */
    async getDictList(query: QueryDictListDto) {
        const [records, pagination] = await this.prisma.dict.findManyAndCount({
            where: this.buildDictWhere(query),
            include: {
                _count: {
                    select: {
                        dictKey: true
                    }
                }
            },
            take: query.pageSize,
            skip: (query.page - 1) * query.pageSize,
            orderBy: [
                {
                    category: 'asc'
                },
                {
                    sortOrder: 'asc'
                },
                {
                    id: 'asc'
                }
            ]
        });

        type DictRecordWithItemCount = Prisma.DictGetPayload<{
            include: { _count: { select: { dictKey: true } } };
        }>;

        return {
            records: records.map((record) => this.withDictItemCount(record as DictRecordWithItemCount)),
            pagination
        };
    }

    /**
     * 按主键查询字典详情，并按排序返回字典项。
     */
    async getDictDetail(id: number) {
        const dict = await this.prisma.dict.findUnique({
            where: {
                id
            },
            include: {
                dictKey: {
                    orderBy: [
                        {
                            sortOrder: 'asc'
                        },
                        {
                            id: 'asc'
                        }
                    ]
                }
            }
        });

        if (!dict) {
            throw new BusinessException(AdminErrorCodes.DICT.NOT_FOUND);
        }

        return dict;
    }

    /**
     * 创建字典主记录，并校验同分类下 value 唯一。
     */
    async createDict(data: CreateDictDto) {
        await this.ensureDictValueAvailable({
            category: data.category,
            value: data.value
        });
        await this.ensureDictCategory(data.category);

        return await this.prisma.dict.create({
            data: {
                category: data.category,
                name: data.name,
                value: data.value,
                description: data.description ?? null,
                status: data.status,
                sortOrder: data.sortOrder
            }
        });
    }

    /**
     * 更新字典主记录，分类或 value 变化时重新校验唯一性。
     */
    async updateDict(data: UpdateDictDto) {
        const dict = await this.getDictOrThrow(data.id);
        const nextUniqueInput = {
            category: data.category ?? dict.category,
            value: data.value ?? dict.value
        };

        if (nextUniqueInput.category !== dict.category || nextUniqueInput.value !== dict.value) {
            await this.ensureDictValueAvailable(nextUniqueInput, dict.id);
        }
        if (data.category !== undefined) {
            await this.ensureDictCategory(data.category);
        }

        return await this.prisma.dict.update({
            where: {
                id: dict.id
            },
            data: this.toDictUpdateData(data)
        });
    }

    /**
     * 删除字典主记录，并同步删除其下全部字典项，避免孤儿数据。
     */
    async deleteDict(data: DeleteDictDto) {
        const dict = await this.getDictOrThrow(data.id);
        await this.prisma.$transaction([
            this.prisma.dictKey.deleteMany({
                where: {
                    dictId: dict.id
                }
            }),
            this.prisma.dict.delete({
                where: {
                    id: dict.id
                }
            })
        ]);
        return null;
    }

    /**
     * 更新字典状态；需要时同步更新其下字典项状态。
     */
    async updateDictStatus(data: UpdateDictStatusDto) {
        const dict = await this.getDictOrThrow(data.id);
        await this.prisma.$transaction([
            this.prisma.dict.update({
                where: {
                    id: dict.id
                },
                data: {
                    status: data.status
                }
            }),
            ...(data.cascadeItems
                ? [
                      this.prisma.dictKey.updateMany({
                          where: {
                              dictId: dict.id
                          },
                          data: {
                              status: data.status
                          }
                      })
                  ]
                : [])
        ]);
        return null;
    }

    /**
     * 分页查询字典项，可按 dictId 或 category + dictValue 定位所属字典。
     */
    async getDictItemList(query: QueryDictItemListDto) {
        const [records, pagination] = await this.prisma.dictKey.findManyAndCount({
            where: this.buildDictItemWhere(query),
            include: {
                dict: true
            },
            take: query.pageSize,
            skip: (query.page - 1) * query.pageSize,
            orderBy: [
                {
                    sortOrder: 'asc'
                },
                {
                    id: 'asc'
                }
            ]
        });

        return {
            records,
            pagination
        };
    }

    /**
     * 按字典定位信息获取前端下拉选项。
     */
    async getDictOptions(query: QueryDictOptionsDto) {
        const dict = await this.resolveDict(query);
        const records = await this.prisma.dictKey.findMany({
            where: {
                dictId: dict.id,
                status: query.enabledOnly ? DictEnabledStatus : undefined
            },
            orderBy: [
                {
                    sortOrder: 'asc'
                },
                {
                    id: 'asc'
                }
            ]
        });

        return records.map((record) => ({
            label: record.value,
            value: record.key,
            key: record.key,
            description: record.description,
            status: record.status,
            sortOrder: record.sortOrder
        }));
    }

    /**
     * 创建字典项，并校验所属字典存在和同字典下 key 唯一。
     */
    async createDictItem(data: CreateDictItemDto) {
        await this.getDictOrThrow(data.dictId);
        await this.ensureDictItemKeyAvailable(data.dictId, data.key);

        return await this.prisma.dictKey.create({
            data: {
                dictId: data.dictId,
                key: data.key,
                value: data.value,
                description: data.description ?? null,
                status: data.status,
                sortOrder: data.sortOrder
            }
        });
    }

    /**
     * 更新字典项，变更所属字典或 key 时重新校验唯一性。
     */
    async updateDictItem(data: UpdateDictItemDto) {
        const item = await this.getDictItemOrThrow(data.id);
        const nextDictId = data.dictId ?? item.dictId;
        const nextKey = data.key ?? item.key;

        if (data.dictId !== undefined) {
            await this.getDictOrThrow(data.dictId);
        }
        if (nextDictId !== item.dictId || nextKey !== item.key) {
            await this.ensureDictItemKeyAvailable(nextDictId, nextKey, item.id);
        }

        return await this.prisma.dictKey.update({
            where: {
                id: item.id
            },
            data: this.toDictItemUpdateData(data)
        });
    }

    /**
     * 删除单个字典项。
     */
    async deleteDictItem(data: DeleteDictItemDto) {
        const item = await this.getDictItemOrThrow(data.id);
        await this.prisma.dictKey.delete({
            where: {
                id: item.id
            }
        });
        return null;
    }

    /**
     * 更新单个字典项状态。
     */
    async updateDictItemStatus(data: UpdateDictItemStatusDto) {
        const item = await this.getDictItemOrThrow(data.id);
        await this.prisma.dictKey.update({
            where: {
                id: item.id
            },
            data: {
                status: data.status
            }
        });
        return null;
    }

    /**
     * 返回字典状态选项，供前端表单和筛选共用。
     */
    getDictStatusOptions() {
        return [
            {
                label: '启用',
                value: DictEnabledStatus,
                isEnabled: true
            },
            {
                label: '禁用',
                value: DictDisabledStatus,
                isEnabled: false
            }
        ];
    }

    /**
     * 根据主键查询字典，不存在时抛业务异常。
     */
    private async getDictOrThrow(id: number) {
        const dict = await this.prisma.dict.findUnique({
            where: {
                id
            }
        });
        if (!dict) {
            throw new BusinessException(AdminErrorCodes.DICT.NOT_FOUND);
        }
        return dict;
    }

    /**
     * 根据主键查询字典项，不存在时抛业务异常。
     */
    private async getDictItemOrThrow(id: number) {
        const item = await this.prisma.dictKey.findUnique({
            where: {
                id
            }
        });
        if (!item) {
            throw new BusinessException(AdminErrorCodes.DICT.ITEM_NOT_FOUND);
        }
        return item;
    }

    /**
     * 校验同一分类下字典 value 是否可用。
     */
    private async ensureDictValueAvailable(input: DictUniqueInput, excludeId?: number) {
        const existing = await this.prisma.dict.findFirst({
            where: {
                category: input.category,
                value: input.value,
                ...(excludeId
                    ? {
                          id: {
                              not: excludeId
                          }
                      }
                    : {})
            },
            select: {
                id: true
            }
        });

        if (existing) {
            throw new BusinessException(AdminErrorCodes.DICT.CODE_EXISTS);
        }
    }

    /**
     * 校验分类名称是否已被显式分类或既有字典使用。
     */
    private async ensureDictCategoryAvailable(name: string) {
        const [existingCategory, existingDict] = await Promise.all([
            this.prisma.dictCategory.findUnique({
                where: {
                    name
                },
                select: {
                    id: true
                }
            }),
            this.prisma.dict.findFirst({
                where: {
                    category: name
                },
                select: {
                    id: true
                }
            })
        ]);

        if (existingCategory || existingDict) {
            throw new BusinessException(AdminErrorCodes.DICT.CATEGORY_EXISTS);
        }
    }

    /**
     * 确保字典主记录使用的分类在分类表中存在。
     */
    private async ensureDictCategory(name: string) {
        await this.prisma.dictCategory.upsert({
            where: {
                name
            },
            create: {
                name
            },
            update: {}
        });
    }

    /**
     * 校验同一字典下字典项 key 是否可用。
     */
    private async ensureDictItemKeyAvailable(dictId: number, key: string, excludeId?: number) {
        const existing = await this.prisma.dictKey.findFirst({
            where: {
                dictId,
                key,
                ...(excludeId
                    ? {
                          id: {
                              not: excludeId
                          }
                      }
                    : {})
            },
            select: {
                id: true
            }
        });

        if (existing) {
            throw new BusinessException(AdminErrorCodes.DICT.ITEM_KEY_EXISTS);
        }
    }

    /**
     * 按下拉查询参数解析目标字典。
     */
    private async resolveDict(query: QueryDictOptionsDto) {
        const dict = query.dictId
            ? await this.prisma.dict.findUnique({
                  where: {
                      id: query.dictId
                  }
              })
            : await this.prisma.dict.findUnique({
                  where: {
                      category_value: {
                          category: query.category!,
                          value: query.dictValue!
                      }
                  }
              });

        if (!dict) {
            throw new BusinessException(AdminErrorCodes.DICT.NOT_FOUND);
        }

        return dict;
    }

    /**
     * 构造字典主表分页查询条件。
     */
    private buildDictWhere(query: QueryDictListDto): Prisma.DictWhereInput {
        const keywordConditions = query.keyword
            ? [
                  {
                      category: {
                          contains: query.keyword
                      }
                  },
                  {
                      name: {
                          contains: query.keyword
                      }
                  },
                  {
                      value: {
                          contains: query.keyword
                      }
                  },
                  {
                      description: {
                          contains: query.keyword
                      }
                  }
              ]
            : undefined;

        return {
            ...(query.category ? { category: query.category } : {}),
            ...(query.name ? { name: { contains: query.name } } : {}),
            ...(query.value ? { value: { contains: query.value } } : {}),
            ...(query.status !== undefined ? { status: query.status } : {}),
            ...(keywordConditions ? { OR: keywordConditions } : {})
        };
    }

    /**
     * 构造字典项分页查询条件。
     */
    private buildDictItemWhere(query: QueryDictItemListDto): Prisma.DictKeyWhereInput {
        const keywordConditions = query.keyword
            ? [
                  {
                      key: {
                          contains: query.keyword
                      }
                  },
                  {
                      value: {
                          contains: query.keyword
                      }
                  },
                  {
                      description: {
                          contains: query.keyword
                      }
                  }
              ]
            : undefined;

        return {
            ...(query.dictId ? { dictId: query.dictId } : {}),
            ...(query.category || query.dictValue
                ? {
                      dict: {
                          ...(query.category ? { category: query.category } : {}),
                          ...(query.dictValue ? { value: query.dictValue } : {})
                      }
                  }
                : {}),
            ...(query.key ? { key: { contains: query.key } } : {}),
            ...(query.value ? { value: { contains: query.value } } : {}),
            ...(query.status !== undefined ? { status: query.status } : {}),
            ...(keywordConditions ? { OR: keywordConditions } : {})
        };
    }

    /**
     * 将字典更新 DTO 转换为 Prisma 更新载荷，避免写入 undefined。
     */
    private toDictUpdateData(data: UpdateDictDto): Prisma.DictUncheckedUpdateInput {
        const updateData: Prisma.DictUncheckedUpdateInput = {};

        if (data.category !== undefined) updateData.category = data.category;
        if (data.name !== undefined) updateData.name = data.name;
        if (data.value !== undefined) updateData.value = data.value;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

        return updateData;
    }

    /**
     * 将 Prisma 计数字段整理为前端直接使用的 itemCount 字段。
     */
    private withDictItemCount(
        record: Prisma.DictGetPayload<{ include: { _count: { select: { dictKey: true } } } }>
    ) {
        const { _count, ...dict } = record;
        return {
            ...dict,
            itemCount: _count.dictKey
        };
    }

    /**
     * 将字典项更新 DTO 转换为 Prisma 更新载荷，避免写入 undefined。
     */
    private toDictItemUpdateData(data: UpdateDictItemDto): Prisma.DictKeyUncheckedUpdateInput {
        const updateData: Prisma.DictKeyUncheckedUpdateInput = {};

        if (data.dictId !== undefined) updateData.dictId = data.dictId;
        if (data.key !== undefined) updateData.key = data.key;
        if (data.value !== undefined) updateData.value = data.value;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.status !== undefined) updateData.status = data.status;
        if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

        return updateData;
    }
}
