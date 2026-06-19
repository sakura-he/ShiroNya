import { applyDecorators, SetMetadata } from '@nestjs/common';
import { RBAC_PERMISSION_CODE_METADATA_KEY } from './rbac-permission.metadata';

export type RbacPermissionDeclarationDecoratorFactory = (permission: {
    permissionCode: string;
}) => MethodDecorator & ClassDecorator;

/**
 * 创建应用侧 @RbacPermission()。
 *
 * 应用仍负责提供 RbacDeclarePermissions，以保留各自权限发现元数据的类型和展示字段。
 */
export function createRbacPermissionDecorator(
    declarePermissions: RbacPermissionDeclarationDecoratorFactory
): (permissionCode: string) => MethodDecorator & ClassDecorator {
    return (permissionCode: string) => {
        const code = permissionCode.trim();
        return applyDecorators(
            SetMetadata(RBAC_PERMISSION_CODE_METADATA_KEY, code),
            declarePermissions({
                permissionCode: code
            })
        );
    };
}
