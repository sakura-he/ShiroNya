import { request } from "./index";
import type {
    RequestResetParams,
    VerifyResetParams,
    ResetPasswordParams,
    ChangePasswordParams,
} from "./schemas/account.schema";

export type AccountNavigationDto = {
    menus: any[];
    permissions: string[];
    userStateVersion: string;
};

// 获取当前用户前端启动所需的菜单、权限和状态版本
export function getAccountNavigationApi() {
    return request<AccountNavigationDto>({
        url: "/account/navigation",
        method: "get",
    });
}

// 请求密码重置（发送重置邮件）
export function requestPasswordResetApi(data: RequestResetParams) {
    return request({
        url: "/account/request_reset",
        method: "post",
        data,
    });
}

// 验证重置 token
export function verifyResetTokenApi(data: VerifyResetParams) {
    return request({
        url: "/account/verify_reset",
        method: "post",
        data,
    });
}

// 重置密码（使用 token）
export function resetPasswordApi(data: ResetPasswordParams) {
    return request({
        url: "/account/reset_password",
        method: "post",
        data,
    });
}

// 修改密码（已登录用户）
export function changePasswordApi(data: ChangePasswordParams) {
    return request({
        url: "/account/change_password",
        method: "post",
        data,
    });
}
