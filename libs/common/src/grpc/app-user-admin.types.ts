import { Observable } from 'rxjs';
import type { Metadata } from '@grpc/grpc-js';

export type StringValueMessage = { value: string };
export type BoolValueMessage = { value: boolean };
export type Int32ValueMessage = { value: number };

export type StringPatchMessage =
    | { value: string }
    | {
          nullValue: 'NULL_VALUE';
      };

export type StringListValueMessage = {
    values: string[];
};

export type Int32ListValueMessage = {
    values: number[];
};

export type Int64ListValueMessage = {
    values: string[];
};

export type AdminFilterValueMessage =
    | { stringValue: string }
    | { numberValue: string }
    | { boolValue: boolean }
    | { stringList: StringListValueMessage }
    | { numberList: Int64ListValueMessage };

export type PermissionEntryMessage = {
    resource: string;
    actions: string[];
};

export type UserProfileMessage = {
    id: number;
    userId: string;
    nickname?: StringValueMessage;
    avatar?: StringValueMessage;
    gender: number;
    level: number;
    exp: number;
    status: number;
    createdAt: string;
    updatedAt: string;
};

export type UserMessage = {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image?: StringValueMessage;
    role?: StringValueMessage;
    banned: boolean;
    banReason?: StringValueMessage;
    banExpires?: StringValueMessage;
    createdAt: string;
    updatedAt: string;
    phoneNumber?: StringValueMessage;
    phoneNumberVerified?: BoolValueMessage;
    profile?: UserProfileMessage;
    roleIds: number[];
};

export type SessionMessage = {
    id: string;
    expiresAt: string;
    token: string;
    createdAt: string;
    updatedAt: string;
    ipAddress?: StringValueMessage;
    userAgent?: StringValueMessage;
    userId: string;
    impersonatedBy?: StringValueMessage;
};

export type PaginationMessage = {
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
};

export type SuccessResponse = {
    success: boolean;
};

export type CerbosAbacJsonRequest = {
    json: string;
};

export type CerbosAbacJsonResponse = {
    json: string;
};

export type CerbosAbacIdRequest = {
    id: string;
};

export type CerbosAbacRevisionRequest = {
    revision: string;
};

export type ListBusinessUsersRequest = {
    id?: StringValueMessage;
    name?: StringValueMessage;
    nickname?: StringValueMessage;
    email?: StringValueMessage;
    phoneNumber?: StringValueMessage;
    status?: Int32ValueMessage;
    roleId?: Int32ValueMessage;
    emailVerified?: BoolValueMessage;
    phoneNumberVerified?: BoolValueMessage;
    createdAtStart?: StringValueMessage;
    createdAtEnd?: StringValueMessage;
    updatedAtStart?: StringValueMessage;
    updatedAtEnd?: StringValueMessage;
    page: number;
    pageSize: number;
};

export type ListBusinessUsersResponse = {
    records: UserMessage[];
    pagination: PaginationMessage;
};

export type BusinessRoleMessage = {
    id: number;
    name: string;
    code: string;
    description?: StringValueMessage;
    status: string;
};

export type ListBusinessRolesResponse = {
    records: BusinessRoleMessage[];
};

export type GetBusinessUserRequest = {
    id: string;
};

export type GetBusinessUserRoleIdsRequest = {
    userId: string;
};

export type CreateBusinessUserRequest = {
    name: string;
    email: string;
    phoneNumber?: StringValueMessage;
    password: string;
    nickname?: StringValueMessage;
    avatar?: StringValueMessage;
    status: number;
    roleIds: number[];
};

export type UpdateBusinessUserRequest = {
    id: string;
    name?: StringValueMessage;
    email?: StringValueMessage;
    phoneNumber?: StringPatchMessage;
    nickname?: StringPatchMessage;
    avatar?: StringPatchMessage;
    status?: Int32ValueMessage;
    roleIds?: Int32ListValueMessage;
};

export type UpdateBusinessUserStatusRequest = {
    id: string;
    status: number;
    banReason?: StringValueMessage;
};

export type SoftDeleteBusinessUserRequest = {
    id: string;
    deleteReason?: StringValueMessage;
};

export type DeleteBusinessUserRequest = {
    id: string;
    deleteReason?: StringValueMessage;
};

export type ResetBusinessUserPasswordRequest = {
    id: string;
    password: string;
};

