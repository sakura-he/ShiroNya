<template>
    <div>
        <form-create
            :model-value="formData"
            :rule="menuDetailRules"
            :option="menuDetailOptions"
            @update:model-value="syncMenuDetailForm"
        />
    </div>
</template>

<script lang="ts" setup>
    import IconSelector from "@/components/IconSelector.vue";
    import { MenuEnum } from "@/router/type";
    import type {
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { computed, markRaw, reactive } from "vue";
    import { RouteMeta } from "vue-router";
    import { MenuDataType, MenuStatusEnum } from "../types/types";

    type MenuDetailFormMeta = RouteMeta & {
        residentTab?: boolean;
        noCancelResident?: boolean;
    };

    type MenuDetailFormData = Omit<MenuDataType, "meta"> & {
        meta: MenuDetailFormMeta;
    };

    const props = withDefaults(
        defineProps<{
            loading?: boolean;
        }>(),
        {
            loading: false,
        },
    );

    // 定义事件, 子传父值
    let emits = defineEmits<{
        (e: "commit"): void;
    }>();
    // 暴露出组件update方法, 让父组件控制子组件的状态
    defineExpose({
        update,
    });
    let status = ref<MenuStatusEnum>(1);
    let menuType = [
        { name: "菜单", value: MenuEnum["Catalog"] },
        { name: "页面", value: MenuEnum["Page"] },
        { name: "按钮", value: 3 },
    ];
    const menuTypeOptions = menuType.map((item) => ({
        label: item.name,
        value: item.value,
    }));
    let initData: any = {
        name: "",
        component: "",
        path: "",
        meta: {},
    };
    // 表单数据,作为表单和提交对象(内部维护的)
    let formData: MenuDetailFormData = reactive({
        name: "",
        component: "",
        path: "",
        meta: {} as MenuDetailFormMeta,
    });
    const iconSelectorComponent = markRaw(IconSelector);
    const menuDetailOptions = computed<FormCreateOptions>(() => ({
        form: {
            layout: "vertical",
            disabled: status.value === MenuStatusEnum.detail,
        },
        row: {
            gutter: 12,
        },
        submitBtn: {
            show: true,
            type: "primary",
            loading: props.loading,
            innerText: "保存",
            click: () => emits("commit"),
        },
        resetBtn: false,
    }));
    const menuDetailRules = computed<FormCreateRule[]>(() => {
        const disabled = status.value === MenuStatusEnum.detail;
        const rules: FormCreateRule[] = [
            {
                field: "meta.type",
                title: "菜单类型",
                type: "radio",
                props: {
                    type: "button",
                    options: menuTypeOptions,
                    disabled: status.value !== MenuStatusEnum.add || disabled,
                },
                col: { span: 24 },
            },
            {
                field: "name",
                title: "name",
                type: "input",
                props: { allowClear: true, disabled, placeholder: "请输入name" },
                validate: [{ required: true, message: "请输入name", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "path",
                title: "url 地址片段",
                type: "input",
                props: {
                    allowClear: true,
                    disabled,
                    placeholder: "传入一个路径片段,没有 /",
                },
                validate: [{ required: true, message: "请输入url 地址片段", trigger: "change" }],
                col: { span: 24 },
            },
            {
                field: "meta.title",
                title: "标题",
                type: "input",
                props: { allowClear: true, disabled, placeholder: "请输入标题" },
                col: { span: 24 },
            },
        ];

        if (formData.meta.type === MenuEnum["Page"]) {
            rules.push(
                {
                    field: "component",
                    title: "组件路径",
                    type: "input",
                    props: {
                        allowClear: true,
                        disabled,
                        placeholder: "以 views 为 root 目录的路径",
                    },
                    validate: [{ required: true, message: "请输入组件路径", trigger: "change" }],
                    col: { span: 24 },
                },
                {
                    field: "meta.icon",
                    title: "图标",
                    type: "menuDetailIconSelector",
                    component: iconSelectorComponent,
                    props: { disabled },
                    col: { span: 24 },
                },
                {
                    field: "meta.order",
                    title: "排序",
                    type: "inputNumber",
                    props: { min: 0, precision: 0, class: "tw:w-full", disabled },
                    col: { span: 24 },
                },
                {
                    field: "meta.residentTab",
                    title: "新标签页默认为固定状态",
                    type: "switch",
                    props: {
                        checkedValue: true,
                        uncheckedValue: false,
                        checkedText: "是",
                        uncheckedText: "否",
                        disabled,
                    },
                    col: { span: 24 },
                },
                {
                    field: "meta.noCancelResident",
                    title: "不允许解除固定",
                    type: "switch",
                    props: {
                        checkedValue: true,
                        uncheckedValue: false,
                        checkedText: "是",
                        uncheckedText: "否",
                        disabled,
                    },
                    col: { span: 24 },
                },
            );
        }

        return rules;
    });

    function syncMenuDetailForm(value: Partial<MenuDetailFormData>) {
        Object.assign(formData, value);
    }
    // 更新表单状态, 状态类形取 ../types.ts的类型
    function update(type: MenuStatusEnum, data?: Record<string, any>) {
        status.value = type;
        // 重置表单
        Object.keys(initData).forEach((key) => {
            formData[key as keyof MenuDataType] = initData[key];
        });
        // 编辑菜单
        if (status.value === MenuStatusEnum.edit || status.value === MenuStatusEnum.detail) {
            if (typeof data !== "object") return;
            // 将表单数据设置为后台返回菜单表单的初始数据
            Object.keys(data).forEach((key) => {
                formData[key as keyof MenuDataType] = data[key];
            });
        }
        // 新增菜单
        if (status.value === MenuStatusEnum.add) {
        }
    }
</script>
<style lang="scss" scoped>
    .container {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        justify-content: stretch;
    }
</style>
