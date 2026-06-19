import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE } from '@app/common';
import { MenuStatusEnum, MenuTypeEnum, RbacStatus } from '@app/prisma-app/generated/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const RelationKindSchema = z.enum(['direct', 'effective', 'inherited']);

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

export const CreateUserSchema = z.object({
    email: z.string().email().nullable(),
    username: z.string().trim().min(1),
    password: z
        .string()
        .trim()
        .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
        .max(PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE),
    name: z.string().trim().min(1),
    image: z.string().trim().url().nullable(),
    phoneNumber: z.union([z.string().trim().min(1), z.null()]),
    remark: z.union([z.string().trim().min(1), z.null()]),
    banned: z.boolean()
});
export class CreateUserDto extends createZodDto(CreateUserSchema) {}

export const UpdateUserSchema = z.object({
    email: z.string().email().nullable().optional(),
    username: z.string().trim().min(1).optional(),
    password: z
        .string()
        .trim()
        .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
        .max(PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE)
        .nullable()
        .optional(),
    name: z.string().trim().min(1).optional(),
    image: z.string().trim().url().nullable().optional(),
    phoneNumber: z.union([z.string().trim().min(1), z.null()]).optional(),
    remark: z.union([z.string().trim().min(1), z.null()]).optional(),
    banned: z.boolean().optional()
});
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}

export const ResetUserPasswordSchema = z.object({
    id: z.string().min(1),
    password: z
        .string()
        .trim()
        .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
        .max(PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE)
});
export class ResetUserPasswordDto extends createZodDto(ResetUserPasswordSchema) {}

export const UserIdOnlySchema = z.object({
    id: z.string().min(1)
});
export class UserIdOnlyDto extends createZodDto(UserIdOnlySchema) {}

export const BanUserSchema = z.object({
    id: z.string().min(1),
    banReason: z.string().trim().min(1).optional()
});
export class BanUserDto extends createZodDto(BanUserSchema) {}

export const RevokeUserSessionSchema = z.object({
    sessionToken: z.string().min(1)
});
export class RevokeUserSessionDto extends createZodDto(RevokeUserSessionSchema) {}

export const QueryUserSessionsSchema = withRelationPagination({
    id: z.string().min(1)
});
export class QueryUserSessionsDto extends createZodDto(QueryUserSessionsSchema) {}

export const QueryUserListSchema = z
    .object({
        username: z.string().optional(),
        name: z.string().optional(),
        email: z.string().optional(),
        banned: z.boolean().optional(),
        remark: z.string().optional(),
        phoneNumber: z.string().optional(),
        userGroupId: z.number().int().positive().optional(),
        createdAt: z.array(z.iso.datetime()).length(2).optional(),
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
export class QueryUserListDto extends createZodDto(QueryUserListSchema) {}

export const QueryUserRelationRoleSchema = withRelationPagination({
    userId: z.string().trim().min(1),
    relation: RelationKindSchema,
    keyword: z.string().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    status: z.enum(RbacStatus).optional()
});
export class QueryUserRelationRoleDto extends createZodDto(QueryUserRelationRoleSchema) {}

export const QueryUserRelationUserGroupSchema = withRelationPagination({
    userId: z.string().trim().min(1),
    keyword: z.string().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    status: z.enum(RbacStatus).optional()
});
export class QueryUserRelationUserGroupDto extends createZodDto(QueryUserRelationUserGroupSchema) {}

export const QueryUserRelationMenuSchema = withRelationPagination({
    userId: z.string().trim().min(1),
    keyword: z.string().optional(),
    title: z.string().trim().optional(),
    requiredPermissionCode: z.string().trim().optional(),
    path: z.string().trim().optional(),
    type: z.enum(MenuTypeEnum).optional(),
    status: z.enum(MenuStatusEnum).optional()
});
export class QueryUserRelationMenuDto extends createZodDto(QueryUserRelationMenuSchema) {}

export const QueryUserAssignableRoleSchema = withRelationPagination({
    userId: z.string().trim().min(1),
    keyword: z.string().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftRoleIds: NumberIdArraySchema
});
export class QueryUserAssignableRoleDto extends createZodDto(QueryUserAssignableRoleSchema) {}

export const QueryUserAssignableUserGroupSchema = withRelationPagination({
    userId: z.string().trim().min(1),
    keyword: z.string().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftGroupIds: NumberIdArraySchema
});
export class QueryUserAssignableUserGroupDto extends createZodDto(QueryUserAssignableUserGroupSchema) {}

export const AssignUserRolesSchema = z.object({
    userId: z.string().trim().min(1),
    roleIds: z.array(z.number().int().positive())
});
export class AssignUserRolesDto extends createZodDto(AssignUserRolesSchema) {}

export const AssignUserGroupsSchema = z.object({
    userId: z.string().trim().min(1),
    groupIds: z.array(z.number().int().positive())
});
export class AssignUserGroupsDto extends createZodDto(AssignUserGroupsSchema) {}
