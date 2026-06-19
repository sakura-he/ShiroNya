import { createRbacPermissionDecorator } from '@app/rbac-core';
import { RbacDeclarePermissions } from '../discovery/discovery.decorators';

/**
 * 声明 RBAC 接口对应的权限 code。
 */
export const RbacPermission = createRbacPermissionDecorator(RbacDeclarePermissions);
