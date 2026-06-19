<script lang="tsx">
    import { MenuEnum } from "@/router/type";
    import { useNavigateStore } from "@/store/modules/navigate";
    import { Ref } from "vue";
    import { useRouter } from "vue-router";
    import DynamicIcon from "../../components/DynamicIcon.vue";

    interface LayoutMenuNode {
        id: number;
        title: string;
        type: MenuEnum;
        path?: string;
        icon?: string | null;
        isMenuVisible?: boolean;
        children?: LayoutMenuNode[];
    }

    function getMenuKey(item: LayoutMenuNode) {
        return String(item.id);
    }

    function filterVisibleMenus(menus: LayoutMenuNode[]): LayoutMenuNode[] {
        return menus
            .filter((menu) => menu.isMenuVisible !== false && menu.type !== MenuEnum.Button)
            .map((menu) => ({
                ...menu,
                children: Array.isArray(menu.children) ? filterVisibleMenus(menu.children) : [],
            }));
    }

    function collectMenuNodes(menus: LayoutMenuNode[]) {
        const nodeMap = new Map<string, LayoutMenuNode>();
        const walk = (nodes: LayoutMenuNode[]) => {
            nodes.forEach((node) => {
                nodeMap.set(getMenuKey(node), node);
                if (Array.isArray(node.children)) {
                    walk(node.children);
                }
            });
        };

        walk(menus);
        return nodeMap;
    }

    function renderMenuNode(item: LayoutMenuNode, showIcon: boolean) {
        const key = getMenuKey(item);
        const iconSlot = () => (showIcon && item.icon ? <DynamicIcon icon={item.icon} /> : null);

        if (item.type === MenuEnum.Catalog) {
            return (
                <a-sub-menu key={key}>
                    {{
                        title: () => item.title,
                        icon: iconSlot,
                        default: () =>
                            item.children?.map((child) => renderMenuNode(child, showIcon)),
                    }}
                </a-sub-menu>
            );
        }

        if (item.type === MenuEnum.Page) {
            return (
                <a-menu-item key={key}>
                    {{
                        icon: iconSlot,
                        default: () => <span>{item.title}</span>,
                    }}
                </a-menu-item>
            );
        }

        return null;
    }

    export default defineComponent({
        name: "MenuComponent",
        inheritAttrs: false,
        props: {
            show_icon: {
                type: Boolean,
                default: true,
            },
        },
        setup(props, ctx) {
            let navigateStore = useNavigateStore();
            let router = useRouter();
            let menuCollapse = inject<Ref<boolean>>("menuCollapse");

            const menuTree = computed(() =>
                filterVisibleMenus(navigateStore.treeRoutes as LayoutMenuNode[]),
            );
            const menuNodeMap = computed(() => collectMenuNodes(menuTree.value));
            const selectedKeys = computed(() =>
                navigateStore.currentSelectedMenuKey ? [navigateStore.currentSelectedMenuKey] : [],
            );

            // 点击菜单项跳转指定的路径
            function onMenuItemClick(key: string) {
                const currentMenu = menuNodeMap.value.get(String(key));
                if (currentMenu?.type === MenuEnum.Page && currentMenu.path) {
                    void router.push(currentMenu.path);
                }
            }

            return () => (
                <div class="menu-container">
                    <a-scrollbar
                        outerStyle={{
                            minHeight: 0,
                            flex: "1 1 auto",
                            overflow: "hidden",
                        }}
                        style={{
                            height: "100%",
                            minHeight: 0,
                            overflowX: "hidden",
                            overflowY: "auto",
                        }}
                        disableHorizontal
                    >
                        <a-menu
                            {...ctx.attrs}
                            model:collapsed={menuCollapse?.value ?? false}
                            show-collapse-button={false}
                            onMenuItemClick={onMenuItemClick}
                            onUpdate:openKeys={(keys: string[]) =>
                                navigateStore.setOpenMenuKeys(keys)
                            }
                            selected-keys={selectedKeys.value}
                            openKeys={navigateStore.openMenuKeys}
                        >
                            {menuTree.value.map((item) => renderMenuNode(item, props.show_icon))}
                        </a-menu>
                    </a-scrollbar>
                </div>
            );
        },
    });
</script>
<style scoped lang="scss">
    .menu-container {
        width: 100%;
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 100%;
        user-select: none;
    }

    :deep(.arco-menu-inner) {
        .arco-menu-inline-header {
            display: flex;
            align-items: center;
        }

        .arco-icon {
            &:not(.arco-icon-down) {
                font-size: 18px;
            }
        }
    }

    :deep(.arco-menu),
    :deep(.arco-menu-inner) {
        background: transparent !important;
    }

    :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-item:not(:hover)),
    :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-group-title:not(:hover)),
    :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-pop-header:not(:hover)),
    :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-inline-header:not(:hover)) {
        background: transparent !important;
        box-shadow: none;
    }

    :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-selected-label) {
        background: transparent !important;
    }

    :deep(.arco-menu:not(.arco-menu-horizontal) .arco-menu-inner) {
        height: auto;
        overflow: visible;
    }
</style>
