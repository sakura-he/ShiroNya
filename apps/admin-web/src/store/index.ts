import { createPinia } from "pinia";
let pinia = createPinia();
export {
    MENU_WIDTH_MAX,
    MENU_WIDTH_MIN,
    subscribeConfigStore,
    useConfigStore,
} from "./modules/config/index";
export { subscribeMultipleTabsStore, useMultipleTabs } from "./modules/multipleTab";
export { subscribeNavigateStore, useNavigateStore } from "./modules/navigate";
export { useUserStore, subscribeUserStore } from "./modules/user";
export { pinia };
