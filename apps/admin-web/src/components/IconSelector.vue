<template>
    <a-row
        :gutter="8"
        :wrap="false"
        class="tw:w-full tw:min-w-0"
    >
        <a-col
            :span="7"
            class="tw:min-w-0"
        >
            <a-select
                v-model="selectedType"
                class="tw:w-full"
                :options="iconSourceOptions"
                :trigger-props="{ autoFitPopupWidth: false, autoFitPopupMinWidth: true }"
                @change="onTypeChange"
            />
        </a-col>

        <a-col
            :span="17"
            class="tw:min-w-0"
        >
            <a-popover
                v-model:popup-visible="popupVisible"
                trigger="click"
                position="bottom"
                auto-fit-position
                update-at-scroll
                render-to-body
                :content-style="{ width: '300px', boxSizing: 'border-box' }"
            >
                <a-input
                    v-bind="$attrs"
                    class="tw:w-full"
                    :model-value="currentIconName"
                    :allow-clear="props.allowClear"
                    placeholder="请选择图标"
                    @update:model-value="onInputUpdate"
                >
                    <template #prefix>
                        <DynamicIcon
                            v-if="currentIconName"
                            :icon="currentIconName"
                            :size="16"
                        />
                        <icon-search v-else />
                    </template>
                </a-input>

                <template #content>
                    <div class="tw:w-full tw:min-w-0 tw:box-border tw:overflow-hidden">
                        <div
                            class="tw:mb-2 tw:w-full tw:text-center tw:text-title-1 tw:leading-6 tw:text-c-1"
                        >
                            图标选择器
                        </div>

                        <div
                            class="tw:flex tw:w-full tw:min-w-0 tw:items-center tw:gap-2 [&_.arco-btn]:tw:flex-none [&_.arco-input-wrapper]:tw:min-w-0 [&_.arco-input-wrapper]:tw:flex-1"
                        >
                            <a-input
                                v-model="searchValue"
                                allow-clear
                                size="small"
                                placeholder="搜索图标名称"
                            >
                                <template #prefix>
                                    <icon-search />
                                </template>
                            </a-input>
                            <a-button
                                size="small"
                                @click="toggleViewMode"
                            >
                                <template #icon>
                                    <icon-apps v-if="isGridView" />
                                    <icon-unordered-list v-else />
                                </template>
                            </a-button>
                        </div>

                        <a-scrollbar
                            class="tw:mt-2 tw:max-h-[220px] tw:w-full tw:overflow-x-hidden"
                        >
                            <div
                                class="tw:grid tw:w-full tw:box-border tw:gap-2"
                                :class="isGridView ? 'tw:grid-cols-6' : 'tw:grid-cols-2'"
                            >
                                <div
                                    v-for="iconName in currentPageIconNames"
                                    :key="iconName"
                                    class="tw:flex tw:h-8 tw:box-border tw:cursor-pointer tw:items-center tw:overflow-hidden tw:rounded-[2px] tw:border tw:border-solid tw:border-cb-2 tw:text-title-2 tw:text-c-2 tw:transition-all tw:duration-200 tw:ease-in-out tw:hover:border-cb-3 tw:hover:bg-cf-2 tw:hover:text-p-6"
                                    :class="[
                                        isGridView
                                            ? 'tw:flex-col tw:justify-center tw:px-1'
                                            : 'tw:flex-row tw:justify-start tw:gap-2 tw:px-2',
                                        currentIconName === iconName
                                            ? 'tw:border-p-6 tw:bg-p-1 tw:text-p-6'
                                            : '',
                                    ]"
                                    @click="selectIcon(iconName)"
                                >
                                    <DynamicIcon
                                        :icon="iconName"
                                        :size="18"
                                    />
                                    <span
                                        :class="
                                            isGridView
                                                ? 'tw:hidden'
                                                : 'tw:block tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-body-2 tw:text-c-2'
                                        "
                                    >
                                        {{ iconName }}
                                    </span>
                                </div>
                            </div>
                        </a-scrollbar>

                        <div
                            v-if="totalIconCount > pageSize"
                            class="tw:mt-3 tw:flex tw:justify-center"
                        >
                            <a-pagination
                                v-model:current="currentPage"
                                size="mini"
                                :page-size="pageSize"
                                :total="totalIconCount"
                                :show-size-changer="false"
                            />
                        </div>

                        <a-empty
                            v-else-if="totalIconCount === 0"
                            description="未找到匹配的图标"
                            :image-size="80"
                        />
                    </div>
                </template>
            </a-popover>
        </a-col>
    </a-row>
</template>

