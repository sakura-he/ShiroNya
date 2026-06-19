import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE } from '@app/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const NullableTextSchema = z.union([z.string().trim().min(1), z.null()]);
const BusinessUserStatusSchema = z.number().int().min(0).max(1);
const NumberIdArraySchema = z.array(z.number().int().positive()).default([]);

export const QueryUserListSchema = z
    .object({
        id: z.string().trim().optional(),
        name: z.string().trim().optional(),
        nickname: z.string().trim().optional(),
        email: z.string().trim().optional(),
        phoneNumber: z.string().trim().optional(),
        status: BusinessUserStatusSchema.optional(),
        roleId: z.number().int().positive().optional(),
        emailVerified: z.boolean().optional(),
        phoneNumberVerified: z.boolean().optional(),
        createdAtStart: z.string().trim().optional(),
        createdAtEnd: z.string().trim().optional(),
        updatedAtStart: z.string().trim().optional(),
        updatedAtEnd: z.string().trim().optional(),
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

export const CreateUserSchema = z.object({
    name: z.string().trim().min(1),
    email: z.string().email(),
    phoneNumber: NullableTextSchema.optional(),
    password: z
        .string()
        .trim()
        .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
        .max(PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE),
    nickname: NullableTextSchema.optional(),
    avatar: NullableTextSchema.optional(),
    status: BusinessUserStatusSchema.default(1),
    roleIds: NumberIdArraySchema
});
export class CreateUserDto extends createZodDto(CreateUserSchema) {}

export const UpdateUserSchema = z.object({
    name: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    phoneNumber: NullableTextSchema.optional(),
    nickname: NullableTextSchema.optional(),
    avatar: NullableTextSchema.optional(),
    status: BusinessUserStatusSchema.optional(),
    roleIds: NumberIdArraySchema.optional()
});
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}

export const UpdateUserStatusSchema = z
    .object({
        id: z.string().trim().min(1),
        status: BusinessUserStatusSchema,
        banReason: z.string().trim().min(1).optional()
    })
    .superRefine((data, context) => {
        if (data.status === 0 && !data.banReason) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: '禁用原因不能为空',
                path: ['banReason']
            });
        }
    });
export class UpdateUserStatusDto extends createZodDto(UpdateUserStatusSchema) {}

export const ResetUserPasswordSchema = z.object({
    id: z.string().trim().min(1),
    password: z
        .string()
        .trim()
        .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
        .max(PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE)
});
export class ResetUserPasswordDto extends createZodDto(ResetUserPasswordSchema) {}

export const DeleteUserSchema = z.object({
    id: z.string().trim().min(1),
    deleteReason: z.string().trim().min(1, '删除原因不能为空')
});
export class DeleteUserDto extends createZodDto(DeleteUserSchema) {}
