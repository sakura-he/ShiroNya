import {
    isValidRbacPermissionCode,
    suggestRbacPermissionCode
} from './rbac-permission-code';

describe('rbac-permission-code', () => {
    it('建议 code 直接使用 permissionCode', () => {
        expect(
            suggestRbacPermissionCode({
                permissionCode: 'system.task.update'
            })
        ).toBe('system.task.update');
    });

    it('校验小写点分权限码格式', () => {
        expect(isValidRbacPermissionCode('system.user.create')).toBe(true);
        expect(isValidRbacPermissionCode('System.User.Create')).toBe(false);
        expect(isValidRbacPermissionCode('system')).toBe(false);
    });
});
