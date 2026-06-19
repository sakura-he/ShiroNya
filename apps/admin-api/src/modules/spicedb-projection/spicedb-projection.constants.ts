export const ADMIN_SPICEDB_BASE_RELATION_PROJECTION_CONSUMER_GROUP = 'admin-api-spicedb-base-relation-projection';

export type UserGroupMemberProjectionInput = {
    userId: string;
    groupId: number;
    zedToken?: string | null;
};

export type UserRoleProjectionInput = {
    userId: string;
    roleId: number;
    zedToken?: string | null;
};

export type UserGroupRoleProjectionInput = {
    groupId: number;
    roleId: number;
    zedToken?: string | null;
};

export type MenuRoleProjectionInput = {
    menuId: number;
    roleId: number;
    relation: string;
    zedToken?: string | null;
};

export type AdminSpiceDbRelationshipChangeEvent = {
    id?: string;
    zedToken?: string;
    operation: string;
    resourceType?: string;
    resourceId?: string;
    relation?: string;
    subjectType?: string;
    subjectId?: string;
    subjectRelation?: string;
};
