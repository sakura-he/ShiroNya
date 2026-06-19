<template>
    <a-row
        align="center"
        class="container"
    >
        <!-- 左侧logo -->
        <a-col
            :flex="`${menuWidth}`"
            class="left"
        >
            <div
                class="left-side"
                :class="[menuCollapse ? 'collapse' : '']"
            >
                <div class="logo">
                    <img
                        class="logo_img"
                        :src="menuCollapse ? collapsedLogoUrl : expandedLogoUrl"
                        alt=""
                    />
                </div>
            </div>
        </a-col>
        <a-col
            flex="initial"
            v-if="configStore.config.device <= deviceEnum['sm']"
        >
            <!-- 控制侧边菜单折叠按钮(手机模式下现实) -->
            <a-button
                type="text"
                class="nav-btn"
                @click="updateMenuCollapse(!menuCollapse)"
            >
                <template
                    #icon
                    color="#333"
                >
                    <!-- 已隐藏 -->
                    <icon-menu-fold v-if="menuCollapse" />
                    <!-- 已展开 -->
                    <icon-menu-unfold v-else />
                </template>
            </a-button>
            <!--刷新按钮 -->
        </a-col>
        <!-- 中间区域 -->
        <a-col
            class="tw:h-full tw:flex tw:items-center"
            flex="1"
            v-if="configStore.config.device > deviceEnum['sm']"
        >
            <Menu
                v-if="props.layout === LayoutEnum.LAYOUT_TOP"
                mode="horizontal"
                :name="'1'"
                :show_icon="false"
            />
            <a-breadcrumb
                v-show="props.layout !== LayoutEnum.LAYOUT_TOP"
                class="header-breadcrumb"
            >
                <template
                    :key="item.id"
                    v-for="item in breadcurmb"
                >
                    <a-breadcrumb-item
                        v-if="getBreadcrumbDropdownItems(item).length"
                        :dropdown-props="breadcrumbDropdownProps"
                    >
                        <span class="header-breadcrumb__item">
                            <DynamicIcon
                                v-if="item.icon"
                                :icon="item.icon"
                            />
                            <span>{{ item.title }}</span>
                        </span>
                        <template #droplist>
                            <a-doption
                                v-for="child in getBreadcrumbDropdownItems(item)"
                                :key="child.path"
                                :value="child.path"
                            >
                                <template
                                    v-if="child.icon"
                                    #icon
                                >
                                    <DynamicIcon :icon="child.icon" />
                                </template>
                                {{ child.label }}
                            </a-doption>
                        </template>
                    </a-breadcrumb-item>
                    <a-breadcrumb-item v-else>
                        <span class="header-breadcrumb__item">
                            <DynamicIcon
                                v-if="item.icon"
                                :icon="item.icon"
                            />
                            <span>{{ item.title }}</span>
                        </span>
                    </a-breadcrumb-item>
                </template>
            </a-breadcrumb>
        </a-col>
        <!-- 右侧按钮组 -->
        <a-col
            flex="initial"
            class="right-side__col"
        >
            <!-- 顶部导航栏按钮组 -->
            <a-space>
                <!-- 颜色模式切换 -->
                <ColorModeSwitch v-slot="icon">
                    <a-button :shape="'circle'">
                        <template v-slot:icon>
                            <DynamicIcon :icon="icon.icon" />
                        </template>
                    </a-button>
                </ColorModeSwitch>
                <!-- 全屏按钮 -->
                <a-button
                    type="secondary"
                    shape="circle"
                    class="right-side__btn"
                    @click="toggleFullscreen"
                >
                    <icon-fullscreen v-show="!isFullscreen" />
                    <icon-fullscreen-exit v-show="isFullscreen" />
                </a-button>
                <!-- 设置按钮 -->
                <a-button
                    type="secondary"
                    shape="circle"
                    class="right-side__btn"
                    @click="onSetting"
                >
                    <icon-settings />
                </a-button>
            </a-space>
            <!-- 右侧头像 -->
            <a-dropdown trigger="hover">
                <div class="right-side__avatar">
                    <img
                        src="@/assets/avatar.png"
                        alt=""
                        class="right-side__avatar-img"
                    />
                </div>
                <template v-slot:content>
                    <a-doption>
                        <a-space>
                            <icon-user />
                            <span>用户中心</span>
                        </a-space>
                    </a-doption>
                    <a-doption @click="logout">
                        <a-space>
                            <icon-export />
                            <span>退出登录</span>
                        </a-space>
                    </a-doption>
                </template>
            </a-dropdown>
        </a-col>
    </a-row>
</template>

