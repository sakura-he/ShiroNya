const APP_RBAC_ROUTE_PREFIX = "#/app/app-rbac-";

export function isAppRbacRoute() {
    return typeof window !== "undefined" && window.location.hash.startsWith(APP_RBAC_ROUTE_PREFIX);
}

export function resolveRbacApiPath(adminPath: string, appPath: string) {
    return isAppRbacRoute() ? appPath : adminPath;
}
