import {
    CONFIRM_PASSWORD_POLICY_MESSAGE,
    NEW_PASSWORD_POLICY_MESSAGE,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_POLICY_MESSAGE
} from '@app/common';
import { ApiProperty } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// 登录
export const LoginSchema = z.object({
    username: z.string().min(1, '用户名不能为空'),
    password: z.string().min(1, '密码不能为空')
});
export class LoginDto extends createZodDto(LoginSchema) {
    @ApiProperty({ description: '用户名', example: 'admin' })
    declare username: string;

    @ApiProperty({ description: '密码', example: '123456' })
    declare password: string;
}

// 请求重置密码
export const RequestPasswordResetSchema = z.object({
    email: z.email('邮箱格式不正确')
});
export class RequestPasswordResetDto extends createZodDto(RequestPasswordResetSchema) {
    @ApiProperty({ description: '注册邮箱', example: 'user@example.com' })
    declare email: string;
}

// 验证重置 token
export const VerifyResetTokenSchema = z.object({
    token: z.string().min(1, 'token 不能为空')
});
export class VerifyResetTokenDto extends createZodDto(VerifyResetTokenSchema) {
    @ApiProperty({ description: '重置密码 token' })
    declare token: string;
}

// 执行密码重置
export const ResetPasswordSchema = z
    .object({
        token: z.string().min(1, 'token 不能为空'),
        newPassword: z
            .string()
            .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
            .max(PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE),
        confirmPassword: z
            .string()
            .min(PASSWORD_MIN_LENGTH, CONFIRM_PASSWORD_POLICY_MESSAGE)
            .max(PASSWORD_MAX_LENGTH, CONFIRM_PASSWORD_POLICY_MESSAGE)
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: '两次输入的密码不一致',
        path: ['confirmPassword']
    });
export class ResetPasswordDto extends createZodDto(ResetPasswordSchema) {
    @ApiProperty({ description: '重置密码 token' })
    declare token: string;

    @ApiProperty({ description: '新密码', minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
    declare newPassword: string;

    @ApiProperty({ description: '确认新密码', minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
    declare confirmPassword: string;
}

// 已登录用户修改密码
export const ChangePasswordSchema = z
    .object({
        oldPassword: z.string().min(1, '原密码不能为空'),
        newPassword: z
            .string()
            .min(PASSWORD_MIN_LENGTH, NEW_PASSWORD_POLICY_MESSAGE)
            .max(PASSWORD_MAX_LENGTH, NEW_PASSWORD_POLICY_MESSAGE),
        confirmPassword: z
            .string()
            .min(PASSWORD_MIN_LENGTH, CONFIRM_PASSWORD_POLICY_MESSAGE)
            .max(PASSWORD_MAX_LENGTH, CONFIRM_PASSWORD_POLICY_MESSAGE)
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: '两次输入的密码不一致',
        path: ['confirmPassword']
    });
export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {
    @ApiProperty({ description: '原密码' })
    declare oldPassword: string;

    @ApiProperty({ description: '新密码', minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
    declare newPassword: string;

    @ApiProperty({ description: '确认新密码', minLength: PASSWORD_MIN_LENGTH, maxLength: PASSWORD_MAX_LENGTH })
    declare confirmPassword: string;
}

// 批量检查当前账户权限点
export const CheckAccountPermissionsBatchSchema = z.object({
    permissions: z.array(z.string().min(1)).min(1).max(200)
});
export class CheckAccountPermissionsBatchDto extends createZodDto(CheckAccountPermissionsBatchSchema) {}
export type CheckAccountPermissionsBatchType = z.infer<typeof CheckAccountPermissionsBatchSchema>;

// 批量检查当前账户权限点响应
export const AccountPermissionBatchCheckResultSchema = z.object({
    results: z.array(
        z.object({
            permission: z.string(),
            allowed: z.boolean(),
            menuId: z.number().int().nullable(),
            menuStatus: z.string().nullable(),
            reason: z.string().nullable()
        })
    ),
    checkedAt: z.string()
});
export class AccountPermissionBatchCheckResultDto extends createZodDto(AccountPermissionBatchCheckResultSchema) {}
