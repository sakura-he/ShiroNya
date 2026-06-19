export type RbacPermissionCodeParts = {
    permissionCode: string;
};

export const RBAC_PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/;

/**
 * RBAC 的 code 是给前端展示、菜单、按钮、审计和后端守卫共同使用的稳定 token。
 */
export function suggestRbacPermissionCode(parts: RbacPermissionCodeParts): string {
    return parts.permissionCode.trim();
}

export function isValidRbacPermissionCode(code: string): boolean {
    return RBAC_PERMISSION_CODE_PATTERN.test(code.trim());
}
