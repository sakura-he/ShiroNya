import {
    MenuLayoutTypeEnum,
    MenuStatusEnum,
    MenuTypeEnum,
    PageTypeEnum,
    RbacPermissionKind,
    RbacStatus
} from '@app/prisma-admin/generated/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const StringIdArraySchema = z.array(z.string().trim().min(1)).default([]);

const NumberIdArraySchema = z.array(z.number().int().positive()).default([]);

const PaginationShape = {
    pageSize: z.number().min(1).optional(),
    page: z.number().min(1).optional()
};

function withPagination<T extends z.ZodRawShape>(shape: T) {
    return z
        .object({
            ...shape,
            ...PaginationShape
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

const NullableTextSchema = z.union([z.string().trim().min(1), z.null()]).optional();
const PermissionCodeSchema = z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/);
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
const NullableIntSchema = z
    .preprocess(
        (value) => {
            if (value === undefined || value === '') {
                return undefined;
            }
            return value;
        },
        z.union([z.number().int(), z.null()])
    )
    .optional();

export const QueryRbacUserListSchema = withPagination({
    keyword: z.string().optional(),
    username: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    remark: z.string().optional(),
    userGroupId: z.number().int().positive().optional(),
    banned: z.boolean().optional()
});
export class QueryRbacUserListDto extends createZodDto(QueryRbacUserListSchema) {}

export const QueryRbacRoleListSchema = withPagination({
    keyword: z.string().optional(),
    status: z.enum(RbacStatus).optional()
});
export class QueryRbacRoleListDto extends createZodDto(QueryRbacRoleListSchema) {}

export const CreateRbacRoleSchema = z.object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: NullableTextSchema,
    sort: z.number().int().optional(),
    isBuiltin: z.boolean().optional(),
    isSuperAdmin: z.boolean().optional(),
    status: z.enum(RbacStatus).optional()
});
export class CreateRbacRoleDto extends createZodDto(CreateRbacRoleSchema) {}

export const UpdateRbacRoleSchema = CreateRbacRoleSchema.partial();
export class UpdateRbacRoleDto extends createZodDto(UpdateRbacRoleSchema) {}

export const QueryRbacUserGroupListSchema = withPagination({
    keyword: z.string().optional(),
    status: z.enum(RbacStatus).optional()
});
export class QueryRbacUserGroupListDto extends createZodDto(QueryRbacUserGroupListSchema) {}

export const CreateRbacUserGroupSchema = z.object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: NullableTextSchema,
    sort: z.number().int().optional(),
    status: z.enum(RbacStatus).optional()
});
export class CreateRbacUserGroupDto extends createZodDto(CreateRbacUserGroupSchema) {}

export const UpdateRbacUserGroupSchema = CreateRbacUserGroupSchema.partial();
export class UpdateRbacUserGroupDto extends createZodDto(UpdateRbacUserGroupSchema) {}

export const QueryRbacPermissionListSchema = withPagination({
    code: z.string().trim().optional(),
    name: z.string().trim().optional(),
    description: z.string().trim().optional(),
    kind: z.enum(RbacPermissionKind).optional(),
    status: z.enum(RbacStatus).optional(),
    groupId: z.number().int().positive().optional()
});
export class QueryRbacPermissionListDto extends createZodDto(QueryRbacPermissionListSchema) {}

export const CreateRbacPermissionSchema = z.object({
    code: PermissionCodeSchema,
    name: z.string().trim().min(1),
    description: NullableTextSchema,
    kind: z.enum(RbacPermissionKind).optional(),
    groupId: NullablePositiveIntSchema,
    sort: z.number().int().optional(),
    isBuiltin: z.boolean().optional(),
    status: z.enum(RbacStatus).optional()
});
export class CreateRbacPermissionDto extends createZodDto(CreateRbacPermissionSchema) {}

export const UpdateRbacPermissionSchema = CreateRbacPermissionSchema.partial();
export class UpdateRbacPermissionDto extends createZodDto(UpdateRbacPermissionSchema) {}

export const SuggestRbacPermissionCodeSchema = z.object({
    permissionCode: PermissionCodeSchema
});
export class SuggestRbacPermissionCodeDto extends createZodDto(SuggestRbacPermissionCodeSchema) {}

export const CheckRbacPermissionSchema = z.object({
    code: PermissionCodeSchema
});
export class CheckRbacPermissionDto extends createZodDto(CheckRbacPermissionSchema) {}