export type ListAdminUsersRequest = {
    searchValue?: StringValueMessage;
    searchField?: StringValueMessage;
    searchOperator?: StringValueMessage;
    limit?: Int32ValueMessage;
    offset?: Int32ValueMessage;
    sortBy?: StringValueMessage;
    sortDirection?: StringValueMessage;
    filterField?: StringValueMessage;
    filterValue?: AdminFilterValueMessage;
    filterOperator?: StringValueMessage;
};

export type ListAdminUsersResponse = {
    users: UserMessage[];
    total: number;
};

export type GetAdminUserRequest = {
    userId: string;
};

export type CreateAdminUserRequest = {
    email: string;
    name: string;
    password?: StringValueMessage;
    role?: StringValueMessage;
    dataJson?: StringValueMessage;
};

export type UpdateAdminUserRequest = {
    userId: string;
    dataJson: string;
};

export type BanAdminUserRequest = {
    userId: string;
    banReason?: StringValueMessage;
    banExpiresIn?: Int32ValueMessage;
};

export type UnbanAdminUserRequest = {
    userId: string;
};

export type ListAdminUserSessionsRequest = {
    userId: string;
};

export type ListAdminUserSessionsResponse = {
    sessions: SessionMessage[];
};

export type ImpersonateAdminUserRequest = {
    userId: string;
};

export type StopImpersonatingAdminUserRequest = {
    sessionToken: string;
};

export type ImpersonationResponse = {
    session: SessionMessage;
    user: UserMessage;
};

export type RevokeAdminUserSessionRequest = {
    sessionToken: string;
};

export type RevokeAdminUserSessionsRequest = {
    userId: string;
};

export type RemoveAdminUserRequest = {
    userId: string;
};

export type SetAdminUserPasswordRequest = {
    userId: string;
    newPassword: string;
};

export type CheckAdminUserPermissionRequest = {
    userId?: StringValueMessage;
    role?: StringValueMessage;
    permissions: PermissionEntryMessage[];
};

// ── 角色-菜单策略管理 ──

export type GetRoleMenuIdsRequest = {
    roleCode: string;
};

export type AssignRoleMenusRequest = {
    roleCode: string;
    menuIds: number[];
};

export type RemoveRoleMenuPolicyRequest = {
    roleCode: string;
};

export type RbacIdRequest = {
    id: number;
};

export type RbacMetaMessage = {
    viewerCanCreateRole?: boolean;
    viewerCanCreateUserGroup?: boolean;
    viewerCanCreatePermission?: boolean;
    viewerCanUpdatePermission?: boolean;
    viewerCanDeletePermission?: boolean;
    viewerCanAssignRole?: boolean;
    viewerCanCreateGroup?: boolean;
    viewerCanUpdateGroup?: boolean;
    viewerCanDeleteGroup?: boolean;
    viewerCanAssignGroup?: boolean;
    viewerCanCreateMenu?: boolean;
    viewerCanUpdateMenu?: boolean;
    viewerCanDeleteMenu?: boolean;
};

export type RbacRoleMessage = {
    id: number;
    name: string;
    code: string;
    description?: string;
    sort?: number;
    isBuiltin?: boolean;
    isSuperAdmin?: boolean;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    assigned?: boolean;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssignUser?: boolean;
    viewerCanAssignUserGroup?: boolean;
    viewerCanAssignParentRole?: boolean;
    viewerCanAssignPermission?: boolean;
};

export type RbacUserGroupMessage = {
    id: number;
    name: string;
    code: string;
    description?: string;
    sort?: number;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    memberUserIds: string[];
    roleIds: number[];
    assigned?: boolean;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssignMember?: boolean;
    viewerCanAssignRole?: boolean;
};

export type RbacPermissionMessage = {
    id: number;
    code: string;
    name: string;
    description?: string;
    kind?: string;
    groupId?: number;
    sort?: number;
    isBuiltin?: boolean;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    assigned?: boolean;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssignRole?: boolean;
};

export type RbacPermissionGroupMessage = {
    id: number;
    code: string;
    name: string;
    description?: string;
    sort?: number;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    permissionCount?: number;
    menuCount?: number;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssign?: boolean;
};

