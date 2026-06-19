import { useUserStore } from "@/store";

/**
 * 判断当前登录用户是否拥有指定权限点。
 *
 * 设计前提：后端 /account/navigation 接口已经根据 RBAC effective 读模型把当前用户
 * 能访问的全部菜单/按钮 permission 字符串展开成扁平数组返回给前端，前端只做
 * token 集合 membership 检查，不做通配、表达式或继承推导。
 *
 * 入参：
 * - 字符串：单个权限 token，例如 "system.user.detail"。
 * - 字符串数组：多个 token，命中要求"全部具备"。需要"任一具备"的语义请在调用处用 .some。
 *
 * 返回：用户是否拥有该权限。空数组或空串视为非法调用，直接抛错以避免静默放行。
 */
export function hasPermission(validatePermission: string[] | string): boolean {
    if (!validatePermission || validatePermission.length === 0) {
        throw new Error("权限校验缺少权限 token");
    }

    const userStore = useUserStore();
    const permissionSet = userStore.permissionSet;

    if (typeof validatePermission === "string") {
        return permissionSet.has(validatePermission);
    }

    return validatePermission.every((token) => permissionSet.has(token));
}
