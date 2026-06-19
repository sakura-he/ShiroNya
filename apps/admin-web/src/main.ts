import "@/api";
import { router } from "@/router/index";
import { default as ArcoVue, Message } from "@arco-design/web-vue";
import formCreate from "@form-create/arco-design";
import { createApp } from "vue";
import App from "./App.vue";
import { pinia } from "./store";

import "@arco-design/web-vue/dist/arco.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@/styles/index.scss";
import "@/styles/tailwind.css";
// 额外引入图标库
import ArcoVueIcon from "@arco-design/web-vue/es/icon";
import setupGlobalDirectives from "./directives";

// 初始化后台前端应用，并集中注册全局插件、路由、状态和指令。
async function bootstrap() {
    const app = createApp(App);
    Message._context = app._context;
    app.use(router);
    app.use(pinia);
    app.use(ArcoVue);
    app.use(ArcoVueIcon);
    app.use(formCreate, {
        col: {
            xs: 24,
            sm: 24,
            md: 12,
            lg: 8,
            xl: 8,
            xxl: 8,
        },
    });
    // 安装全局指令
    setupGlobalDirectives(app);
    await router.isReady();
    app.mount("#app");
}
bootstrap();
