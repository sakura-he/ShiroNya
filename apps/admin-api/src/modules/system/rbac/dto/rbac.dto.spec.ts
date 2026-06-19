import { RbacPermissionKind, RbacStatus } from '@app/prisma-admin/generated/client';
import { CheckRbacPermissionSchema, CreateRbacPermissionSchema, SuggestRbacPermissionCodeSchema } from './rbac.dto';

describe('RBAC DTO schemas', () => {
    it('创建权限只接受 RBAC code 基础结构', () => {
        const result = CreateRbacPermissionSchema.safeParse({
            code: 'system.user.create',
            name: '创建用户',
            kind: RbacPermissionKind.ACTION,
            status: RbacStatus.ENABLE
        });

        expect(result.success).toBe(true);
    });

    it('创建权限只需要 code 和名称', () => {
        const result = CreateRbacPermissionSchema.safeParse({
            code: 'system.user.create',
            name: '创建用户'
        });

        expect(result.success).toBe(true);
    });

    it('权限 code 必须是小写点分格式', () => {
        expect(
            CreateRbacPermissionSchema.safeParse({
                code: 'System.User.Create',
                name: '创建用户'
            }).success
        ).toBe(false);
    });

    it('建议 code 和运行时 check payload 使用同一套权限码格式', () => {
        expect(
            SuggestRbacPermissionCodeSchema.safeParse({
                permissionCode: 'system.task.update'
            }).success
        ).toBe(true);
        expect(
            CheckRbacPermissionSchema.safeParse({
                code: 'system.task.update'
            }).success
        ).toBe(true);
    });
});