export type RbacMenuMessage = {
    id: number;
    pid?: number;
    title: string;
    description?: string;
    componentPath?: string;
    type?: string;
    groupId?: number;
    path?: string;
    icon?: string;
    order?: number;
    layout?: string;
    pageType?: string;
    isResident?: boolean;
    isCache?: boolean;
    isMenuVisible?: boolean;
    status?: string;
    showChildren?: boolean;
    requiredPermissionCode?: string;
    componentName?: string;
    isTabVisible?: boolean;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
    assigned?: boolean;
    viewerCanUpdate?: boolean;
    viewerCanDelete?: boolean;
    viewerCanAssignRole?: boolean;
    viewerCanCreateMenu?: boolean;
    viewerCanUpdateMenu?: boolean;
    viewerCanDeleteMenu?: boolean;
};

export type RbacUserRelationMessage = {
    id: string;
    username?: string;
    name?: string;
    email?: string;
    banned?: boolean;
    image?: string;
    assigned?: boolean;
    effectiveRoleSources?: string[];
    effectiveRoleSourceRoleIds?: number[];
    effectiveRoleSourceGroupIds?: number[];
};

export type RbacPermissionDeclarationTreeNode = {
    key: string;
    title: string;
    type: string;
    sourceKind?: string;
    moduleName?: string;
    className?: string;
    methodName?: string;
    children: RbacPermissionDeclarationTreeNode[];
};

export type RbacPermissionDeclarationMessage = {
    permissionCode: string;
    name?: string;
    description?: string;
    kind?: string;
    moduleName: string;
    className: string;
    methodName: string;
    sourceKind: string;
    declarationKey: string;
    databaseState: string;
    permission?: RbacPermissionMessage;
};

export type RbacRoleListRequest = {
    name?: string;
    code?: string;
    keyword?: string;
    status?: string;
    createdAt?: string;
    pageSize?: number;
    page?: number;
};

export type RbacRoleMutationRequest = Partial<RbacRoleMessage> & {
    clearDescription?: boolean;
};

export type RbacRoleAssignableUsersRequest = {
    roleId: number;
    keyword?: string;
    id?: string;
    username?: string;
    name?: string;
    email?: string;
    assigned?: boolean;
    banned?: boolean;
    draftUserIds: string[];
    pageSize?: number;
    page?: number;
};

export type RbacRoleAssignableUserGroupsRequest = {
    roleId: number;
    keyword?: string;
    name?: string;
    code?: string;
    description?: string;
    assigned?: boolean;
    status?: string;
    draftUserGroupIds: number[];
    pageSize?: number;
    page?: number;
};

export type RbacRoleAssignableParentRolesRequest = {
    roleId: number;
    keyword?: string;
    name?: string;
    code?: string;
    description?: string;
    assigned?: boolean;
    status?: string;
    draftRoleIds: number[];
    pageSize?: number;
    page?: number;
};

export type RbacRoleAssignablePermissionsRequest = {
    roleId: number;
    keyword?: string;
    code?: string;
    name?: string;
    description?: string;
    kind?: string;
    assigned?: boolean;
    status?: string;
    draftPermissionIds: number[];
    pageSize?: number;
    page?: number;
};

export type RbacRoleEffectiveUsersRequest = {
    roleId: number;
    keyword?: string;
    id?: string;
    username?: string;
    name?: string;
    email?: string;
    banned?: boolean;
    pageSize?: number;
    page?: number;
};

export type RbacRoleUsersRequest = {
    roleId: number;
    userIds: string[];
};

export type RbacRoleUserGroupsRequest = {
    roleId: number;
    userGroupIds: number[];
};

export type RbacRoleParentRolesRequest = {
    roleId: number;
    parentRoleIds: number[];
};

export type RbacRolePermissionsRequest = {
    roleId: number;
    permissionIds: number[];
};

export type RbacUserGroupListRequest = {
    name?: string;
    keyword?: string;
    code?: string;
    status?: string;
    pageSize?: number;
    page?: number;
};

export type RbacUserGroupMutationRequest = Partial<RbacUserGroupMessage> & {
    clearDescription?: boolean;
};

export type RbacUserGroupMembersRequest = {
    groupId: number;
    keyword?: string;
    id?: string;
    username?: string;
    name?: string;
    email?: string;
    assigned?: boolean;
    banned?: boolean;
    draftUserIds: string[];
    pageSize?: number;
    page?: number;
};

export type RbacUserGroupRolesRequest = {
    groupId: number;
    keyword?: string;
    name?: string;
    code?: string;
    description?: string;
    assigned?: boolean;
    status?: string;
    draftRoleIds: number[];
    pageSize?: number;
    page?: number;
};

