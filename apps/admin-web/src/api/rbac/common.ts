export enum RbacStatus {
    ENABLE = "ENABLE",
    DISABLE = "DISABLE",
}

export enum RbacPermissionKind {
    MENU = "MENU",
    ACTION = "ACTION",
}

export enum RbacMenuType {
    Catalog = "Catalog",
    Page = "Page",
    Button = "Button",
}

export enum RbacMenuLayoutType {
    LAYOUT_DEFAULT = "LAYOUT_DEFAULT",
    LAYOUT_SIDE = "LAYOUT_SIDE",
    LAYOUT_TOP = "LAYOUT_TOP",
}

export enum RbacPageType {
    PAGE = "PAGE",
    LINK = "LINK",
    IFRAME = "IFRAME",
}

export type RbacRoleDto = {
    id: number;
    code: string;
    name: string;
    description?: string | null;
    sort?: number;
    isBuiltin?: boolean;
    isSuperAdmin?: boolean;
    status: RbacStatus | string;
    createdAt?: string;
    updatedAt?: string;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssignUser?: boolean;
    viewerCanAssignUserGroup?: boolean;
    viewerCanAssignParentRole?: boolean;
    viewerCanAssignPermission?: boolean;
};

export type RbacUserGroupDto = {
    id: number;
    code: string;
    name: string;
    description?: string | null;
    sort: number;
    status: RbacStatus;
    createdAt?: string;
    updatedAt?: string;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssignMember?: boolean;
    viewerCanAssignRole?: boolean;
};

export type RbacPermissionDto = {
    id: number;
    code: string;
    name: string;
    description?: string | null;
    kind: RbacPermissionKind;
    groupId?: number | null;
    sort: number;
    isBuiltin: boolean;
    status: RbacStatus;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssignRole?: boolean;
};

export type RbacPermissionGroupDto = {
    id: number;
    code: string;
    name: string;
    description?: string | null;
    sort: number;
    status: RbacStatus;
    createdAt?: string;
    updatedAt?: string;
    permissionCount?: number;
    menuCount?: number;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssign?: boolean;
};

export type RbacUserDto = {
    id: string;
    username?: string | null;
    name: string;
    email?: string | null;
    phoneNumber?: string | null;
    banned?: boolean;
    image?: string | null;
    remark?: string | null;
    lastLoginAt?: string | Date | null;
    roleIds?: number[];
    effectiveRoleIds?: number[];
    userGroupIds?: number[];
    createdAt?: string | Date;
    updatedAt?: string | Date;
    roleCount?: number;
    groupCount?: number;
    effectiveRoleCount?: number;
    effectivePermissionCount?: number;
    visibleMenuCount?: number;
    effectiveRoleSources?: Array<"DIRECT_ROLE" | "USER_GROUP_ROLE">;
    effectiveRoleSourceRoleIds?: number[];
    effectiveRoleSourceGroupIds?: number[];
    viewerCanViewDetail?: boolean;
    viewerCanAssignRole?: boolean;
    viewerCanAssignUserGroup?: boolean;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanResetPassword?: boolean;
    viewerCanViewSession?: boolean;
    viewerCanRevokeSession?: boolean;
    viewerCanImpersonate?: boolean;
};

export type RbacMenuDto = {
    id: number;
    pid?: number | null;
    title: string;
    description?: string | null;
    type: RbacMenuType;
    groupId?: number | null;
    requiredPermissionCode: string;
    path?: string | null;
    componentPath?: string | null;
    componentName?: string | null;
    icon?: string | null;
    iconName?: string | null;
    layout?: RbacMenuLayoutType;
    pageType?: RbacPageType;
    isResident?: boolean;
    isCache?: boolean;
    isMenuVisible?: boolean;
    isTabVisible?: boolean;
    showChildren?: boolean;
    status?: RbacStatus;
    order?: number | null;
    viewerCanCreateMenu?: boolean;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssignRole?: boolean;
    viewerCanUpdateMenu?: boolean;
    viewerCanDeleteMenu?: boolean;
};

export type RbacListResponse<T, M = Record<string, unknown>> = {
    records: T[];
    meta: M;
    pagination?: {
        total?: number;
        page?: number;
        pageSize?: number;
        current?: number;
    };
};

export type RbacAssigned<T> = T & {
    assigned: boolean;
};
