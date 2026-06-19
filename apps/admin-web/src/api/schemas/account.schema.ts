import { z } from "zod";
import {
    CONFIRM_PASSWORD_POLICY_MESSAGE,
    NEW_PASSWORD_POLICY_MESSAGE,
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_POLICY_MESSAGE,
} from "@/utils/passwordPolicy";

// 登录参数
export const LoginMethodSchema = z.enum(["account-password", "phone-password", "phone-code"]);
export type LoginMethod = z.infer<typeof LoginMethodSchema>;

export const LoginParamsSchema = z.object({
    account: z.string().min(1, "账号不能为空").optional(),
    phoneNumber: z.string().min(1, "手机号不能为空").optional(),
    password: z.string().min(1, "密码不能为空").optional(),
    code: z.string().min(1, "验证码不能为空").optional(),
    loginMethod: LoginMethodSchema,
    rememberMe: z.boolean().optional(),
});
export type LoginParams = z.infer<typeof LoginParamsSchema>;

// 请求密码重置参数
export const RequestResetParamsSchema = z.object({
    email: z.string().email("请输入有效的邮箱地址"),
});
export type RequestResetParams = z.infer<typeof RequestResetParamsSchema>;

// 验证重置 token 参数
export const VerifyResetParamsSchema = z.object({
    token: z.string().min(1, "Token 不能为空"),
});
export type VerifyResetParams = z.infer<typeof VerifyResetParamsSchema>;

// 重置密码参数
export const ResetPasswordParamsSchema = z
    .object({
        token: z.string().min(1, "Token 不能为空"),
        newPassword: z
            .string()
            .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE)
            .max(PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE),
        confirmPassword: z
            .string()
            .min(PASSWORD_MIN_LENGTH, CONFIRM_PASSWORD_POLICY_MESSAGE)
            .max(PASSWORD_MAX_LENGTH, CONFIRM_PASSWORD_POLICY_MESSAGE),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "两次输入的密码不一致",
        path: ["confirmPassword"],
    });
export type ResetPasswordParams = z.infer<typeof ResetPasswordParamsSchema>;

// 修改密码参数（已登录用户）
export const ChangePasswordParamsSchema = z
    .object({
        oldPassword: z.string().min(1, "原密码不能为空"),
        newPassword: z
            .string()
            .min(PASSWORD_MIN_LENGTH, NEW_PASSWORD_POLICY_MESSAGE)
            .max(PASSWORD_MAX_LENGTH, NEW_PASSWORD_POLICY_MESSAGE),
        confirmPassword: z
            .string()
            .min(PASSWORD_MIN_LENGTH, CONFIRM_PASSWORD_POLICY_MESSAGE)
            .max(PASSWORD_MAX_LENGTH, CONFIRM_PASSWORD_POLICY_MESSAGE),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: "两次输入的密码不一致",
        path: ["confirmPassword"],
    });
export type ChangePasswordParams = z.infer<typeof ChangePasswordParamsSchema>;