export type RbacUserGroupMenusRequest = {
    groupId: number;
    keyword?: string;
    title?: string;
    requiredPermissionCode?: string;
    path?: string;
    type?: string;
    status?: string;
    pageSize?: number;
    page?: number;
};

export type RbacUserGroupMembersMutationRequest = {
    groupId: number;
    userIds: string[];
};

export type RbacUserGroupRolesMutationRequest = {
    groupId: number;
    roleIds: number[];
};

export type RbacPermissionListRequest = {
    keyword?: string;
    code?: string;
    name?: string;
    description?: string;
    kind?: string;
    status?: string;
    groupId?: number;
    pageSize?: number;
    page?: number;
};

export type RbacPermissionMutationRequest = Partial<RbacPermissionMessage> & {
    clearDescription?: boolean;
    clearGroupId?: boolean;
};

export type RbacPermissionCodeSuggestionRequest = {
    permissionCode: string;
};

export type RbacPermissionRolesRequest = {
    permissionId: number;
    keyword?: string;
    name?: string;
    code?: string;
    description?: string;
    assigned?: boolean;
    status?: string;
    draftRoleIds: number[];
    pageSize?: number;
    page?: number;
};

export type RbacPermissionRolesMutationRequest = {
    permissionId: number;
    roleIds: number[];
};

export type RbacPermissionGroupListRequest = {
    keyword?: string;
    status?: string;
    pageSize?: number;
    page?: number;
};

export type RbacPermissionGroupMutationRequest = Partial<RbacPermissionGroupMessage> & {
    clearDescription?: boolean;
};

export type RbacPermissionGroupRelationsMutationRequest = {
    groupId: number;
    permissionIds: number[];
    menuIds: number[];
};

export type RbacMenuTreeRequest = {
    keyword?: string;
    name?: string;
    type?: string;
    status?: string;
    groupId?: number;
};

export type RbacMenuListRequest = RbacMenuTreeRequest & {
    title?: string;
    requiredPermissionCode?: string;
    path?: string;
    createdAt?: string;
    pageSize?: number;
    page?: number;
};

export type RbacMenuMutationRequest = Partial<RbacMenuMessage> & {
    clearPid?: boolean;
    clearDescription?: boolean;
    clearComponentPath?: boolean;
    clearGroupId?: boolean;
    clearPath?: boolean;
    clearIcon?: boolean;
    clearOrder?: boolean;
    clearComponentName?: boolean;
};

export type RbacRoleListResponse = {
    records: RbacRoleMessage[];
    meta?: RbacMetaMessage;
    pagination?: PaginationMessage;
};

export type RbacRoleRelationsResponse = {
    role?: RbacRoleMessage;
    directUserIds: string[];
    userGroupIds: number[];
    parentRoleIds: number[];
    permissionIds: number[];
    effectivePermissionIds: number[];
    inheritedPermissionIds: number[];
    effectiveUserIds: string[];
};

export type RbacRoleRelationListResponse = {
    records: RbacRoleMessage[];
    pagination?: PaginationMessage;
};

export type RbacUserRelationListResponse = {
    records: RbacUserRelationMessage[];
    pagination?: PaginationMessage;
};

export type RbacUserGroupListResponse = {
    records: RbacUserGroupMessage[];
    meta?: RbacMetaMessage;
    pagination?: PaginationMessage;
};

export type RbacUserGroupRelationsResponse = {
    group?: RbacUserGroupMessage;
    memberUserIds: string[];
    roleIds: number[];
    visibleMenuIds: number[];
};

export type RbacUserGroupRelationListResponse = {
    records: RbacUserGroupMessage[];
    pagination?: PaginationMessage;
};

export type RbacPermissionListResponse = {
    records: RbacPermissionMessage[];
    meta?: RbacMetaMessage;
    pagination?: PaginationMessage;
};

export type RbacPermissionDeclarationBoardResponse = {
    tree: RbacPermissionDeclarationTreeNode[];
    declarations: RbacPermissionDeclarationMessage[];
    unassignedPermissions: RbacPermissionMessage[];
    meta?: RbacMetaMessage;
};

export type RbacPermissionCodeSuggestionResponse = {
    code: string;
};

