export type RbacEffectiveState = {
    userId: string;
    roleIds: number[];
    permissionIds: number[];
    permissionCodes: string[];
    visibleMenuIds: number[];
    isSuperAdmin: boolean;
};

export type RbacRoleRow = {
    id: number;
    isSuperAdmin: boolean;
};

export type RbacRoleInheritRow = {
    roleId: number;
    parentRoleId: number;
};

export type RbacRolePermissionRow = {
    roleId: number;
    permissionId: number;
};

export type RbacPermissionRow = {
    id: number;
    code: string;
};

export type RbacMenuRow<TMenuType extends string = string> = {
    id: number;
    pid: number | null;
    type: TMenuType;
    requiredPermissionCode: string;
};

export type RbacUserRoleRow = {
    userId: string;
    roleId: number;
};

export type RbacUserGroupMemberRow = {
    userId: string;
    groupId: number;
};

export type RbacUserGroupRoleRow = {
    groupId: number;
    roleId: number;
};

export type RbacGraphSnapshot<TMenuType extends string = string> = {
    activeRoleIds: Set<number>;
    superAdminRoleIds: Set<number>;
    parentRoleIdsByRoleId: Map<number, number[]>;
    childRoleIdsByParentId: Map<number, number[]>;
    permissionIdsByRoleId: Map<number, number[]>;
    permissionCodeById: Map<number, string>;
    menuIdsByPermissionCode: Map<string, number[]>;
    menuMetaById: Map<number, { pid: number | null; type: TMenuType }>;
    allEnabledPermissionIds: number[];
    allEnabledMenuIds: number[];
};

export function createRbacGraphSnapshot<TMenuType extends string = string>(input: {
    roles: RbacRoleRow[];
    inherits: RbacRoleInheritRow[];
    rolePermissions: RbacRolePermissionRow[];
    permissions: RbacPermissionRow[];
    menus: RbacMenuRow<TMenuType>[];
}): RbacGraphSnapshot<TMenuType> {
    const activeRoleIds = new Set(input.roles.map((row) => row.id));
    const permissionCodeById = new Map(input.permissions.map((row) => [row.id, row.code]));
    const permissionIdsByRoleId = new Map<number, number[]>();
    for (const row of input.rolePermissions) {
        if (!activeRoleIds.has(row.roleId)) {
            continue;
        }
        const permissionIds = permissionIdsByRoleId.get(row.roleId) ?? [];
        permissionIds.push(row.permissionId);
        permissionIdsByRoleId.set(row.roleId, permissionIds);
    }

    const menuIdsByPermissionCode = new Map<string, number[]>();
    for (const row of input.menus) {
        const menuIds = menuIdsByPermissionCode.get(row.requiredPermissionCode) ?? [];
        menuIds.push(row.id);
        menuIdsByPermissionCode.set(row.requiredPermissionCode, menuIds);
    }

    return {
        activeRoleIds,
        superAdminRoleIds: new Set(input.roles.filter((row) => row.isSuperAdmin).map((row) => row.id)),
        parentRoleIdsByRoleId: createRbacRoleParentIndex(input.inherits),
        childRoleIdsByParentId: createRbacRoleChildIndex(input.inherits),
        permissionIdsByRoleId,
        permissionCodeById,
        menuIdsByPermissionCode,
        menuMetaById: new Map(
            input.menus.map((row) => [
                row.id,
                {
                    pid: row.pid ?? null,
                    type: row.type
                }
            ])
        ),
        allEnabledPermissionIds: input.permissions.map((row) => row.id),
        allEnabledMenuIds: input.menus.map((row) => row.id)
    };
}

