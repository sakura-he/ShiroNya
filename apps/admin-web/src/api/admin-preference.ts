import { request } from "@/api/index";

export const ADMIN_PREFERENCE_KEYS = [
    "themeColor",
    "menuWidth",
    "tabBar",
    "showTabsPinIcon",
    "translucent",
    "openingAnimation",
    "quitAnimation",
    "colorWeak",
] as const;

export type AdminPreferenceKey = (typeof ADMIN_PREFERENCE_KEYS)[number];
export type AdminPreferenceValue = string | number | boolean;

export interface AdminPreferencePolicy {
    key: AdminPreferenceKey;
    label: string;
    group: string;
    sort: number;
    value: AdminPreferenceValue;
    userEditable: boolean;
}

export interface AdminPreferenceEffective {
    effective: Record<AdminPreferenceKey, AdminPreferenceValue>;
    userValues: Partial<Record<AdminPreferenceKey, AdminPreferenceValue>>;
    policies: Record<AdminPreferenceKey, AdminPreferencePolicy>;
}

export function queryMyAdminPreferencesApi() {
    return request.post<AdminPreferenceEffective>(
        "/system/admin-preference/query_my_admin_preferences",
        {},
    );
}

export function updateMyAdminPreferencesApi(
    values: Partial<Record<AdminPreferenceKey, AdminPreferenceValue>>,
) {
    return request.post<null>("/system/admin-preference/update_my_admin_preferences", { values });
}

export function queryAdminPreferencePolicyApi() {
    return request.post<AdminPreferencePolicy[]>(
        "/system/admin-preference/query_admin_preference_policy",
        {},
    );
}

export function updateAdminPreferencePolicyApi(
    policies: Array<Pick<AdminPreferencePolicy, "key" | "value" | "userEditable">>,
) {
    return request.post<null>("/system/admin-preference/update_admin_preference_policy", {
        policies,
    });
}