export type RbacPermissionRelationsResponse = {
    permission?: RbacPermissionMessage;
    roleIds: number[];
    menuIds: number[];
    effectiveUserIds: string[];
};

export type RbacPermissionRelationListResponse = {
    records: RbacPermissionMessage[];
    pagination?: PaginationMessage;
};

export type RbacPermissionGroupListResponse = {
    records: RbacPermissionGroupMessage[];
    meta?: RbacMetaMessage;
    pagination?: PaginationMessage;
};

export type RbacPermissionGroupRelationsResponse = {
    group?: RbacPermissionGroupMessage;
    permissionIds: number[];
    menuIds: number[];
};

export type RbacMenuListResponse = {
    records: RbacMenuMessage[];
    meta?: RbacMetaMessage;
    pagination?: PaginationMessage;
};

export type RbacMenuDetailResponse = {
    menu?: RbacMenuMessage;
};

export interface AppBusinessUserAdminGrpcServiceClient {
    listBusinessUsers(data: ListBusinessUsersRequest, metadata?: Metadata): Observable<ListBusinessUsersResponse>;
    listBusinessRoles(data: Record<string, never>, metadata?: Metadata): Observable<ListBusinessRolesResponse>;
    getBusinessUser(data: GetBusinessUserRequest, metadata?: Metadata): Observable<UserMessage>;
    getBusinessUserRoleIds(data: GetBusinessUserRoleIdsRequest, metadata?: Metadata): Observable<Int32ListValueMessage>;
    createBusinessUser(data: CreateBusinessUserRequest, metadata?: Metadata): Observable<UserMessage>;
    updateBusinessUser(data: UpdateBusinessUserRequest, metadata?: Metadata): Observable<UserMessage>;
    updateBusinessUserStatus(data: UpdateBusinessUserStatusRequest, metadata?: Metadata): Observable<unknown>;
    softDeleteBusinessUser(data: SoftDeleteBusinessUserRequest, metadata?: Metadata): Observable<unknown>;
    deleteBusinessUser(data: DeleteBusinessUserRequest, metadata?: Metadata): Observable<unknown>;
    resetBusinessUserPassword(data: ResetBusinessUserPasswordRequest, metadata?: Metadata): Observable<unknown>;
}

export interface AppBetterAuthAdminGrpcServiceClient {
    listAdminUsers(data: ListAdminUsersRequest, metadata?: Metadata): Observable<ListAdminUsersResponse>;
    getAdminUser(data: GetAdminUserRequest, metadata?: Metadata): Observable<UserMessage>;
    createAdminUser(data: CreateAdminUserRequest, metadata?: Metadata): Observable<UserMessage>;
    updateAdminUser(data: UpdateAdminUserRequest, metadata?: Metadata): Observable<UserMessage>;
    banAdminUser(data: BanAdminUserRequest, metadata?: Metadata): Observable<UserMessage>;
    unbanAdminUser(data: UnbanAdminUserRequest, metadata?: Metadata): Observable<UserMessage>;
    listAdminUserSessions(
        data: ListAdminUserSessionsRequest,
        metadata?: Metadata
    ): Observable<ListAdminUserSessionsResponse>;
    impersonateAdminUser(data: ImpersonateAdminUserRequest, metadata?: Metadata): Observable<ImpersonationResponse>;
    stopImpersonatingAdminUser(
        data: StopImpersonatingAdminUserRequest,
        metadata?: Metadata
    ): Observable<ImpersonationResponse>;
    revokeAdminUserSession(data: RevokeAdminUserSessionRequest, metadata?: Metadata): Observable<SuccessResponse>;
    revokeAdminUserSessions(data: RevokeAdminUserSessionsRequest, metadata?: Metadata): Observable<SuccessResponse>;
    removeAdminUser(data: RemoveAdminUserRequest, metadata?: Metadata): Observable<SuccessResponse>;
    setAdminUserPassword(data: SetAdminUserPasswordRequest, metadata?: Metadata): Observable<SuccessResponse>;
    checkAdminUserPermission(data: CheckAdminUserPermissionRequest, metadata?: Metadata): Observable<SuccessResponse>;
}

export interface AppRoleMenuPolicyAdminGrpcServiceClient {
    getRoleMenuIds(data: GetRoleMenuIdsRequest, metadata?: Metadata): Observable<Int32ListValueMessage>;
    assignRoleMenus(data: AssignRoleMenusRequest, metadata?: Metadata): Observable<SuccessResponse>;
    removeRoleMenuPolicy(data: RemoveRoleMenuPolicyRequest, metadata?: Metadata): Observable<SuccessResponse>;
}