export function buildRbacEffectiveStates<TMenuType extends string = string>(input: {
    targetUserIds: string[];
    directRoleRows: RbacUserRoleRow[];
    groupMemberRows: RbacUserGroupMemberRow[];
    activeGroupIds: Set<number>;
    groupRoleRows: RbacUserGroupRoleRow[];
    snapshot: RbacGraphSnapshot<TMenuType>;
    buttonMenuType: TMenuType;
}): RbacEffectiveState[] {
    const roleIdsByUser = new Map<string, Set<number>>(
        input.targetUserIds.map((userId) => [userId, new Set<number>()])
    );
    for (const row of input.directRoleRows) {
        if (input.snapshot.activeRoleIds.has(row.roleId)) {
            roleIdsByUser.get(row.userId)?.add(row.roleId);
        }
    }

    const groupIdsByUser = new Map<string, number[]>();
    for (const row of input.groupMemberRows) {
        if (!input.activeGroupIds.has(row.groupId)) {
            continue;
        }
        const groupIds = groupIdsByUser.get(row.userId) ?? [];
        groupIds.push(row.groupId);
        groupIdsByUser.set(row.userId, groupIds);
    }

    const roleIdsByGroup = new Map<number, number[]>();
    for (const row of input.groupRoleRows) {
        if (!input.snapshot.activeRoleIds.has(row.roleId)) {
            continue;
        }
        const roleIds = roleIdsByGroup.get(row.groupId) ?? [];
        roleIds.push(row.roleId);
        roleIdsByGroup.set(row.groupId, roleIds);
    }

    for (const [userId, groupIds] of groupIdsByUser) {
        const roleIdSet = roleIdsByUser.get(userId)!;
        for (const groupId of groupIds) {
            for (const roleId of roleIdsByGroup.get(groupId) ?? []) {
                roleIdSet.add(roleId);
            }
        }
    }

    return input.targetUserIds.map((userId) => {
        const roleIds = [...(roleIdsByUser.get(userId) ?? [])].sort((a, b) => a - b);
        const permissionRoleIds = resolveRbacRoleClosureFromIndex(
            roleIds,
            input.snapshot.parentRoleIdsByRoleId,
            input.snapshot.activeRoleIds
        );
        const permissionIds = resolveRbacPermissionIdsFromRoleIds(permissionRoleIds, input.snapshot);
        const isSuperAdmin = roleIds.some((roleId) => input.snapshot.superAdminRoleIds.has(roleId));
        const effectivePermissionIds = isSuperAdmin ? input.snapshot.allEnabledPermissionIds : permissionIds;
        const visibleMenuIds = isSuperAdmin
            ? input.snapshot.allEnabledMenuIds
            : resolveRbacVisibleMenuIdsFromPermissionIds(effectivePermissionIds, input.snapshot, input.buttonMenuType);

        return {
            userId,
            roleIds,
            permissionIds: effectivePermissionIds,
            permissionCodes: effectivePermissionIds
                .map((permissionId) => input.snapshot.permissionCodeById.get(permissionId))
                .filter((code): code is string => Boolean(code)),
            visibleMenuIds,
            isSuperAdmin
        };
    });
}

export function createRbacRebuildSummary(states: RbacEffectiveState[]) {
    return {
        userCount: states.length,
        effectiveRoleCount: states.reduce((sum, state) => sum + state.roleIds.length, 0),
        effectivePermissionCount: states.reduce((sum, state) => sum + state.permissionIds.length, 0),
        visibleMenuCount: states.reduce((sum, state) => sum + state.visibleMenuIds.length, 0),
        superAdminUserCount: states.filter((state) => state.isSuperAdmin).length,
        sample: states.slice(0, 20)
    };
}

export function createRbacRoleParentIndex(inherits: RbacRoleInheritRow[]): Map<number, number[]> {
    const parentIndex = new Map<number, number[]>();
    for (const inherit of inherits) {
        const parents = parentIndex.get(inherit.roleId) ?? [];
        parents.push(inherit.parentRoleId);
        parentIndex.set(inherit.roleId, parents);
    }
    return parentIndex;
}

export function createRbacRoleChildIndex(inherits: RbacRoleInheritRow[]): Map<number, number[]> {
    const childIndex = new Map<number, number[]>();
    for (const inherit of inherits) {
        const children = childIndex.get(inherit.parentRoleId) ?? [];
        children.push(inherit.roleId);
        childIndex.set(inherit.parentRoleId, children);
    }
    return childIndex;
}

