import type { CoreManagerResourceType } from './core-manager-authz.constants';

export const AUTHZ_OBJECT_SUBJECT_KINDS = ['user', 'role_assigned'] as const;

export type AuthzObjectSubjectKind = (typeof AUTHZ_OBJECT_SUBJECT_KINDS)[number];

export const AUTHZ_OBJECT_EXCEPTION_RESOURCE_TYPES = ['admin_user', 'role', 'menu', 'user_group', 'task'] as const;

export type AuthzObjectExceptionResourceType = (typeof AUTHZ_OBJECT_EXCEPTION_RESOURCE_TYPES)[number];

export const AUTHZ_OBJECT_EXCEPTION_RELATIONS = {
    admin_user: {
        managerResourceType: 'user_manager',
        relations: ['viewer', 'updater', 'deleter', 'password_resetter', 'session_viewer', 'session_revoker'],
        labels: {
            viewer: '查看',
            updater: '更新',
            deleter: '删除',
            password_resetter: '重置密码',
            session_viewer: '查看会话',
            session_revoker: '撤销会话'
        }
    },
    role: {
        managerResourceType: 'role_manager',
        relations: [
            'viewer',
            'updater',
            'deleter',
            'user_assigner',
            'user_group_assigner',
            'task_capability_assigner',
            'task_resource_assigner'
        ],
        labels: {
            viewer: '查看',
            updater: '更新',
            deleter: '删除',
            user_assigner: '分配用户',
            user_group_assigner: '分配用户组',
            task_capability_assigner: '分配任务能力',
            task_resource_assigner: '分配任务资源'
        }
    },
    menu: {
        managerResourceType: 'menu_manager',
        relations: ['inspector', 'updater', 'deleter', 'role_assigner'],
        labels: {
            inspector: '查看对象',
            updater: '更新',
            deleter: '删除',
            role_assigner: '分配角色'
        }
    },
    user_group: {
        managerResourceType: 'user_group_manager',
        relations: ['viewer', 'updater', 'deleter', 'member_assigner', 'role_assigner'],
        labels: {
            viewer: '查看',
            updater: '更新',
            deleter: '删除',
            member_assigner: '分配成员',
            role_assigner: '分配角色'
        }
    },
    task: {
        managerResourceType: 'task_manager',
        relations: ['viewer', 'updater', 'deleter', 'runner'],
        labels: {
            viewer: '查看',
            updater: '更新',
            deleter: '删除',
            runner: '运行'
        }
    }
} as const satisfies Record<
    AuthzObjectExceptionResourceType,
    {
        managerResourceType: CoreManagerResourceType;
        relations: readonly string[];
        labels: Record<string, string>;
    }
>;

export const AUTHZ_OBJECT_EXCEPTION_LARGE_CHANGE_TUPLE_THRESHOLD = 20;

export const AUTHZ_OBJECT_EXCEPTION_LARGE_CHANGE_USER_THRESHOLD = 50;

export const AUTHZ_OBJECT_EXCEPTION_USER_SAMPLE_LIMIT = 20;
