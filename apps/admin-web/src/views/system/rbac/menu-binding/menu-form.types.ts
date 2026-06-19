import type {
    RbacMenuLayoutType,
    RbacMenuType,
    RbacPageType,
    RbacStatus,
} from "@/api/rbac/common";

export type SelectOption = {
    label: string;
    value: RbacMenuType;
};

export type GroupSelectOption = {
    label: string;
    value: number;
};

export type PermissionTreeNode = {
    key: string;
    title: string;
    disabled?: boolean;
    children?: PermissionTreeNode[];
};

export type ParentTreeNode = {
    key: number;
    title: string;
    type: RbacMenuType;
    disabled?: boolean;
    children?: ParentTreeNode[];
};

export type RbacMenuFormState = {
    pid?: number;
    title: string;
    description: string;
    type: RbacMenuType;
    groupId?: number;
    requiredPermissionCode: string;
    path: string;
    componentPath: string;
    componentName: string;
    icon: string;
    order?: number;
    layout: RbacMenuLayoutType;
    pageType: RbacPageType;
    isResident: boolean;
    isCache: boolean;
    isMenuVisible: boolean;
    isTabVisible: boolean;
    showChildren: boolean;
    status: RbacStatus;
};