export const QueryRbacPermissionGroupListSchema = withPagination({
    keyword: z.string().optional(),
    status: z.enum(RbacStatus).optional()
});
export class QueryRbacPermissionGroupListDto extends createZodDto(QueryRbacPermissionGroupListSchema) {}

export const CreateRbacPermissionGroupSchema = z.object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: NullableTextSchema,
    sort: z.number().int().optional(),
    status: z.enum(RbacStatus).optional()
});
export class CreateRbacPermissionGroupDto extends createZodDto(CreateRbacPermissionGroupSchema) {}

export const UpdateRbacPermissionGroupSchema = CreateRbacPermissionGroupSchema.partial();
export class UpdateRbacPermissionGroupDto extends createZodDto(UpdateRbacPermissionGroupSchema) {}

export const AssignRbacPermissionGroupRelationsSchema = z.object({
    groupId: z.number().int().positive(),
    permissionIds: z.array(z.number().int().positive()),
    menuIds: z.array(z.number().int().positive())
});
export class AssignRbacPermissionGroupRelationsDto extends createZodDto(AssignRbacPermissionGroupRelationsSchema) {}

export const AssignRbacUserRolesSchema = z.object({
    userId: z.string().trim().min(1),
    roleIds: z.array(z.number().int().positive())
});
export class AssignRbacUserRolesDto extends createZodDto(AssignRbacUserRolesSchema) {}

export const AssignRbacUserGroupsSchema = z.object({
    userId: z.string().trim().min(1),
    groupIds: z.array(z.number().int().positive())
});
export class AssignRbacUserGroupsDto extends createZodDto(AssignRbacUserGroupsSchema) {}

export const AssignRbacGroupMembersSchema = z.object({
    groupId: z.number().int().positive(),
    userIds: z.array(z.string().trim().min(1))
});
export class AssignRbacGroupMembersDto extends createZodDto(AssignRbacGroupMembersSchema) {}

export const AssignRbacGroupRolesSchema = z.object({
    groupId: z.number().int().positive(),
    roleIds: z.array(z.number().int().positive())
});
export class AssignRbacGroupRolesDto extends createZodDto(AssignRbacGroupRolesSchema) {}

export const AssignRbacRoleUsersSchema = z.object({
    roleId: z.number().int().positive(),
    userIds: z.array(z.string().trim().min(1))
});
export class AssignRbacRoleUsersDto extends createZodDto(AssignRbacRoleUsersSchema) {}

export const AssignRbacRoleGroupsSchema = z.object({
    roleId: z.number().int().positive(),
    groupIds: z.array(z.number().int().positive())
});
export class AssignRbacRoleGroupsDto extends createZodDto(AssignRbacRoleGroupsSchema) {}

export const AssignRbacRoleParentsSchema = z.object({
    roleId: z.number().int().positive(),
    parentRoleIds: z.array(z.number().int().positive())
});
export class AssignRbacRoleParentsDto extends createZodDto(AssignRbacRoleParentsSchema) {}

export const AssignRbacRolePermissionsSchema = z.object({
    roleId: z.number().int().positive(),
    permissionIds: z.array(z.number().int().positive())
});
export class AssignRbacRolePermissionsDto extends createZodDto(AssignRbacRolePermissionsSchema) {}

export const QueryRbacPermissionRolesSchema = withPagination({
    permissionId: z.number().int().positive(),
    keyword: z.string().optional(),
    name: z.string().trim().optional(),
    code: z.string().trim().optional(),
    description: z.string().trim().optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftRoleIds: NumberIdArraySchema
});
export class QueryRbacPermissionRolesDto extends createZodDto(QueryRbacPermissionRolesSchema) {}

export const AssignRbacPermissionRolesSchema = z.object({
    permissionId: z.number().int().positive(),
    roleIds: z.array(z.number().int().positive())
});
export class AssignRbacPermissionRolesDto extends createZodDto(AssignRbacPermissionRolesSchema) {}

