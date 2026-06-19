import { RbacPermissionKind, RbacStatus } from '@app/prisma-app/generated/client';
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

// 创建角色
export const CreateRoleDataSchema = z.object({
    name: z.string().trim().min(1),
    code: z.string().trim().min(1),
    description: z.union([z.string().trim().min(1), z.null()]).optional(),
    sort: z.number().int().optional(),
    isBuiltin: z.boolean().optional(),
    isSuperAdmin: z.boolean().optional(),
    status: z.enum(RbacStatus).optional()
});
export class CreateRoleDataDto extends createZodDto(CreateRoleDataSchema) {}
export class CreateRoleDto extends createZodDto(CreateRoleDataSchema) {}
// 更新角色信息
export const UpdateRoleDataSchema = z.object({
    name: z.string().trim().min(1).optional(),
    code: z.string().trim().min(1).optional(),
    description: z.union([z.string().trim().min(1), z.null()]).optional(),
    sort: z.number().int().optional(),
    isBuiltin: z.boolean().optional(),
    isSuperAdmin: z.boolean().optional(),
    status: z.enum(RbacStatus).optional()
});
export class UpdateRoleDataDto extends createZodDto(UpdateRoleDataSchema) {}
export class UpdateRoleDto extends createZodDto(UpdateRoleDataSchema) {}
// 分页查询所有角色
export const QueryRoleListSchema = z
    .object({
        name: z.string().optional(),
        code: z.string().optional(),
        keyword: z.string().optional(),
        status: z.enum(RbacStatus).optional(),
        // 首先验证是否为 string 类型,或者 undefind
        // 如果为 string,进行转换并验证是否为 string[]且长度为 2
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
export class QueryRoleListDto extends createZodDto(QueryRoleListSchema) {}

// 分配角色直接用户
export const AssignRoleUserSchema = z.object({
    roleId: z.number().int().positive(),
    userIds: z.array(z.string().trim().min(1))
});
export class AssignRoleUserDto extends createZodDto(AssignRoleUserSchema) {}

// 分配角色用户组
export const AssignRoleUserGroupSchema = z.object({
    roleId: z.number().int().positive(),
    userGroupIds: z.array(z.number().int().positive())
});
export class AssignRoleUserGroupDto extends createZodDto(AssignRoleUserGroupSchema) {}

export const QueryRoleAssignableUserSchema = withRelationPagination({
    roleId: z.number().int().positive(),
    keyword: z.string().optional(),
    id: z.string().trim().optional(),
    username: z.string().trim().optional(),
    name: z.string().trim().optional(),
    email: z.string().trim().optional(),
    assigned: z.boolean().optional(),
    banned: z.boolean().optional(),
    draftUserIds: StringIdArraySchema
});
export class QueryRoleAssignableUserDto extends createZodDto(QueryRoleAssignableUserSchema) {}

export const QueryRoleAssignableUserGroupSchema = withRelationPagination({
    roleId: z.number().int().positive(),
    keyword: z.string().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftUserGroupIds: NumberIdArraySchema
});
export class QueryRoleAssignableUserGroupDto extends createZodDto(QueryRoleAssignableUserGroupSchema) {}

export const QueryRoleAssignableParentSchema = withRelationPagination({
    roleId: z.number().int().positive(),
    keyword: z.string().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftRoleIds: NumberIdArraySchema
});
export class QueryRoleAssignableParentDto extends createZodDto(QueryRoleAssignableParentSchema) {}

export const QueryRoleAssignablePermissionSchema = withRelationPagination({
    roleId: z.number().int().positive(),
    keyword: z.string().optional(),
    code: z.string().trim().optional(),
    name: z.string().trim().optional(),
    description: z.string().trim().optional(),
    kind: z.enum(RbacPermissionKind).optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftPermissionIds: NumberIdArraySchema
});
export class QueryRoleAssignablePermissionDto extends createZodDto(QueryRoleAssignablePermissionSchema) {}

export const AssignRoleParentSchema = z.object({
    roleId: z.number().int().positive(),
    parentRoleIds: z.array(z.number().int().positive())
});
export class AssignRoleParentDto extends createZodDto(AssignRoleParentSchema) {}

export const AssignRolePermissionSchema = z.object({
    roleId: z.number().int().positive(),
    permissionIds: z.array(z.number().int().positive())
});
export class AssignRolePermissionDto extends createZodDto(AssignRolePermissionSchema) {}

export const QueryRoleEffectiveUserSchema = withRelationPagination({
    roleId: z.number().int().positive(),
    keyword: z.string().optional(),
    id: z.string().trim().optional(),
    username: z.string().trim().optional(),
    name: z.string().trim().optional(),
    email: z.string().trim().optional(),
    banned: z.boolean().optional()
});
export class QueryRoleEffectiveUserDto extends createZodDto(QueryRoleEffectiveUserSchema) {}
