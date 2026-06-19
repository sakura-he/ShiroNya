import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DictKeySchema } from '@app/prisma-app/generated/zod/schemas/models/DictKey.schema';
import { DictSchema } from '@app/prisma-app/generated/zod/schemas/models/Dict.schema';

export const DictEnabledStatus = 1;
export const DictDisabledStatus = 2;

const DictStatusSchema = z.union([z.literal(DictEnabledStatus), z.literal(DictDisabledStatus)]);
const NullableTextSchema = z.string().trim().min(1).max(191).nullable().optional();
const RequiredTextSchema = z.string().trim().min(1).max(191);
const PaginationSchema = z.object({
    total: z.number(),
    totalPages: z.number(),
    pageSize: z.number(),
    page: z.number()
});

export const DictRecordSchema = DictSchema.extend({
    itemCount: z.number().optional()
});
export class DictRecordDto extends createZodDto(DictRecordSchema) {}

export const DictCategorySchema = z.object({
    id: z.number().int(),
    name: z.string(),
    createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'Invalid ISO datetime'),
    updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'Invalid ISO datetime')
});
export class DictCategoryDto extends createZodDto(DictCategorySchema) {}

export const DictItemRecordSchema = DictKeySchema.extend({
    dict: DictSchema.optional()
});
export class DictItemRecordDto extends createZodDto(DictItemRecordSchema) {}

export const DictDetailSchema = DictRecordSchema.extend({
    dictKey: z.array(DictKeySchema)
});
export class DictDetailDto extends createZodDto(DictDetailSchema) {}

export const DictListSchema = z.object({
    records: z.array(DictRecordSchema),
    pagination: PaginationSchema
});
export class DictListDto extends createZodDto(DictListSchema) {}

export const DictItemListSchema = z.object({
    records: z.array(DictItemRecordSchema),
    pagination: PaginationSchema
});
export class DictItemListDto extends createZodDto(DictItemListSchema) {}

export const DictOptionSchema = z.object({
    label: z.string(),
    value: z.string(),
    key: z.string(),
    description: z.string().nullable(),
    status: z.number(),
    sortOrder: z.number()
});
export class DictOptionListDto extends createZodDto(z.array(DictOptionSchema)) {}

export const DictCategoryOptionSchema = z.object({
    label: z.string(),
    value: z.string(),
    count: z.number()
});
export class DictCategoryOptionListDto extends createZodDto(z.array(DictCategoryOptionSchema)) {}

export const DictStatusOptionSchema = z.object({
    label: z.string(),
    value: z.number(),
    isEnabled: z.boolean()
});
export class DictStatusOptionListDto extends createZodDto(z.array(DictStatusOptionSchema)) {}

export const DictNullDtoSchema = z.null();
export const DictNullDto = createZodDto(DictNullDtoSchema);

export const QueryDictListSchema = z.object({
    category: z.string().trim().optional(),
    name: z.string().trim().optional(),
    value: z.string().trim().optional(),
    keyword: z.string().trim().optional(),
    status: DictStatusSchema.optional(),
    pageSize: z.number().int().min(1).max(100).default(10),
    page: z.number().int().min(1).default(1)
});
export class QueryDictListDto extends createZodDto(QueryDictListSchema) {}

export const QueryDictCategoryOptionsSchema = z.object({
    keyword: z.string().trim().optional()
});
export class QueryDictCategoryOptionsDto extends createZodDto(QueryDictCategoryOptionsSchema) {}

export const QueryDictDetailSchema = z.object({
    id: z.coerce.number().int().positive()
});
export class QueryDictDetailDto extends createZodDto(QueryDictDetailSchema) {}

export const CreateDictCategorySchema = z
    .object({
        name: RequiredTextSchema
    })
    .strict();
export class CreateDictCategoryDto extends createZodDto(CreateDictCategorySchema) {}

export const DeleteDictCategorySchema = z
    .object({
        name: RequiredTextSchema
    })
    .strict();
export class DeleteDictCategoryDto extends createZodDto(DeleteDictCategorySchema) {}

export const CreateDictSchema = z
    .object({
        category: RequiredTextSchema,
        name: RequiredTextSchema,
        value: RequiredTextSchema,
        description: NullableTextSchema,
        status: DictStatusSchema,
        sortOrder: z.number().int()
    })
    .strict();
export class CreateDictDto extends createZodDto(CreateDictSchema) {}

export const UpdateDictSchema = CreateDictSchema.partial()
    .extend({
        id: z.number().int().positive()
    })
    .strict();
export class UpdateDictDto extends createZodDto(UpdateDictSchema) {}

export const DeleteDictSchema = z
    .object({
        id: z.number().int().positive()
    })
    .strict();
export class DeleteDictDto extends createZodDto(DeleteDictSchema) {}

export const UpdateDictStatusSchema = z
    .object({
        id: z.number().int().positive(),
        status: DictStatusSchema,
        cascadeItems: z.boolean().optional()
    })
    .strict();
export class UpdateDictStatusDto extends createZodDto(UpdateDictStatusSchema) {}

export const QueryDictItemListSchema = z.object({
    dictId: z.number().int().positive().optional(),
    category: z.string().trim().optional(),
    dictValue: z.string().trim().optional(),
    key: z.string().trim().optional(),
    value: z.string().trim().optional(),
    keyword: z.string().trim().optional(),
    status: DictStatusSchema.optional(),
    pageSize: z.number().int().min(1).max(100).default(10),
    page: z.number().int().min(1).default(1)
});
export class QueryDictItemListDto extends createZodDto(QueryDictItemListSchema) {}

export const QueryDictOptionsSchema = z
    .object({
        dictId: z.number().int().positive().optional(),
        category: z.string().trim().optional(),
        dictValue: z.string().trim().optional(),
        enabledOnly: z.boolean().default(true)
    })
    .refine((data) => data.dictId !== undefined || Boolean(data.category && data.dictValue), {
        message: 'dictId 或 category + dictValue 必须至少提供一种',
        path: ['dictId']
    });
export class QueryDictOptionsDto extends createZodDto(QueryDictOptionsSchema) {}

export const CreateDictItemSchema = z
    .object({
        dictId: z.number().int().positive(),
        key: RequiredTextSchema,
        value: RequiredTextSchema,
        description: NullableTextSchema,
        status: DictStatusSchema,
        sortOrder: z.number().int()
    })
    .strict();
export class CreateDictItemDto extends createZodDto(CreateDictItemSchema) {}

export const UpdateDictItemSchema = CreateDictItemSchema.partial()
    .extend({
        id: z.number().int().positive()
    })
    .strict();
export class UpdateDictItemDto extends createZodDto(UpdateDictItemSchema) {}

export const DeleteDictItemSchema = z
    .object({
        id: z.number().int().positive()
    })
    .strict();
export class DeleteDictItemDto extends createZodDto(DeleteDictItemSchema) {}

export const UpdateDictItemStatusSchema = z
    .object({
        id: z.number().int().positive(),
        status: DictStatusSchema
    })
    .strict();
export class UpdateDictItemStatusDto extends createZodDto(UpdateDictItemStatusSchema) {}
