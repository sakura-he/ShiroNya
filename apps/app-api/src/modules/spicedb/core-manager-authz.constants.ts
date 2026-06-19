export const CORE_MANAGER_RESOURCE_TYPES = [
    'user_manager',
    'role_manager',
    'menu_manager',
    'user_group_manager',
    'task_manager'
] as const;

export const CORE_MANAGER_RELATION_TYPES = [
    'viewer',
    'creator',
    'updater',
    'deleter',
    'role_assigner',
    'password_resetter',
    'session_viewer',
    'session_revoker',
    'user_assigner',
    'user_group_assigner',
    'task_capability_assigner',
    'task_resource_assigner',
    'member_assigner',
    'runner',
    'manager'
] as const;

export type CoreManagerResourceType = (typeof CORE_MANAGER_RESOURCE_TYPES)[number];

export type CoreManagerRelation = (typeof CORE_MANAGER_RELATION_TYPES)[number];

export const CORE_MANAGER_RELATIONS = {
    user_manager: [
        'viewer',
        'creator',
        'updater',
        'deleter',
        'password_resetter',
        'session_viewer',
        'session_revoker',
        'manager'
    ],
    role_manager: [
        'viewer',
        'creator',
        'updater',
        'deleter',
        'user_assigner',
        'user_group_assigner',
        'task_capability_assigner',
        'task_resource_assigner',
        'manager'
    ],
    menu_manager: ['viewer', 'creator', 'updater', 'deleter', 'role_assigner', 'manager'],
    user_group_manager: ['viewer', 'creator', 'updater', 'deleter', 'member_assigner', 'role_assigner', 'manager'],
    task_manager: ['viewer', 'creator', 'updater', 'deleter', 'runner', 'manager']
} as const satisfies Record<CoreManagerResourceType, readonly CoreManagerRelation[]>;

export const CORE_MANAGER_RELATION_LABELS: Record<CoreManagerRelation, string> = {
    viewer: '查看',
    creator: '创建',
    updater: '更新',
    deleter: '删除',
    role_assigner: '分配角色',
    password_resetter: '重置密码',
    session_viewer: '查看会话',
    session_revoker: '撤销会话',
    user_assigner: '分配用户',
    user_group_assigner: '分配用户组',
    task_capability_assigner: '分配任务能力',
    task_resource_assigner: '分配任务资源',
    member_assigner: '分配成员',
    runner: '运行',
    manager: '管理员'
};

export const TASK_MANAGER_RESOURCE_TYPE: CoreManagerResourceType = 'task_manager';

export const TASK_MANAGER_CAPABILITY_RELATIONS = new Set<CoreManagerRelation>([
    'viewer',
    'creator',
    'updater',
    'deleter',
    'runner'
]);

export const TASK_MANAGER_RESOURCE_RELATIONS = new Set<CoreManagerRelation>(['manager']);