export interface AppRbacRoleAdminGrpcServiceClient {
    listRbacRoles(data: RbacRoleListRequest, metadata?: Metadata): Observable<RbacRoleListResponse>;
    getRbacRoleRelations(data: RbacIdRequest, metadata?: Metadata): Observable<RbacRoleRelationsResponse>;
    queryRbacRoleAssignableUsers(
        data: RbacRoleAssignableUsersRequest,
        metadata?: Metadata
    ): Observable<RbacUserRelationListResponse>;
    queryRbacRoleAssignableUserGroups(
        data: RbacRoleAssignableUserGroupsRequest,
        metadata?: Metadata
    ): Observable<RbacUserGroupRelationListResponse>;
    queryRbacRoleAssignableParentRoles(
        data: RbacRoleAssignableParentRolesRequest,
        metadata?: Metadata
    ): Observable<RbacRoleRelationListResponse>;
    queryRbacRoleAssignablePermissions(
        data: RbacRoleAssignablePermissionsRequest,
        metadata?: Metadata
    ): Observable<RbacPermissionRelationListResponse>;
    queryRbacRoleEffectiveUsers(
        data: RbacRoleEffectiveUsersRequest,
        metadata?: Metadata
    ): Observable<RbacUserRelationListResponse>;
    createRbacRole(data: RbacRoleMutationRequest, metadata?: Metadata): Observable<RbacRoleMessage>;
    updateRbacRole(data: RbacRoleMutationRequest, metadata?: Metadata): Observable<RbacRoleMessage>;
    deleteRbacRole(data: RbacIdRequest, metadata?: Metadata): Observable<SuccessResponse>;
    assignRbacRoleUsers(data: RbacRoleUsersRequest, metadata?: Metadata): Observable<SuccessResponse>;
    assignRbacRoleUserGroups(data: RbacRoleUserGroupsRequest, metadata?: Metadata): Observable<SuccessResponse>;
    assignRbacRoleParentRoles(data: RbacRoleParentRolesRequest, metadata?: Metadata): Observable<SuccessResponse>;
    assignRbacRolePermissions(data: RbacRolePermissionsRequest, metadata?: Metadata): Observable<SuccessResponse>;
}

export interface AppRbacUserGroupAdminGrpcServiceClient {
    listRbacUserGroups(data: RbacUserGroupListRequest, metadata?: Metadata): Observable<RbacUserGroupListResponse>;
    getRbacUserGroupRelations(data: RbacIdRequest, metadata?: Metadata): Observable<RbacUserGroupRelationsResponse>;
    queryRbacUserGroupMembers(
        data: RbacUserGroupMembersRequest,
        metadata?: Metadata
    ): Observable<RbacUserRelationListResponse>;
    queryRbacUserGroupRoles(
        data: RbacUserGroupRolesRequest,
        metadata?: Metadata
    ): Observable<RbacRoleRelationListResponse>;
    queryRbacUserGroupMenus(data: RbacUserGroupMenusRequest, metadata?: Metadata): Observable<RbacMenuListResponse>;
    createRbacUserGroup(data: RbacUserGroupMutationRequest, metadata?: Metadata): Observable<RbacUserGroupMessage>;
    updateRbacUserGroup(data: RbacUserGroupMutationRequest, metadata?: Metadata): Observable<RbacUserGroupMessage>;
    deleteRbacUserGroup(data: RbacIdRequest, metadata?: Metadata): Observable<SuccessResponse>;
    assignRbacUserGroupMembers(
        data: RbacUserGroupMembersMutationRequest,
        metadata?: Metadata
    ): Observable<SuccessResponse>;
    assignRbacUserGroupRoles(
        data: RbacUserGroupRolesMutationRequest,
        metadata?: Metadata
    ): Observable<SuccessResponse>;
}

