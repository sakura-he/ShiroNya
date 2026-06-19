<template>
    <a-card
        :bordered="false"
        class="tw:mb-1 tw:flex-auto tw:min-w-0"
        :body-style="{ padding: '8px' }"
    >
        <template #title>
            <span>快捷入口</span>
        </template>
        <template #extra>
            <div class="tw:flex tw:justify-end tw:min-w-0">
                <GiTabs
                    v-model:active-key="activeGroupId"
                    class="shortcut-group-tabs"
                    type="text"
                    size="small"
                    custom-close
                    draggable
                    hide-content
                    :header-padding="false"
                    @change="onShortcutGroupChange"
                    @drag-sort="onGroupDragSort"
                >
                    <a-tab-pane
                        v-for="group in shortcutGroups"
                        :key="group.id"
                        :closable="shortcutGroups.length > 1"
                    >
                        <template #title>
                            <a-dropdown
                                trigger="contextMenu"
                                @select="(val: any) => onGroupContextMenu(val, group.id)"
                            >
                                <span
                                    class="group-tab-title"
                                    @dblclick.stop.prevent="startRenameGroup(group.id)"
                                >
                                    <a-input
                                        v-if="renamingGroupId === group.id"
                                        v-model="renameGroupInput"
                                        size="mini"
                                        class="group-rename-input"
                                        :max-length="12"
                                        @blur="confirmRenameGroup"
                                        @keydown.enter="confirmRenameGroup"
                                        @keydown.escape="cancelRenameGroup"
                                        @click.stop
                                    />
                                    <template v-else>
                                        <span>{{ group.name }}</span>
                                        <a-popconfirm
                                            v-if="shortcutGroups.length > 1"
                                            content="确定删除该分组吗？"
                                            type="warning"
                                            position="bottom"
                                            @ok="doDeleteShortcutGroup(group.id)"
                                        >
                                            <span
                                                class="gi-tabs-close-btn"
                                                @click.stop
                                            >
                                                <icon-close />
                                            </span>
                                        </a-popconfirm>
                                    </template>
                                </span>
                                <template #content>
                                    <a-doption value="rename">
                                        <template #icon>
                                            <IconEdit />
                                        </template>
                                        重命名
                                    </a-doption>
                                </template>
                            </a-dropdown>
                        </template>
                    </a-tab-pane>
                    <template #extra>
                        <a-link
                            :hoverable="false"
                            @click="openCreateGroup"
                        >
                            <icon-plus />
                        </a-link>
                    </template>
                </GiTabs>
            </div>
        </template>

        <VueDraggable
            v-model="shortcutPageItems"
            class="tw:grid tw:grid-cols-4 tw:gap-2"
            :animation="180"
            :delay="120"
            :delay-on-touch-only="true"
            filter=".shortcut-add,.arco-avatar-trigger-icon-mask,.arco-avatar-trigger-icon-mask *"
            :prevent-on-filter="false"
            @start="onShortcutDragStart"
            @end="onShortcutDragEnd"
        >
            <a-card
                v-for="item in shortcutPageItems"
                :key="item.i"
                hoverable
                size="small"
                :bordered="false"
                class="tw:relative tw:cursor-pointer tw:text-center tw:select-none"
                :class="item.i === ADD_TILE_ID ? 'shortcut-add' : ''"
                @click="
                    item.i === ADD_TILE_ID ? openCreateShortcut() : onShortcutClick(item, $event)
                "
            >
                <a-space
                    direction="vertical"
                    align="center"
                    :size="4"
                >
                    <a-dropdown
                        v-if="item.i !== ADD_TILE_ID"
                        trigger="click"
                        position="br"
                        @click.stop
                    >
                        <a-avatar
                            v-if="getShortcutAvatarImage(item)"
                            :size="48"
                            :image-url="getShortcutAvatarImage(item)"
                            trigger-type="mask"
                        >
                            <template #error>
                                {{ getShortcutAvatarText(item) }}
                            </template>
                            <template #trigger-icon>
                                <IconMore />
                            </template>
                        </a-avatar>
                        <a-avatar
                            v-else
                            :size="48"
                            trigger-type="mask"
                        >
                            <DynamicIcon
                                v-if="getShortcutAvatarIcon(item)"
                                :icon="getShortcutAvatarIcon(item)"
                                :size="20"
                            />
                            <template v-else>
                                {{ getShortcutAvatarText(item) }}
                            </template>
                            <template #trigger-icon>
                                <IconMore />
                            </template>
                        </a-avatar>
                        <template #content>
                            <a-doption @click.stop="openEditShortcut(item)">
                                <template #icon>
                                    <IconEdit />
                                </template>
                                编辑
                            </a-doption>
                            <a-doption @click.stop="deleteShortcut(item)">
                                <template #icon>
                                    <IconDelete />
                                </template>
                                <span class="tw:text-red-500">删除</span>
                            </a-doption>
                        </template>
                    </a-dropdown>
                    <template v-else>
                        <a-avatar
                            v-if="getShortcutAvatarImage(item)"
                            :size="48"
                            :image-url="getShortcutAvatarImage(item)"
                        >
                            <template #error>
                                {{ getShortcutAvatarText(item) }}
                            </template>
                        </a-avatar>
                        <a-avatar
                            v-else
                            :size="48"
                        >
                            <DynamicIcon
                                v-if="getShortcutAvatarIcon(item)"
                                :icon="getShortcutAvatarIcon(item)"
                                :size="20"
                            />
                            <template v-else>
                                {{ getShortcutAvatarText(item) }}
                            </template>
                        </a-avatar>
                    </template>
                    <a-typography-text
                        class="tw:text-body-2 tw:mb-0! tw:max-w-full"
                        :ellipsis="{
                            rows: 2,
                            css: true,
                            showTooltip: true,
                        }"
                    >
                        {{ item.label }}
                    </a-typography-text>
                </a-space>
            </a-card>
        </VueDraggable>

        <div
            v-if="shortcutTileTotal > PAGE_SIZE"
            class="tw:flex tw:justify-end tw:mt-2"
        >
            <a-pagination
                v-model:current="currentShortcutPage"
                :total="shortcutTileTotal"
                :page-size="PAGE_SIZE"
                size="mini"
                simple
            />
        </div>
    </a-card>

    <a-modal
        v-model:visible="shortcutModalVisible"
        :title="editingShortcutId == null ? '新建快捷方式' : '编辑快捷方式'"
        :ok-text="editingShortcutId == null ? '创建' : '保存'"
        unmount-on-close
        @before-ok="onShortcutModalBeforeOk"
    >
        <form-create
            :model-value="shortcutForm"
            v-model:api="shortcutFormApi"
            :rule="shortcutFormRules"
            :option="shortcutFormOptions"
            @update:model-value="syncShortcutForm"
        />
    </a-modal>

    <a-modal
        v-model:visible="shortcutGroupModalVisible"
        title="新建分组"
        ok-text="创建"
        unmount-on-close
        @before-ok="onShortcutGroupModalBeforeOk"
    >
        <form-create
            :model-value="shortcutGroupForm"
            v-model:api="shortcutGroupFormApi"
            :rule="shortcutGroupFormRules"
            :option="shortcutFormOptions"
            @update:model-value="syncShortcutGroupForm"
        />
    </a-modal>
