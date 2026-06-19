import { createRouter, createWebHashHistory } from "vue-router";
import createRouterGuard from "./gruad";
import "./type.ts";
import { HOME_ROUTE, LOGIN_ROUTE, NOT_FOUND_ROUTE } from "./routes/base";
let router = createRouter({
    history: createWebHashHistory(),
    routes: [HOME_ROUTE, LOGIN_ROUTE, NOT_FOUND_ROUTE],
    scrollBehavior: () => ({ left: 0, top: 0 }),
});
createRouterGuard(router);
export { router };
