import { MenuStatusEnum, MenuTypeEnum, RbacStatus } from '@app/prisma-admin/generated/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const StringIdArraySchema = z.array(z.string().trim().min(1)).default([]);

const NumberIdArraySchema = z.array(z.number().int().positive()).default([]);

const RelationTablePaginationSchema = {
    pageSize: z.number().min(1).optional(),
    page: z.number().min(1).optional()
};

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

export const CreateUserGroupSchema = z.object({
    name: z.string().trim().min(1),
    code: z.string().trim().min(1),
    description: z.union([z.string().trim().min(1), z.null()]).optional(),
    sort: z.number().int().optional(),
    status: z.enum(RbacStatus).optional()
});
export class CreateUserGroupDto extends createZodDto(CreateUserGroupSchema) {}

export const UpdateUserGroupSchema = z.object({
    name: z.string().trim().min(1).optional(),
    code: z.string().trim().min(1).optional(),
    description: z.union([z.string().trim().min(1), z.null()]).optional(),
    sort: z.number().int().optional(),
    status: z.enum(RbacStatus).optional()
});
export class UpdateUserGroupDto extends createZodDto(UpdateUserGroupSchema) {}

export const AssignUserGroupMemberSchema = z.object({
    groupId: z.number().int().positive(),
    userIds: z.array(z.string().trim().min(1))
});
export class AssignUserGroupMemberDto extends createZodDto(AssignUserGroupMemberSchema) {}

export const AssignUserGroupRoleSchema = z.object({
    groupId: z.number().int().positive(),
    roleIds: z.array(z.number().int().positive())
});
export class AssignUserGroupRoleDto extends createZodDto(AssignUserGroupRoleSchema) {}

export const QueryUserGroupListSchema = z
    .object({
        name: z.string().optional(),
        keyword: z.string().optional(),
        code: z.string().optional(),
        status: z.enum(RbacStatus).optional(),
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
export class QueryUserGroupListDto extends createZodDto(QueryUserGroupListSchema) {}

export const QueryUserGroupRelationMemberSchema = withRelationPagination({
    groupId: z.number().int().positive(),
    keyword: z.string().optional(),
    id: z.string().trim().optional(),
    username: z.string().trim().optional(),
    name: z.string().trim().optional(),
    email: z.string().trim().optional(),
    assigned: z.boolean().optional(),
    banned: z.boolean().optional(),
    draftUserIds: StringIdArraySchema
});
export class QueryUserGroupRelationMemberDto extends createZodDto(QueryUserGroupRelationMemberSchema) {}

export const QueryUserGroupRelationRoleSchema = withRelationPagination({
    groupId: z.number().int().positive(),
    keyword: z.string().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftRoleIds: NumberIdArraySchema
});
export class QueryUserGroupRelationRoleDto extends createZodDto(QueryUserGroupRelationRoleSchema) {}

export const QueryUserGroupRelationMenuSchema = withRelationPagination({
    groupId: z.number().int().positive(),
    keyword: z.string().optional(),
    title: z.string().trim().optional(),
    requiredPermissionCode: z.string().trim().optional(),
    path: z.string().trim().optional(),
    type: z.enum(MenuTypeEnum).optional(),
    status: z.enum(MenuStatusEnum).optional()
});
export class QueryUserGroupRelationMenuDto extends createZodDto(QueryUserGroupRelationMenuSchema) {}
