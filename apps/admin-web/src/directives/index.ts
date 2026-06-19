import { App } from "vue";
import installLoadingDirective from "./loading";

/**
 * 注册全局 Vue 指令。权限相关使用 ShiroAuth 组件统一处理，无需再注册 v-perms 指令。
 */
export default function setupGlobalDirectives(app: App) {
    installLoadingDirective(app);
}
