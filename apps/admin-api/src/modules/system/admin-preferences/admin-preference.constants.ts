import { RBAC_PERMISSIONS } from '../rbac/rbac-permissions';

export const ADMIN_PREFERENCE_MANAGE_PERMISSION = RBAC_PERMISSIONS.SYSTEM_ADMIN_PREFERENCE_MANAGE;

export const ADMIN_PREFERENCE_KEYS = [
    'themeColor',
    'menuWidth',
    'tabBar',
    'showTabsPinIcon',
    'translucent',
    'openingAnimation',
    'quitAnimation',
    'colorWeak'
] as const;

export type AdminPreferenceKey = (typeof ADMIN_PREFERENCE_KEYS)[number];

export type AdminPreferenceValue = string | number | boolean;

export type AdminPreferenceDefinition = {
    key: AdminPreferenceKey;
    label: string;
    group: 'appearance' | 'layout' | 'animation' | 'accessibility';
    sort: number;
    defaultValue: AdminPreferenceValue;
    userEditable: boolean;
};

export const ADMIN_PREFERENCE_DEFINITIONS: AdminPreferenceDefinition[] = [
    {
        key: 'themeColor',
        label: '主题颜色',
        group: 'appearance',
        sort: 10,
        defaultValue: '#165DFF',
        userEditable: true
    },
    {
        key: 'menuWidth',
        label: '菜单栏宽度',
        group: 'layout',
        sort: 20,
        defaultValue: 220,
        userEditable: true
    },
    {
        key: 'tabBar',
        label: '开启多标签',
        group: 'layout',
        sort: 30,
        defaultValue: true,
        userEditable: true
    },
    {
        key: 'showTabsPinIcon',
        label: '显示标签页固定图标',
        group: 'layout',
        sort: 40,
        defaultValue: false,
        userEditable: true
    },
    {
        key: 'translucent',
        label: '透明效果',
        group: 'appearance',
        sort: 50,
        defaultValue: true,
        userEditable: true
    },
    {
        key: 'openingAnimation',
        label: '页面打开动画',
        group: 'animation',
        sort: 60,
        defaultValue: 'fade-in',
        userEditable: true
    },
    {
        key: 'quitAnimation',
        label: '页面退出动画',
        group: 'animation',
        sort: 70,
        defaultValue: 'fade-out-right',
        userEditable: true
    },
    {
        key: 'colorWeak',
        label: '色弱模式',
        group: 'accessibility',
        sort: 80,
        defaultValue: false,
        userEditable: true
    }
];
