import {
    MenuLayoutTypeEnum,
    MenuStatusEnum,
    MenuTypeEnum,
    PageTypeEnum,
    RbacStatus
} from '@app/prisma-app/generated/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const NumberIdArraySchema = z.array(z.number().int().positive()).default([]);

const RelationTablePaginationSchema = {
    pageSize: z.number().min(1).optional(),
    page: z.number().min(1).optional()
};

const NullableIconSchema = z.string().min(1).nullable().optional();
const NullablePositiveIntSchema = z
    .preprocess(
        (value) => {
            if (value === undefined || value === '') {
                return undefined;
            }
            return value;
        },
        z.union([z.number().int().positive(), z.null()])
    )
    .optional();

function withRelationPagination<T extends z.ZodRawShape>(shape: T) {
    return z
        .object({
            ...shape,
            ...RelationTablePaginationSchema
        })
        .refine(
            (data: { pageSize?: unknown; page?: unknown }) =>
                (data.pageSize === undefined && data.page === undefined) ||
                (data.pageSize !== undefined && data.page !== undefined),
            {
                message: 'Both pageSize and page must be provided together or omitted together.',
                path: ['pageSize', 'page']
            }
        );
}

const CatalogSchema = z.object({
    type: z.literal(MenuTypeEnum.Catalog),
    pid: z.number().nullable().optional(),
    title: z.string().min(1),
    description: z.string().min(1).nullable().optional(),
    requiredPermissionCode: z.string().min(1),
    groupId: NullablePositiveIntSchema,
    path: z.string().min(1).nullable().optional(),
    icon: NullableIconSchema,
    order: z.number().optional(),
    isMenuVisible: z.boolean(),
    status: z.enum(MenuStatusEnum).optional(),
    showChildren: z.boolean()
});

const PageSchema = z.object({
    type: z.literal(MenuTypeEnum.Page),
    pid: z.number(),
    title: z.string().min(1),
    description: z.string().min(1).nullable().optional(),
    componentPath: z.string().min(1),
    componentName: z.string().min(1),
    requiredPermissionCode: z.string().min(1),
    groupId: NullablePositiveIntSchema,
    path: z.string().min(1).nullable().optional(),
    icon: NullableIconSchema,
    order: z.number().optional(),
    layout: z.enum(MenuLayoutTypeEnum),
    pageType: z.enum(PageTypeEnum),
    isResident: z.boolean(),
    isCache: z.boolean(),
    isMenuVisible: z.boolean(),
    isTabVisible: z.boolean(),
    status: z.enum(MenuStatusEnum).optional()
});

const ButtonSchema = z.object({
    type: z.literal(MenuTypeEnum.Button),
    pid: z.number(),
    title: z.string().min(1),
    description: z.string().min(1).nullable().optional(),
    requiredPermissionCode: z.string().min(1),
    groupId: NullablePositiveIntSchema,
    icon: NullableIconSchema,
    order: z.number().optional(),
    status: z.enum(MenuStatusEnum).optional()
});

// 为 Swagger 生成单独的 DTO class
export class CreateCatalogDto extends createZodDto(CatalogSchema) {}
export class CreatePageDto extends createZodDto(PageSchema) {}
export class CreateButtonDto extends createZodDto(ButtonSchema) {}

// 运行时验证用的 schema
export const CreateMenuSchema = z.discriminatedUnion('type', [CatalogSchema, PageSchema, ButtonSchema]);
export type CreateMenuDto = z.infer<typeof CreateMenuSchema>;

// 更新菜单
const PartialCatalogSchema = CatalogSchema.extend({
    id: z.number(),
    type: z.literal(MenuTypeEnum.Catalog)
}).partial({
    pid: true,
    title: true,
    description: true,
    requiredPermissionCode: true,
    groupId: true,
    path: true,
    icon: true,
    order: true,
    isMenuVisible: true,
    status: true,
    showChildren: true
});

const PartialPageSchema = PageSchema.extend({
    id: z.number(),
    type: z.literal(MenuTypeEnum.Page)
}).partial({
    pid: true,
    title: true,
    description: true,
    componentPath: true,
    componentName: true,
    requiredPermissionCode: true,
    groupId: true,
    path: true,
    icon: true,
    order: true,
    layout: true,
    pageType: true,
    isResident: true,
    isCache: true,
    isMenuVisible: true,
    isTabVisible: true,
    status: true
});

const PartialButtonSchema = ButtonSchema.extend({
    id: z.number(),
    type: z.literal(MenuTypeEnum.Button)
}).partial({
    pid: true,
    title: true,
    description: true,
    requiredPermissionCode: true,
    groupId: true,
    icon: true,
    order: true,
    status: true
});

// 为 Swagger 生成单独的 DTO class
export class UpdateCatalogDto extends createZodDto(PartialCatalogSchema) {}
export class UpdatePageDto extends createZodDto(PartialPageSchema) {}
export class UpdateButtonDto extends createZodDto(PartialButtonSchema) {}

// 运行时验证用的 schema
export const UpdateMenuSchema = z.discriminatedUnion('type', [
    PartialCatalogSchema,
    PartialPageSchema,
    PartialButtonSchema
]);
export type UpdateMenuDto = z.infer<typeof UpdateMenuSchema>;

// 获取所有菜单(分页)
export const QueryMenuListSchema = z
    .object({
        keyword: z.string().optional(),
        name: z.string().optional(),
        title: z.string().trim().optional(),
        requiredPermissionCode: z.string().trim().optional(),
        path: z.string().trim().optional(),
        status: z.enum(MenuStatusEnum).optional(),
        type: z.enum(MenuTypeEnum).optional(),
        groupId: z.number().int().positive().optional(),
        createdAt: z.array(z.string().datetime()).length(2).optional(),
        pageSize: z.number().min(1).optional(),
        page: z.number().min(1).optional()
    })
    .refine(
        (data: { pageSize?: unknown; page?: unknown }) =>
            (data.pageSize === undefined && data.page === undefined) ||
            (data.pageSize !== undefined && data.page !== undefined),
        {
            message: 'Both pageSize and page must be provided together or omitted together.',
            path: ['pageSize', 'page']
        }
    );
export class QueryMenuListDto extends createZodDto(QueryMenuListSchema) {}

export const QueryMenuTreeSchema = z.object({
    keyword: z.string().optional(),
    name: z.string().optional(),
    status: z.enum(MenuStatusEnum).optional(),
    type: z.enum(MenuTypeEnum).optional(),
    groupId: z.number().int().positive().optional()
});
export class QueryMenuTreeDto extends createZodDto(QueryMenuTreeSchema) {}

export const AssignMenuRoleSchema = z.object({
    menuId: z.number().int().positive(),
    roleIds: z.array(z.number().int().positive())
});
export class AssignMenuRoleDto extends createZodDto(AssignMenuRoleSchema) {}

export const QueryMenuRelationRoleSchema = withRelationPagination({
    menuId: z.number().int().positive(),
    keyword: z.string().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftRoleIds: NumberIdArraySchema
});
export class QueryMenuRelationRoleDto extends createZodDto(QueryMenuRelationRoleSchema) {}

export const QueryMenuVisibleUserSchema = withRelationPagination({
    menuId: z.number().int().positive(),
    keyword: z.string().optional(),
    id: z.string().trim().optional(),
    username: z.string().trim().optional(),
    name: z.string().trim().optional(),
    email: z.string().trim().optional(),
    banned: z.boolean().optional()
});
export class QueryMenuVisibleUserDto extends createZodDto(QueryMenuVisibleUserSchema) {}