export function resolveRbacRoleClosureFromIndex(
    roleIds: number[],
    parentRoleIdsByRoleId: Map<number, number[]>,
    activeRoleIds: Set<number>
): number[] {
    const visited = new Set(roleIds.filter((roleId) => activeRoleIds.has(roleId)));
    const queue = [...visited];
    while (queue.length > 0) {
        const currentRoleId = queue.shift()!;
        for (const parentRoleId of parentRoleIdsByRoleId.get(currentRoleId) ?? []) {
            if (!activeRoleIds.has(parentRoleId) || visited.has(parentRoleId)) {
                continue;
            }
            visited.add(parentRoleId);
            queue.push(parentRoleId);
        }
    }
    return [...visited].sort((a, b) => a - b);
}

export function resolveRbacRoleDependentIdsFromIndex(
    roleIds: number[],
    childRoleIdsByParentId: Map<number, number[]>
): number[] {
    const visited = new Set(normalizePositiveRbacIds(roleIds));
    const queue = [...visited];
    while (queue.length > 0) {
        const currentRoleId = queue.shift()!;
        for (const childRoleId of childRoleIdsByParentId.get(currentRoleId) ?? []) {
            if (visited.has(childRoleId)) {
                continue;
            }
            visited.add(childRoleId);
            queue.push(childRoleId);
        }
    }
    return [...visited].sort((a, b) => a - b);
}

export function resolveRbacPermissionIdsFromRoleIds<TMenuType extends string = string>(
    roleIds: number[],
    snapshot: RbacGraphSnapshot<TMenuType>
): number[] {
    const permissionIds = new Set<number>();
    for (const roleId of roleIds) {
        for (const permissionId of snapshot.permissionIdsByRoleId.get(roleId) ?? []) {
            permissionIds.add(permissionId);
        }
    }
    return [...permissionIds].sort((a, b) => a - b);
}

export function resolveRbacVisibleMenuIdsFromPermissionIds<TMenuType extends string = string>(
    permissionIds: number[],
    snapshot: RbacGraphSnapshot<TMenuType>,
    buttonMenuType: TMenuType
): number[] {
    const menuIds = new Set<number>();
    for (const permissionId of permissionIds) {
        const code = snapshot.permissionCodeById.get(permissionId);
        if (!code) {
            continue;
        }
        for (const menuId of snapshot.menuIdsByPermissionCode.get(code) ?? []) {
            menuIds.add(menuId);
        }
    }
    return resolveRbacMenuIdsWithAncestors(menuIds, snapshot.menuMetaById, buttonMenuType);
}

export function resolveRbacMenuIdsWithAncestors<TMenuType extends string = string>(
    menuIds: Iterable<number>,
    menuMetaById: Map<number, { pid?: number | null; type?: TMenuType }>,
    buttonMenuType: TMenuType
): number[] {
    const resolvedMenuIds = new Set(menuIds);
    const queue = [...resolvedMenuIds];

    while (queue.length > 0) {
        const menuId = queue.shift()!;
        const menu = menuMetaById.get(menuId);
        if (!menu || menu.type === buttonMenuType) {
            continue;
        }

        const parentMenuId = menu.pid;
        if (typeof parentMenuId !== 'number' || !menuMetaById.has(parentMenuId) || resolvedMenuIds.has(parentMenuId)) {
            continue;
        }

        resolvedMenuIds.add(parentMenuId);
        queue.push(parentMenuId);
    }

    return [...resolvedMenuIds].sort((a, b) => a - b);
}

export function normalizePositiveRbacIds(ids: number[]): number[] {
    return [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0).sort((a, b) => a - b);
}

export function normalizeRbacPermissionCodes(codes: string[]): string[] {
    return [...new Set(codes.map((code) => code.trim()).filter(Boolean))].sort();
}

export function sortRbacStringIds(ids: string[]): string[] {
    return [...new Set(ids)].sort();
}
