import { Router } from "vue-router";
import setupUserLoginInfoGuard from "./userLoginInfoGuard";
import setupPermissionGuard from "./permissionGuard";
import setupMultipleTabsGuard from "./multipleTabsGuard";
export default function createRouterGuard(router: Router) {
    setupUserLoginInfoGuard(router);
    setupPermissionGuard(router);
    setupMultipleTabsGuard(router);
}
