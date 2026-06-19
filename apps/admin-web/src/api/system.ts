import { request } from "./index";

export function getSystemMenuList() {
    return request("/api/system/menu/list", {
        method: "get",
    });
}
export function getSystemDemoTable() {
    return request("/api/system/demoTable", {
        method: "get",
    });
}
