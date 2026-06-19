import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const APP_USER_ADMIN_GRPC_PACKAGE = 'app_user_admin';
export const APP_BUSINESS_USER_ADMIN_GRPC_SERVICE_NAME = 'AppBusinessUserAdmin';
export const APP_BETTER_AUTH_ADMIN_GRPC_SERVICE_NAME = 'AppBetterAuthAdmin';
export const APP_ROLE_MENU_POLICY_ADMIN_GRPC_SERVICE_NAME = 'AppRoleMenuPolicyAdmin';
export const APP_RBAC_ROLE_ADMIN_GRPC_SERVICE_NAME = 'AppRbacRoleAdmin';
export const APP_RBAC_USER_GROUP_ADMIN_GRPC_SERVICE_NAME = 'AppRbacUserGroupAdmin';
export const APP_RBAC_PERMISSION_ADMIN_GRPC_SERVICE_NAME = 'AppRbacPermissionAdmin';
export const APP_RBAC_PERMISSION_GROUP_ADMIN_GRPC_SERVICE_NAME = 'AppRbacPermissionGroupAdmin';
export const APP_RBAC_MENU_ADMIN_GRPC_SERVICE_NAME = 'AppRbacMenuAdmin';
export const APP_CERBOS_ABAC_ADMIN_GRPC_SERVICE_NAME = 'AppCerbosAbacAdmin';
export const APP_USER_ADMIN_PROTO_FILE = 'app-user-admin.proto';

/**
 * gRPC 的 proto 固定放在仓库根目录的 proto 下。
 */
export function resolveAppUserAdminProtoPath(): string {
    const protoPath = join(process.cwd(), 'proto', APP_USER_ADMIN_PROTO_FILE);
    if (!existsSync(protoPath)) {
        throw new Error(`AppUserAdmin proto 不存在: ${protoPath}`);
    }
    return protoPath;
}

/**
 * Nest gRPC 的 loader 选项统一收敛在这里，避免两端序列化规则漂移。
 */
export const APP_USER_ADMIN_GRPC_LOADER_OPTIONS = {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: false,
    arrays: true,
    oneofs: true
} as const;
