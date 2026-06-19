import { RBAC_PERMISSIONS, type RbacPermissionCode } from '../system/rbac/rbac-permissions';

// 测试台菜单本身的展示权限；接口权限仍然使用 RBAC_PERMISSIONS 里的具体 code。
export const RBAC_TEST_MENU_PERMISSION = RBAC_PERMISSIONS.TEST_PAGE;

// 测试台内部动作 key。它不是权限 code，只用于把页面按钮、接口路径和 seed 权限定义关联起来。
export type RbacTestActionKey =
    | 'view'
    | 'read'
    | 'create'
    | 'update'
    | 'delete'
    | 'admin'
    | 'profile'
    | 'approve'
    | 'publish'
    | 'multi';

// 测试台每个动作对应的展示元数据。overview 会直接把它返回给前端生成测试按钮。
export type RbacTestPermissionDefinition = {
    key: Exclude<RbacTestActionKey, 'multi'>;
    code: RbacPermissionCode;
    name: string;
    method: 'GET' | 'POST';
    path: string;
};

export const RBAC_TEST_PERMISSION_DEFINITIONS: RbacTestPermissionDefinition[] = [
    {
        key: 'view',
        code: RBAC_PERMISSIONS.TEST_VIEW,
        name: '查看测试接口',
        method: 'GET',
        path: '/rbac/test/view'
    },
    {
        key: 'read',
        code: RBAC_PERMISSIONS.TEST_READ,
        name: '读取测试接口',
        method: 'GET',
        path: '/rbac/test/read'
    },
    {
        key: 'create',
        code: RBAC_PERMISSIONS.TEST_CREATE,
        name: '创建测试接口',
        method: 'POST',
        path: '/rbac/test/create'
    },
    {
        key: 'update',
        code: RBAC_PERMISSIONS.TEST_UPDATE,
        name: '更新测试接口',
        method: 'POST',
        path: '/rbac/test/update'
    },
    {
        key: 'delete',
        code: RBAC_PERMISSIONS.TEST_DELETE,
        name: '删除测试接口',
        method: 'POST',
        path: '/rbac/test/delete'
    },
    {
        key: 'admin',
        code: RBAC_PERMISSIONS.TEST_ADMIN,
        name: '管理测试接口',
        method: 'POST',
        path: '/rbac/test/admin'
    },
    {
        key: 'profile',
        code: RBAC_PERMISSIONS.TEST_PROFILE,
        name: '资料测试接口',
        method: 'POST',
        path: '/rbac/test/profile'
    },
    {
        key: 'approve',
        code: RBAC_PERMISSIONS.TEST_APPROVE,
        name: '审批测试接口',
        method: 'POST',
        path: '/rbac/test/approve'
    },
    {
        key: 'publish',
        code: RBAC_PERMISSIONS.TEST_PUBLISH,
        name: '发布测试接口',
        method: 'POST',
        path: '/rbac/test/publish'
    }
];

// 这里找不到说明开发时 action key 写错了；测试台定义是静态表，所以不做运行时 fallback。
export function getRbacTestPermissionDefinition(
    key: Exclude<RbacTestActionKey, 'multi'>
): RbacTestPermissionDefinition {
    return RBAC_TEST_PERMISSION_DEFINITIONS.find((definition) => definition.key === key)!;
}
