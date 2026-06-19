import type { RbacAuthorizationService } from './rbac-authorization.service';

export type RbacServiceContext = {
    authorizationBoundary?: 'app-rbac' | 'trusted-admin-control-plane';
};

function trustsAdminControlPlane(context?: RbacServiceContext): boolean {
    return context?.authorizationBoundary === 'trusted-admin-control-plane';
}

export async function assertRbacServicePermission(
    authzService: RbacAuthorizationService,
    actorId: string,
    permissionCode: string,
    context?: RbacServiceContext
): Promise<void> {
    if (trustsAdminControlPlane(context)) {
        // admin 控制面已经完成用户权限决策；app-api 这里只信任经过 mTLS + metadata 校验的控制面身份。
        return;
    }
    await authzService.assertPermission(actorId, permissionCode);
}

export async function checkRbacServicePermission(
    authzService: RbacAuthorizationService,
    actorId: string,
    permissionCode: string,
    context?: RbacServiceContext
): Promise<boolean> {
    if (trustsAdminControlPlane(context)) {
        // 控制面 actorId 只用于审计和 createdBy/updatedBy，不在 app 侧重复做用户 RBAC 判定。
        return true;
    }
    return await authzService.checkPermission(actorId, permissionCode);
}

export async function checkRbacServicePermissions(
    authzService: RbacAuthorizationService,
    actorId: string,
    permissionCodes: string[],
    context?: RbacServiceContext
): Promise<Map<string, boolean>> {
    if (trustsAdminControlPlane(context)) {
        // 控制面按钮态默认可用，实际用户权限边界由 admin-api 在发起 RPC 前判定。
        return new Map(permissionCodes.map((code) => [code, true]));
    }
    return await authzService.checkPermissions(actorId, permissionCodes);
}