<script setup lang="ts">
    import collapsedLogoUrl from "@/assets/logo.svg";
    import expandedLogoUrl from "@/assets/logo2.svg";
    import { useConfigStore, useNavigateStore, useUserStore } from "@/store";
    // 刷新按钮组件，复用
    import DynamicIcon from "@/components/DynamicIcon.vue";
    import Menu from "@/layout/components/Menu.vue";
    import { LayoutEnum, MenuEnum } from "@/router/type";
    import { deviceEnum } from "@/store/modules/config/types";
    import { useFullscreen } from "@vueuse/core";
    import { Ref } from "vue";
    import { useRouter } from "vue-router";
    import ColorModeSwitch from "./ColorModeSwitch.vue";
    let props = defineProps({
        layout: {
            type: String,
            default: LayoutEnum.LAYOUT_SIDE,
        },
    });
    let userStore = useUserStore();
    let configStore = useConfigStore();
    let navigateStore = useNavigateStore();
    let router = useRouter();
    let breadcurmb = computed(() => navigateStore.breadCrumb);
    const breadcrumbDropdownProps = {
        trigger: "hover" as const,
        onSelect: onBreadcrumbDropdownSelect,
    };
    let menuCollapse = inject<Ref<boolean>>("menuCollapse")!;
    let updateMenuCollapse = inject<(value: boolean) => void>("updateMenuCollapse")!;
    let menuWidth = computed(() => {
        if (menuCollapse.value) return 48 + "px";
        return configStore.config.menuWidth + "px";
    });
    // 打开全局设置
    /** 切换全局设置面板的显示状态 */
    function onSetting() {
        configStore.config.globalSettings = !configStore.config.globalSettings;
    }

    function isVisibleBreadcrumbMenu(item: any) {
        return item?.type !== MenuEnum.Button && item?.isMenuVisible !== false;
    }

    function getBreadcrumbChildren(item: any) {
        if (!Array.isArray(item?.children)) {
            return [];
        }
        return item.children.filter(isVisibleBreadcrumbMenu);
    }

    function getBreadcrumbDropdownItems(item: any) {
        return getBreadcrumbChildren(item)
            .map((child: any) => {
                const path = resolveBreadcrumbDropdownPath(child);
                return path ? { icon: child.icon, label: child.title, path } : undefined;
            })
            .filter((child: unknown): child is { icon?: string; label: string; path: string } =>
                Boolean(child),
            );
    }

    function resolveBreadcrumbDropdownPath(item: any): string | undefined {
        if (!isVisibleBreadcrumbMenu(item)) {
            return undefined;
        }
        if (item.type === MenuEnum.Page && typeof item.path === "string" && item.path) {
            return item.path;
        }
        if (item.type === MenuEnum.Catalog && Array.isArray(item.children)) {
            for (const child of item.children) {
                const childPath = resolveBreadcrumbDropdownPath(child);
                if (childPath) {
                    return childPath;
                }
            }
        }
        return undefined;
    }

    function onBreadcrumbDropdownSelect(value: unknown) {
        if (typeof value === "string" && value) {
            void router.push(value);
        }
    }

    /** 调用 Better Auth 登出并清理前端用户态 */
    function logout() {
        void userStore.logout();
    }
    // 切换全屏以及全屏状态
    let { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
</script>

<style scoped lang="scss">
    .container {
        height: 60px;
        width: 100%;
        box-sizing: border-box;
        border-bottom: 1px solid var(--color-border-1);
        overflow: hidden;
        z-index: 10;
        background-color: var(--color-bg-2);
        backdrop-filter: blur(25px) saturate(150%);
    }

    :deep(.arco-menu),
    :deep(.arco-menu-inner),
    :deep(.arco-menu-item),
    :deep(.arco-menu-inline-header) {
        background: transparent !important;
    }

    :deep(.arco-menu-item:hover),
    :deep(.arco-menu-selected),
    :deep(.arco-menu-item.arco-menu-selected) {
        background: transparent !important;
    }

    .left {
        min-width: 0;
        overflow: hidden;
        transition:
            flex 0.2s ease,
            width 0.2s ease,
            max-width 0.2s ease;
    }

    .left-side {
        display: flex;
        padding: 0 20px;
        box-sizing: border-box;
        align-items: center;
        column-gap: 10px;
        height: 60px;
        width: 100%;
        overflow: hidden;
        transition:
            column-gap 0.2s ease,
            padding 0.2s ease;

        &.collapse {
            padding: 0;
            column-gap: 0;
            justify-content: center;
        }

        .logo {
            flex: 0 1 clamp(48px, 42%, 112px);
            min-width: 0;
            max-width: calc(100% - 10px);
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            overflow: hidden;
            transition: flex-basis 0.2s ease;

            .logo_img {
                display: block;
                width: 100%;
                max-width: 100%;
                height: 70%;
                object-fit: contain;
                object-position: left center;
                transition:
                    width 0.2s ease,
                    height 0.2s ease,
                    max-height 0.2s ease;
            }
        }

        &.collapse .logo {
            flex: 1 1 100%;
            justify-content: center;
        }

        &.collapse .logo_img {
            height: auto;
            max-height: 70%;
            object-position: center;
        }

    }

    .right-side__col {
        padding-right: 20px;
        display: flex;
        align-items: center;
        margin-left: auto;
    }

    .right-side__col > * {
        margin-left: 20px;
    }

    .header-breadcrumb {
        :deep(.arco-breadcrumb-item) {
            display: inline-flex;
            align-items: center;
            line-height: 24px;
            vertical-align: middle;
        }

        :deep(.arco-breadcrumb-item-dropdown-icon) {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
        }

        :deep(.arco-breadcrumb-item-dropdown-icon .arco-icon) {
            display: block;
        }

        &__item {
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
    }

    .right-side__avatar {
        border-radius: 999vw;
        width: 40px;
        height: 40px;
        overflow: hidden;
    }

    .right-side__btn {
        border-color: rgb(var(--gray-2)) !important;
        color: rgb(var(--gray-8)) !important;
        font-size: 16px;
    }

    .right-side__avatar-img {
        width: 100%;
    }

</style>