export const CreateRbacMenuSchema = z.object({
    pid: NullablePositiveIntSchema,
    title: z.string().trim().min(1),
    description: NullableTextSchema,
    componentPath: NullableTextSchema,
    type: z.enum(MenuTypeEnum),
    groupId: NullablePositiveIntSchema,
    path: NullableTextSchema,
    icon: NullableTextSchema,
    order: NullableIntSchema,
    layout: z.enum(MenuLayoutTypeEnum).optional(),
    pageType: z.enum(PageTypeEnum).optional(),
    isResident: z.boolean().optional(),
    isCache: z.boolean().optional(),
    isMenuVisible: z.boolean().optional(),
    status: z.enum(MenuStatusEnum).optional(),
    showChildren: z.boolean().optional(),
    requiredPermissionCode: z.string().trim().min(1),
    componentName: NullableTextSchema,
    isTabVisible: z.boolean().optional()
});
export class CreateRbacMenuDto extends createZodDto(CreateRbacMenuSchema) {}

export const UpdateRbacMenuSchema = CreateRbacMenuSchema.partial();
export class UpdateRbacMenuDto extends createZodDto(UpdateRbacMenuSchema) {}

export const QueryRbacAssignableRolesSchema = withPagination({
    userId: z.string().trim().min(1).optional(),
    groupId: z.number().int().positive().optional(),
    roleId: z.number().int().positive().optional(),
    keyword: z.string().optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftRoleIds: NumberIdArraySchema
});
export class QueryRbacAssignableRolesDto extends createZodDto(QueryRbacAssignableRolesSchema) {}

export const QueryRbacAssignableUsersSchema = withPagination({
    roleId: z.number().int().positive().optional(),
    groupId: z.number().int().positive().optional(),
    keyword: z.string().optional(),
    assigned: z.boolean().optional(),
    banned: z.boolean().optional(),
    draftUserIds: StringIdArraySchema
});
export class QueryRbacAssignableUsersDto extends createZodDto(QueryRbacAssignableUsersSchema) {}

export const QueryRbacAssignableGroupsSchema = withPagination({
    userId: z.string().trim().min(1).optional(),
    roleId: z.number().int().positive().optional(),
    keyword: z.string().optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftGroupIds: NumberIdArraySchema
});
export class QueryRbacAssignableGroupsDto extends createZodDto(QueryRbacAssignableGroupsSchema) {}

export const QueryRbacAssignablePermissionsSchema = withPagination({
    roleId: z.number().int().positive(),
    keyword: z.string().optional(),
    kind: z.enum(RbacPermissionKind).optional(),
    assigned: z.boolean().optional(),
    status: z.enum(RbacStatus).optional(),
    draftPermissionIds: NumberIdArraySchema
});
export class QueryRbacAssignablePermissionsDto extends createZodDto(QueryRbacAssignablePermissionsSchema) {}

export const QueryRbacEffectiveUsersSchema = withPagination({
    roleId: z.number().int().positive(),
    keyword: z.string().optional(),
    banned: z.boolean().optional()
});
export class QueryRbacEffectiveUsersDto extends createZodDto(QueryRbacEffectiveUsersSchema) {}

export const QueryRbacMenuTreeSchema = z.object({
    keyword: z.string().optional(),
    type: z.enum(MenuTypeEnum).optional(),
    status: z.enum(MenuStatusEnum).optional(),
    groupId: z.number().int().positive().optional()
});
export class QueryRbacMenuTreeDto extends createZodDto(QueryRbacMenuTreeSchema) {}

export const QueryRbacMenuListSchema = withPagination({
    keyword: z.string().optional(),
    type: z.enum(MenuTypeEnum).optional(),
    status: z.enum(MenuStatusEnum).optional(),
    groupId: z.number().int().positive().optional()
});
export class QueryRbacMenuListDto extends createZodDto(QueryRbacMenuListSchema) {}

export const QueryRbacGroupMenusSchema = withPagination({
    groupId: z.number().int().positive(),
    keyword: z.string().optional(),
    type: z.enum(MenuTypeEnum).optional(),
    status: z.enum(MenuStatusEnum).optional()
});
export class QueryRbacGroupMenusDto extends createZodDto(QueryRbacGroupMenusSchema) {}

export const QueryRbacUserEffectiveStateSchema = z.object({
    userId: z.string().trim().min(1)
});
export class QueryRbacUserEffectiveStateDto extends createZodDto(QueryRbacUserEffectiveStateSchema) {}

export const RbacRebuildSchema = z.object({
    userIds: z.array(z.string().trim().min(1)).optional()
});
export class RbacRebuildDto extends createZodDto(RbacRebuildSchema) {}