export interface AppRbacPermissionAdminGrpcServiceClient {
    listRbacPermissions(data: RbacPermissionListRequest, metadata?: Metadata): Observable<RbacPermissionListResponse>;
    getRbacPermissionDeclarationBoard(
        data: Record<string, never>,
        metadata?: Metadata
    ): Observable<RbacPermissionDeclarationBoardResponse>;
    suggestRbacPermissionCode(
        data: RbacPermissionCodeSuggestionRequest,
        metadata?: Metadata
    ): Observable<RbacPermissionCodeSuggestionResponse>;
    createRbacPermission(data: RbacPermissionMutationRequest, metadata?: Metadata): Observable<RbacPermissionMessage>;
    updateRbacPermission(data: RbacPermissionMutationRequest, metadata?: Metadata): Observable<RbacPermissionMessage>;
    deleteRbacPermission(data: RbacIdRequest, metadata?: Metadata): Observable<SuccessResponse>;
    getRbacPermissionRelations(data: RbacIdRequest, metadata?: Metadata): Observable<RbacPermissionRelationsResponse>;
    queryRbacPermissionRoles(
        data: RbacPermissionRolesRequest,
        metadata?: Metadata
    ): Observable<RbacRoleRelationListResponse>;
    assignRbacPermissionRoles(
        data: RbacPermissionRolesMutationRequest,
        metadata?: Metadata
    ): Observable<SuccessResponse>;
}

export interface AppRbacPermissionGroupAdminGrpcServiceClient {
    listRbacPermissionGroups(
        data: RbacPermissionGroupListRequest,
        metadata?: Metadata
    ): Observable<RbacPermissionGroupListResponse>;
    createRbacPermissionGroup(
        data: RbacPermissionGroupMutationRequest,
        metadata?: Metadata
    ): Observable<RbacPermissionGroupMessage>;
    updateRbacPermissionGroup(
        data: RbacPermissionGroupMutationRequest,
        metadata?: Metadata
    ): Observable<RbacPermissionGroupMessage>;
    deleteRbacPermissionGroup(data: RbacIdRequest, metadata?: Metadata): Observable<SuccessResponse>;
    getRbacPermissionGroupRelations(
        data: RbacIdRequest,
        metadata?: Metadata
    ): Observable<RbacPermissionGroupRelationsResponse>;
    assignRbacPermissionGroupRelations(
        data: RbacPermissionGroupRelationsMutationRequest,
        metadata?: Metadata
    ): Observable<RbacPermissionGroupRelationsResponse>;
}

export interface AppRbacMenuAdminGrpcServiceClient {
    listRbacMenuTree(data: RbacMenuTreeRequest, metadata?: Metadata): Observable<RbacMenuListResponse>;
    listRbacMenus(data: RbacMenuListRequest, metadata?: Metadata): Observable<RbacMenuListResponse>;
    getRbacMenuDetail(data: RbacIdRequest, metadata?: Metadata): Observable<RbacMenuDetailResponse>;
    createRbacMenu(data: RbacMenuMutationRequest, metadata?: Metadata): Observable<RbacMenuMessage>;
    updateRbacMenu(data: RbacMenuMutationRequest, metadata?: Metadata): Observable<RbacMenuMessage>;
    deleteRbacMenu(data: RbacIdRequest, metadata?: Metadata): Observable<SuccessResponse>;
}

export interface AppCerbosAbacAdminGrpcServiceClient {
    getAbacHealth(data: Record<string, never>, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    getAbacFields(data: Record<string, never>, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    listAbacFieldRegistry(data: CerbosAbacJsonRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    upsertAbacField(data: CerbosAbacJsonRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    deleteAbacField(data: CerbosAbacIdRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    listAbacRbacPermissionOptions(
        data: CerbosAbacJsonRequest,
        metadata?: Metadata
    ): Observable<CerbosAbacJsonResponse>;
    listAbacPolicyGroups(data: Record<string, never>, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    upsertAbacPolicyGroup(data: CerbosAbacJsonRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    deleteAbacPolicyGroup(data: CerbosAbacIdRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    listAbacManualPolicies(data: Record<string, never>, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    validateAbacManualPolicy(data: CerbosAbacJsonRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    upsertAbacManualPolicy(data: CerbosAbacJsonRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    deleteAbacManualPolicy(data: CerbosAbacIdRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    previewAbacCompile(data: Record<string, never>, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    previewAbacPublish(data: CerbosAbacJsonRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    publishAbac(data: CerbosAbacJsonRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    getAbacReleases(data: Record<string, never>, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    rollbackAbacRelease(data: CerbosAbacRevisionRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
    testAbacRuntime(data: CerbosAbacJsonRequest, metadata?: Metadata): Observable<CerbosAbacJsonResponse>;
}