</template>

<script setup lang="ts">
    import DynamicIcon from "@/components/DynamicIcon.vue";
    import { GiTabs } from "@/components/GiTabs";
    import IconSelector from "@/components/IconSelector.vue";
    import type {
        Api as FormCreateApi,
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { Message } from "@arco-design/web-vue";
    import {
        IconClose,
        IconDelete,
        IconEdit,
        IconMore,
        IconPlus,
    } from "@arco-design/web-vue/es/icon";
    import { markRaw, shallowRef } from "vue";
    import { VueDraggable } from "vue-draggable-plus";
    import { useRouter } from "vue-router";

    type ShortcutOpenMode = "blank" | "self";
    type ShortcutAvatarType = "text" | "icon" | "image";

    interface ShortcutItem {
        i: number;
        label: string;
        url: string;
        openMode: ShortcutOpenMode;
        avatarType: ShortcutAvatarType;
        iconName?: string;
        avatarText?: string;
        avatarImageUrl?: string;
    }

    interface ShortcutGroup {
        id: string;
        name: string;
        items: ShortcutItem[];
    }

    interface ShortcutStoragePayload {
        activeGroupId?: string;
        groups: ShortcutGroup[];
    }

    defineOptions({
        name: "WorkplaceShortcuts",
    });

    const PAGE_SIZE = 12;
    const SHORTCUT_STORAGE_KEY = "workplace:shortcuts:v1";
    const ADD_TILE_ID = -1;
    const DEFAULT_GROUP_ID = "default";

    const defaultShortcuts: ShortcutItem[] = [
        {
            i: 1,
            label: "Arco",
            url: "https://arco.design/vue/docs/start",
            openMode: "blank",
            avatarType: "text",
            avatarText: "Arco",
            iconName: "IconLink",
        },
        {
            i: 2,
            label: "首页",
            url: "/",
            openMode: "self",
            avatarType: "icon",
            iconName: "IconHome",
        },
        {
            i: 3,
            label: "成员",
            url: "/system/user",
            openMode: "self",
            avatarType: "icon",
            iconName: "IconUser",
        },
        {
            i: 4,
            label: "设置",
            url: "/setting",
            openMode: "self",
            avatarType: "icon",
            iconName: "IconSettings",
        },
    ];

    function createDefaultGroups(): ShortcutGroup[] {
        return [
            {
                id: DEFAULT_GROUP_ID,
                name: "默认",
                items: defaultShortcuts.map((it) => ({ ...it })),
            },
        ];
    }

    function normalizeShortcutAvatarType(it: any): ShortcutAvatarType {
        if (
            it?.avatarType === "image" &&
            typeof it.avatarImageUrl === "string" &&
            it.avatarImageUrl.trim()
        ) {
            return "image";
        }
        if (it?.avatarType === "icon" && typeof it.iconName === "string" && it.iconName.trim()) {
            return "icon";
        }
        if (it?.avatarType === "text") return "text";
        if (typeof it?.avatarImageUrl === "string" && it.avatarImageUrl.trim()) return "image";
        if (typeof it?.iconName === "string" && it.iconName.trim()) return "icon";
        return "text";
    }

    function normalizeShortcutItem(it: any, idx: number): ShortcutItem {
        return {
            i: Number.isFinite(Number(it?.i)) ? Number(it.i) : idx + 1,
            label: String(it?.label ?? "未命名"),
            url: String(it?.url ?? ""),
            openMode: it?.openMode === "self" ? "self" : "blank",
            avatarType: normalizeShortcutAvatarType(it),
            iconName: typeof it?.iconName === "string" ? it.iconName : "",
            avatarText: typeof it?.avatarText === "string" ? it.avatarText : "",
            avatarImageUrl: typeof it?.avatarImageUrl === "string" ? it.avatarImageUrl : "",
        };
    }

    function normalizeShortcutGroup(group: any, idx: number): ShortcutGroup {
        const items = Array.isArray(group?.items) ? group.items : [];
        return {
            id: String(group?.id || `group-${idx + 1}`),
            name: String(group?.name || `分组 ${idx + 1}`),
            items: items
                .filter((it: any) => it && Number(it.i) !== ADD_TILE_ID)
                .map((it: any, itemIndex: number) => normalizeShortcutItem(it, itemIndex)),
        };
    }

    function loadShortcutPayload(): ShortcutStoragePayload {
        try {
            const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY);
            if (!raw) {
                return {
                    activeGroupId: DEFAULT_GROUP_ID,
                    groups: createDefaultGroups(),
                };
            }

            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const items = parsed
                    .filter((it: any) => it && Number(it.i) !== ADD_TILE_ID)
                    .map((it: any, idx: number) => normalizeShortcutItem(it, idx));
                return {
                    activeGroupId: DEFAULT_GROUP_ID,
                    groups: [
                        {
                            id: DEFAULT_GROUP_ID,
                            name: "默认",
                            items: items.length ? items : defaultShortcuts.map((it) => ({ ...it })),
                        },
                    ],
                };
            }

            if (Array.isArray(parsed?.groups) && parsed.groups.length) {
                const groups: ShortcutGroup[] = parsed.groups.map((group: any, idx: number) =>
                    normalizeShortcutGroup(group, idx),
                );
                const activeGroupId = groups.some((group) => group.id === parsed.activeGroupId)
                    ? parsed.activeGroupId
                    : groups[0].id;
                return { activeGroupId, groups };
            }
        } catch {
            // fall through to defaults
        }

        return {
            activeGroupId: DEFAULT_GROUP_ID,
            groups: createDefaultGroups(),
        };
    }

    function persistShortcutGroups() {
        try {
            localStorage.setItem(
                SHORTCUT_STORAGE_KEY,
                JSON.stringify({
                    activeGroupId: activeGroupId.value,
                    groups: shortcutGroups.value,
                }),
            );
        } catch {
            // ignore quota errors
        }
    }

    function buildAddTile(): ShortcutItem {
        return {
            i: ADD_TILE_ID,
            label: "新建",
            url: "",
            openMode: "self",
            avatarType: "text",
            avatarText: "+",
        };
    }

    const payload = loadShortcutPayload();
    const shortcutGroups = ref<ShortcutGroup[]>(payload.groups);
    const activeGroupId = ref<string>(payload.activeGroupId || shortcutGroups.value[0].id);
    const currentShortcutPage = ref(1);

    const currentShortcutGroup = computed<ShortcutGroup>(() => {
        const group =
            shortcutGroups.value.find((it) => it.id === activeGroupId.value) ??
            shortcutGroups.value[0];
        if (group) return group;

        const [fallback] = createDefaultGroups();
        shortcutGroups.value = [fallback];
        activeGroupId.value = fallback.id;
        return fallback;
    });

    const shortcutTiles = computed<ShortcutItem[]>(() => [
        ...currentShortcutGroup.value.items.map((it) => ({ ...it })),
        buildAddTile(),
    ]);

    const shortcutTileTotal = computed(() => shortcutTiles.value.length);
    const shortcutPageCount = computed(() =>
        Math.max(1, Math.ceil(shortcutTileTotal.value / PAGE_SIZE)),
    );
    const shortcutPageStart = computed(() => (currentShortcutPage.value - 1) * PAGE_SIZE);
    const shortcutPageItems = computed<ShortcutItem[]>({
        get() {
            return shortcutTiles.value.slice(
                shortcutPageStart.value,
                shortcutPageStart.value + PAGE_SIZE,
            );
        },
        set(nextItems) {
            setCurrentPageItems(nextItems);
        },
    });

    watch(shortcutPageCount, (pageCount) => {
        if (currentShortcutPage.value > pageCount) {
            currentShortcutPage.value = pageCount;
        }
    });

    function getCurrentGroupIndex(): number {
        return shortcutGroups.value.findIndex(
            (group) => group.id === currentShortcutGroup.value.id,
        );
    }

    function setCurrentGroupItems(items: ShortcutItem[]) {
        const groupIndex = getCurrentGroupIndex();
        if (groupIndex === -1) return;
        shortcutGroups.value[groupIndex] = {
            ...shortcutGroups.value[groupIndex],
            items: items.filter((it) => it.i !== ADD_TILE_ID).map((it) => ({ ...it })),
        };
        persistShortcutGroups();
    }

    function setCurrentPageItems(nextPageItems: ShortcutItem[]) {
        const start = shortcutPageStart.value;
        const nextPageRealItems = nextPageItems
            .filter((it) => it.i !== ADD_TILE_ID)
            .map((it) => ({ ...it }));
        const items = currentShortcutGroup.value.items;
        setCurrentGroupItems([
            ...items.slice(0, start),
            ...nextPageRealItems,
            ...items.slice(start + PAGE_SIZE),
        ]);
    }

    // ---- 分组标签页切换 ----
    function onShortcutGroupChange() {
        currentShortcutPage.value = 1;
        persistShortcutGroups();
    }

    // ---- 分组标签页拖拽排序 ----
    function onGroupDragSort({ oldIndex, newIndex }: { oldIndex: number; newIndex: number }) {
        const groups = [...shortcutGroups.value];
        const [moved] = groups.splice(oldIndex, 1);
        groups.splice(newIndex, 0, moved);
        shortcutGroups.value = groups;
        persistShortcutGroups();
    }

    const shortcutGroupModalVisible = ref(false);
    const shortcutGroupFormApi = shallowRef<FormCreateApi | null>(null);
    const shortcutGroupForm = reactive({
        name: "",
    });

    function openCreateGroup(ev?: Event) {
        ev?.stopPropagation();
        shortcutGroupForm.name = `分组 ${shortcutGroups.value.length + 1}`;
        shortcutGroupModalVisible.value = true;
    }

    // ---- 分组重命名（仅对已激活的 tab 双击触发） ----
    const renamingGroupId = ref<string | null>(null);
    const renameGroupInput = ref("");

    function startRenameGroup(groupId: string) {
        // 只有当前激活的 tab 才能双击重命名
        if (groupId !== activeGroupId.value) return;
        const group = shortcutGroups.value.find((g) => g.id === groupId);
        if (!group) return;
        renamingGroupId.value = groupId;
        renameGroupInput.value = group.name;
        nextTick(() => {
            const input = document.querySelector(".group-rename-input input") as HTMLInputElement;
            input?.focus();
            input?.select();
        });
    }

    function confirmRenameGroup() {
        if (!renamingGroupId.value) return;
        const newName = renameGroupInput.value.trim();
        if (!newName) {
            cancelRenameGroup();
            return;
        }
        const index = shortcutGroups.value.findIndex((g) => g.id === renamingGroupId.value);
        if (index !== -1) {
            const oldName = shortcutGroups.value[index].name;
            if (newName !== oldName) {
                shortcutGroups.value[index] = {
                    ...shortcutGroups.value[index],
                    name: newName,
                };
                persistShortcutGroups();
                Message.success("分组已重命名");
            }
        }
        renamingGroupId.value = null;
    }

    function cancelRenameGroup() {
        renamingGroupId.value = null;
    }

    function onGroupContextMenu(action: string, groupId: string) {
        if (action === "rename") {
            startRenameGroup(groupId);
        }
    }

    async function onShortcutGroupModalBeforeOk() {
        try {
            await shortcutGroupFormApi.value?.validate();
        } catch {
            return false;
        }

        const id = `group-${Date.now()}`;
        shortcutGroups.value = [
            ...shortcutGroups.value,
            {
                id,
                name: shortcutGroupForm.name.trim(),
                items: [],
            },
        ];
        activeGroupId.value = id;
        currentShortcutPage.value = 1;
        persistShortcutGroups();
        Message.success("分组已创建");
        return true;
    }

    function doDeleteShortcutGroup(groupId: string) {
        if (shortcutGroups.value.length <= 1) {
            Message.warning("至少保留一个分组");
            return;
        }

        const index = shortcutGroups.value.findIndex((group) => group.id === groupId);
        if (index === -1) return;

        shortcutGroups.value = shortcutGroups.value.filter((group) => group.id !== groupId);
        if (activeGroupId.value === groupId) {
            activeGroupId.value =
                shortcutGroups.value[Math.max(0, index - 1)]?.id ?? shortcutGroups.value[0].id;
        }
        currentShortcutPage.value = 1;
        persistShortcutGroups();
        Message.success("分组已删除");
    }

    const lastShortcutDragAt = ref(0);

    function onShortcutDragStart() {
        lastShortcutDragAt.value = Date.now();
    }

    function onShortcutDragEnd() {
        lastShortcutDragAt.value = Date.now();
        nextTick(() => {
            setCurrentPageItems(shortcutPageItems.value);
        });
    }

    function isJustDragged(): boolean {
        return Date.now() - lastShortcutDragAt.value < 300;
    }

    function getShortcutAvatarText(item: ShortcutItem): string {
        const text = item.avatarText?.trim() || item.label.trim();
        return text || "快";
    }

    function getShortcutAvatarIcon(item: ShortcutItem): string {
        const iconName = item.iconName?.trim();
        if (item.avatarType !== "icon" || !iconName) return "";
        return iconName;
    }

    function getShortcutAvatarImage(item: ShortcutItem): string {
        const avatarImageUrl = item.avatarImageUrl?.trim();
        if (item.avatarType !== "image" || !avatarImageUrl) return "";
        return avatarImageUrl;
    }

    const router = useRouter();
    function onShortcutClick(item: ShortcutItem, evt: MouseEvent) {
        if (isJustDragged()) {
            evt.preventDefault();
            evt.stopPropagation();
            return;
        }
        openShortcut(item);
    }

    function openShortcut(item: ShortcutItem) {
        const url = item.url?.trim();
        if (!url) {
            Message.warning("快捷方式未配置链接");
            return;
        }
        if (item.openMode === "blank") {
            window.open(url, "_blank", "noopener,noreferrer");
            return;
        }
        if (/^https?:\/\//i.test(url)) {
            window.location.href = url;
        } else {
            router.push(url).catch(() => {
                window.location.href = url;
            });
        }
    }

    const shortcutModalVisible = ref(false);
    const editingShortcutId = ref<number | null>(null);
    const shortcutFormApi = shallowRef<FormCreateApi | null>(null);
    const shortcutIconSelectorComponent = markRaw(IconSelector);
    const shortcutForm = reactive<{
        label: string;
        url: string;
        openMode: ShortcutOpenMode;
        avatarType: ShortcutAvatarType;
        iconName: string;
        avatarText: string;
        avatarImageUrl: string;
    }>({
        label: "",
        url: "",
        openMode: "blank",
        avatarType: "text",
        iconName: "",
        avatarText: "",
        avatarImageUrl: "",
    });
    const shortcutFormOptions: FormCreateOptions = {
        form: { layout: "vertical" },
        row: { gutter: 12 },
        submitBtn: false,
        resetBtn: false,
    };
    const shortcutFormRules = computed<FormCreateRule[]>(() => {
        const rules: FormCreateRule[] = [
            {
                field: "label",
                title: "名称",
                type: "input",
                props: {
                    allowClear: true,
                    placeholder: "请输入快捷方式名称",
                    maxLength: 20,
                    showWordLimit: true,
                },
                validate: [{ required: true, message: "请输入名称", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "url",
                title: "链接",
                type: "input",
                props: {
                    allowClear: true,
                    placeholder: "https://example.com 或 /dashboard/workplace",
                },
                validate: [
                    { required: true, message: "请输入链接", trigger: "change" },
                    { validator: validateShortcutUrlRule, trigger: "change" },
                ],
                col: { span: 24 },
            },
            {
                field: "openMode",
                title: "打开方式",
                type: "radio",
                props: {
                    options: [
                        { label: "新窗口", value: "blank" },
                        { label: "当前页面", value: "self" },
                    ],
                },
                col: { span: 24 },
            },
            {
                field: "avatarType",
                title: "头像类型",
                type: "radio",
                props: {
                    options: [
                        { label: "文字", value: "text" },
                        { label: "图标", value: "icon" },
                        { label: "图片", value: "image" },
                    ],
                },
                col: { span: 24 },
            },
        ];

        if (shortcutForm.avatarType === "text") {
            rules.push({
                field: "avatarText",
                title: "头像文字",
                type: "input",
                props: {
                    allowClear: true,
                    placeholder: "默认使用名称",
                    maxLength: 8,
                    showWordLimit: true,
                },
                col: { span: 24 },
            });
        }

        if (shortcutForm.avatarType === "icon") {
            rules.push({
                field: "iconName",
                title: "图标",
                type: "shortcutIconSelector",
                component: shortcutIconSelectorComponent,
                props: { allowClear: true },
                col: { span: 24 },
            });
        }

        if (shortcutForm.avatarType === "image") {
            rules.push({
                field: "avatarImageUrl",
                title: "头像图片",
                type: "input",
                props: {
                    allowClear: true,
                    placeholder: "https://example.com/avatar.png 或 /avatar.png",
                },
                validate: [{ validator: validateShortcutImageUrlRule, trigger: "change" }],
                col: { span: 24 },
            });
        }

        return rules;
    });
    const shortcutGroupFormRules: FormCreateRule[] = [
        {
            field: "name",
            title: "分组名称",
            type: "input",
            props: {
                allowClear: true,
                placeholder: "请输入分组名称",
                maxLength: 12,
                showWordLimit: true,
            },
            validate: [{ required: true, message: "请输入分组名称", trigger: "change" }],
            col: { span: 24 },
        },
    ];

    function resetShortcutForm() {
        shortcutForm.label = "";
        shortcutForm.url = "";
        shortcutForm.openMode = "blank";
        shortcutForm.avatarType = "text";
        shortcutForm.iconName = "";
        shortcutForm.avatarText = "";
        shortcutForm.avatarImageUrl = "";
    }

    function openCreateShortcut() {
        editingShortcutId.value = null;
        resetShortcutForm();
        shortcutModalVisible.value = true;
    }

    function openEditShortcut(item: ShortcutItem) {
        editingShortcutId.value = item.i;
        shortcutForm.label = item.label;
        shortcutForm.url = item.url;
        shortcutForm.openMode = item.openMode;
        shortcutForm.avatarType = item.avatarType;
        shortcutForm.iconName = item.iconName ?? "";
        shortcutForm.avatarText = item.avatarText ?? "";
        shortcutForm.avatarImageUrl = item.avatarImageUrl ?? "";
        shortcutModalVisible.value = true;
    }

    function deleteShortcut(item: ShortcutItem) {
        setCurrentGroupItems(currentShortcutGroup.value.items.filter((it) => it.i !== item.i));
        Message.success("已删除");
    }

    function validateShortcutUrl(value: string, cb: (msg?: string) => void) {
        if (!value) return cb();
        const v = value.trim();
        if (v.startsWith("/")) return cb();
        if (/^https?:\/\/.+/i.test(v)) return cb();
        cb("请输入合法的 http(s) 链接或以 / 开头的站内路径");
    }

    function validateShortcutUrlRule(
        _rule: unknown,
        value: string,
        callback: (msg?: string) => void,
    ) {
        validateShortcutUrl(value, callback);
    }

    function validateShortcutImageUrl(value: string, cb: (msg?: string) => void) {
        if (!value) return cb();
        const v = value.trim();
        if (!v) return cb();
        if (v.startsWith("/")) return cb();
        if (/^https?:\/\/.+/i.test(v)) return cb();
        cb("请输入合法的 http(s) 图片地址或以 / 开头的站内路径");
    }

    function validateShortcutImageUrlRule(
        _rule: unknown,
        value: string,
        callback: (msg?: string) => void,
    ) {
        validateShortcutImageUrl(value, callback);
    }

    function syncShortcutForm(value: Partial<typeof shortcutForm>) {
        Object.assign(shortcutForm, value);
    }

    function syncShortcutGroupForm(value: Partial<typeof shortcutGroupForm>) {
        Object.assign(shortcutGroupForm, value);
    }

    function buildShortcutByForm(id: number): ShortcutItem {
        return {
            i: id,
            label: shortcutForm.label.trim(),
            url: shortcutForm.url.trim(),
            openMode: shortcutForm.openMode,
            avatarType: shortcutForm.avatarType,
            iconName: shortcutForm.iconName.trim(),
            avatarText: shortcutForm.avatarText.trim(),
            avatarImageUrl: shortcutForm.avatarImageUrl.trim(),
        };
    }

    async function onShortcutModalBeforeOk() {
        try {
            await shortcutFormApi.value?.validate();
        } catch {
            return false;
        }

        const realShortcuts = currentShortcutGroup.value.items;
        if (editingShortcutId.value == null) {
            const nextId = realShortcuts.reduce((m, it) => Math.max(m, it.i), 0) + 1;
            setCurrentGroupItems([...realShortcuts, buildShortcutByForm(nextId)]);
            currentShortcutPage.value = shortcutPageCount.value;
            Message.success("已创建");
        } else {
            const id = editingShortcutId.value;
            const next = realShortcuts.map((it) =>
                it.i === id
                    ? {
                          ...it,
                          ...buildShortcutByForm(id),
                      }
                    : it,
            );
            setCurrentGroupItems(next);
            Message.success("已更新");
        }
        return true;
    }
</script>

<style scoped lang="scss">
    .shortcut-group-tabs {
        max-width: 280px;
    }

    .shortcut-group-tabs :deep(.arco-tabs-nav) {
        justify-content: flex-end;
    }

    .group-tab-title {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        min-width: 0;
    }

    .group-rename-input {
        width: 80px;
    }
</style>
