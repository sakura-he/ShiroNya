import { request } from "./index";
import type { RbacListResponse, RbacMenuDto } from "./rbac/common";
import { resolveRbacApiPath } from "./app-rbac/target";

function menuApiPath(adminPath: string, appPath: string) {
    return resolveRbacApiPath(adminPath, appPath);
}

export type MenuPayload = Omit<
    Partial<RbacMenuDto>,
    "id" | "iconName" | "viewerCanCreateMenu" | "viewerCanUpdateMenu" | "viewerCanDeleteMenu"
>;

export type MenuDetailDto = {
    menu: RbacMenuDto;
};

export type MenuRelationRoleDto = {
    id: number;
    name: string;
    code: string;
    description?: string | null;
    status: string;
};

export type MenuRelationUserDto = {
    id: string;
    username?: string | null;
    name: string;
    email?: string | null;
    banned?: boolean;
    image?: string | null;
};

export type MenuRelationsDto = {
    menu: {
        id: number;
        title: string;
        type: string;
        requiredPermissionCode: string;
        pid?: number | null;
        status?: string;
        viewerCanUpdate?: boolean;
        viewerCanDelete?: boolean;
        viewerCanAssignRole?: boolean;
        [key: string]: any;
    };
    roleIds: number[];
    visibleUserIds: string[];
};

export type MenuListMetaDto = {
    viewerCanCreateMenu: boolean;
};

export function queryAllMenus(params: Record<string, any>) {
    return request(menuApiPath("/menu/query_all_menus", "/app-api/rbac/menu/query_all_menus"), {
        method: "post",
        data: params ?? {},
    });
}
export function updateMenu(data: { id: number; [prop: string]: any }) {
    return request({
        url: menuApiPath("/menu/update_menu", "/app-api/rbac/menu/update_menu"),
        method: "post",
        data,
    });
}
export function getSystemDemoTable() {
    return request("/api/system/demoTable", {
        method: "get",
    });
}

export function createMenu(data: any) {
    return request({
        url: menuApiPath("/menu/create_menu", "/app-api/rbac/menu/create_menu"),
        method: "post",
        data,
    });
}
export function deleteMenu(id: number) {
    return request({
        url: menuApiPath("/menu/delete_menu", "/app-api/rbac/menu/delete_menu"),
        method: "post",
        data: { menu_id: id },
    });
}

/**
 * 获取菜单的 RBAC 关系视图。
 */
export function getMenuRelationsApi(id: number) {
    return request.get<MenuRelationsDto>(
        menuApiPath("/menu/get_menu_relations", "/app-api/rbac/menu/get_menu_relations"),
        { params: { id } },
    );
}

export function queryMenuTreeApi(params?: Record<string, any>) {
    return request.post<RbacListResponse<RbacMenuDto>>(
        menuApiPath("/menu/query_menu_tree", "/app-api/rbac/menu/query_menu_tree"),
        params ?? {},
    );
}

export function queryMenuListApi(params?: Record<string, any>) {
    return request.post<RbacListResponse<RbacMenuDto>>(
        menuApiPath("/menu/query_menu_list", "/app-api/rbac/menu/query_menu_list"),
        params ?? {},
    );
}

export function getMenuDetailApi(id: number) {
    return request.get<MenuDetailDto>(menuApiPath("/menu/detail", "/app-api/rbac/menu/detail"), {
        params: { id },
    });
}

export function createMenuApi(data: MenuPayload) {
    return request.post<RbacMenuDto>(
        menuApiPath("/menu/create_menu", "/app-api/rbac/menu/create_menu"),
        data,
    );
}

export function updateMenuApi(id: number, data: MenuPayload) {
    return request.post<RbacMenuDto>(
        menuApiPath("/menu/update_menu", "/app-api/rbac/menu/update_menu"),
        {
            ...data,
            id,
        },
    );
}

export function deleteMenuApi(id: number) {
    return request.post<RbacMenuDto>(
        menuApiPath("/menu/delete_menu", "/app-api/rbac/menu/delete_menu"),
        { menu_id: id },
    );
}

/**
 * 分页查询菜单授权角色表。
 */
export function getMenuRelationRolesApi(data: {
    menuId: number;
    page?: number;
    pageSize?: number;
    keyword?: string;
    assigned?: boolean;
    status?: string;
    draftRoleIds: number[];
}) {
    return request.post(
        menuApiPath("/menu/query_relation_roles", "/app-api/rbac/menu/query_relation_roles"),
        data,
    );
}

/**
 * 分页查询菜单当前可见用户。
 */
export function getMenuVisibleUsersApi(data: {
    menuId: number;
    page?: number;
    pageSize?: number;
    keyword?: string;
    banned?: boolean;
}) {
    return request.post(
        menuApiPath("/menu/query_visible_users", "/app-api/rbac/menu/query_visible_users"),
        data,
    );
}

/**
 * 从菜单视角替换可见角色集合，本质是更新角色对该菜单所需权限的授权。
 */
export function assignMenuRolesApi(data: { menuId: number; roleIds: number[] }) {
    return request.post(
        menuApiPath("/menu/assign_roles", "/app-api/rbac/menu/assign_roles"),
        data,
    );
}