<script setup lang="ts">
    import { Message } from "@arco-design/web-vue";
    import { useClipboard } from "@vueuse/core";
    import DynamicIcon from "@/components/DynamicIcon.vue";
    import {
        filterIconNames,
        getIconNamesBySource,
        inferIconSourceType,
        loadIconParkOutlineIconNames,
        loadRemixIconNames,
        type IconSourceType,
    } from "@/utils/iconRegistry";

    defineOptions({
        inheritAttrs: false,
    });

    const props = withDefaults(
        defineProps<{
            modelValue?: string | null;
            allowClear?: boolean;
            enableCopy?: boolean;
        }>(),
        {
            allowClear: true,
            enableCopy: false,
        },
    );

    const emits = defineEmits<{
        (e: "select", value: string): void;
        (e: "update:modelValue", value: string): void;
    }>();

    const pageSize = 42;
    const popupVisible = ref(false);
    const searchValue = ref("");
    const isGridView = ref(true);
    const currentPage = ref(1);
    const selectedType = ref<IconSourceType>("arco");
    const iconParkIconNames = ref<string[]>([]);
    const remixIconNames = ref<string[]>([]);
    const { copy, isSupported } = useClipboard();

    const iconSourceOptions: { label: string; value: IconSourceType }[] = [
        { label: "Arco", value: "arco" },
        { label: "Custom", value: "custom" },
        { label: "IconPark", value: "iconpark" },
        { label: "Remix Icon", value: "remix" },
    ];

    const currentIconName = computed(() => normalizeIconValue(props.modelValue));

    const iconNames = computed(() => {
        if (selectedType.value === "iconpark") return iconParkIconNames.value;
        if (selectedType.value === "remix") return remixIconNames.value;
        return getIconNamesBySource(selectedType.value);
    });

    const filteredIconNames = computed(() => {
        return filterIconNames(iconNames.value, searchValue.value);
    });

    const totalIconCount = computed(() => filteredIconNames.value.length);

    const currentPageIconNames = computed(() => {
        const start = (currentPage.value - 1) * pageSize;
        return filteredIconNames.value.slice(start, start + pageSize);
    });

    /**
     * 重置搜索条件和分页，避免每次重新打开或切换来源时停留在上次筛选结果。
     */
    function resetPickerState() {
        searchValue.value = "";
        currentPage.value = 1;
    }

    /**
     * 处理搜索关键词变化后回到第一页。
     */
    function onSearchChange() {
        currentPage.value = 1;
    }

    /**
     * 切换图标展示方式。
     */
    function toggleViewMode() {
        isGridView.value = !isGridView.value;
    }

    /**
     * 切换图标来源后清空已选图标，避免不同来源之间误复用同一个图标名。
     */
    function onTypeChange() {
        emits("update:modelValue", "");
        resetPickerState();
    }

    /**
     * 按需加载 IconPark 离线图标列表，避免首次进入系统就打包整套外部图标。
     */
    async function loadIconParkIcons() {
        if (iconParkIconNames.value.length > 0) return;
        iconParkIconNames.value = await loadIconParkOutlineIconNames();
    }

    /**
     * 按需加载 Remix Icon 离线图标列表，避免首次进入系统就打包整套外部图标。
     */
    async function loadRemixIcons() {
        if (remixIconNames.value.length > 0) return;
        remixIconNames.value = await loadRemixIconNames();
    }

    /**
     * 更新输入框的图标名，并同步推断当前图标来源。
     */
    function onInputUpdate(value: string | null | undefined) {
        const iconName = normalizeIconValue(value);
        if (iconName) {
            selectedType.value = inferIconSourceType(iconName);
        }
        emits("update:modelValue", iconName);
    }

    /**
     * 选中图标后同步到表单并按需复制图标名。
     */
    async function selectIcon(iconName: string) {
        emits("select", iconName);
        emits("update:modelValue", iconName);
        popupVisible.value = false;

        if (!props.enableCopy || !isSupported.value) return;

        try {
            await copy(iconName);
            Message.success(`已选择并复制图标 ${iconName}`);
        } catch (error) {
            console.error("复制图标失败:", error);
        }
    }

    /**
     * 表单里可能传入 null，选择器内部统一使用空字符串表示未选择。
     */
    function normalizeIconValue(value: string | null | undefined) {
        return typeof value === "string" ? value.trim() : "";
    }

    // 打开弹层时重置筛选状态，保证每次进入都从当前来源的完整列表开始浏览。
    watch(popupVisible, (visible) => {
        if (visible) {
            resetPickerState();
        }
    });

    watch(searchValue, onSearchChange);

    watch(
        selectedType,
        (value) => {
            if (value === "iconpark") {
                void loadIconParkIcons();
            }
            if (value === "remix") {
                void loadRemixIcons();
            }
        },
        { immediate: true },
    );

    watch(
        () => props.modelValue,
        (value) => {
            const iconName = normalizeIconValue(value);
            if (iconName) {
                selectedType.value = inferIconSourceType(iconName);
            }
        },
        { immediate: true },
    );
</script>
