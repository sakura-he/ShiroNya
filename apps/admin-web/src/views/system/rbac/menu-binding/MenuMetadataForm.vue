<template>
    <form-create
        :model-value="form"
        :rule="menuMetadataRules"
        :option="menuMetadataOptions"
        @update:model-value="syncForm"
    />
</template>

<script setup lang="ts">
    import { RbacMenuLayoutType, RbacMenuType, RbacPageType, RbacStatus } from "@/api/rbac/common";
    import IconSelector from "@/components/IconSelector.vue";
    import PathSegments from "@/components/PathSegments.vue";
    import type {
        Options as FormCreateOptions,
        Rule as FormCreateRule,
    } from "@form-create/arco-design";
    import { computed, defineComponent, h, markRaw, resolveComponent, type PropType } from "vue";
    import type {
        GroupSelectOption,
        ParentTreeNode,
        PermissionTreeNode,
        RbacMenuFormState,
        SelectOption,
    } from "./menu-form.types";

    type FormSelectOption = {
        label: string;
        value: string | number | boolean;
    };

    const props = withDefaults(
        defineProps<{
            form: RbacMenuFormState;
            disabled?: boolean;
            isAddMode: boolean;
            isParentRequired: boolean;
            menuTypeOptions: SelectOption[];
            parentMenuTree: ParentTreeNode[];
            permissionGroupOptions?: GroupSelectOption[];
            permissionTreeData?: PermissionTreeNode[];
            menuId?: number | null;
            showMenuId?: boolean;
        }>(),
        {
            disabled: false,
            permissionGroupOptions: () => [],
            permissionTreeData: () => [],
            menuId: null,
            showMenuId: false,
        },
    );

    const MenuTreeSelect = defineComponent({
        name: "MenuMetadataTreeSelect",
        inheritAttrs: false,
        props: {
            modelValue: {
                type: [String, Number],
                default: undefined,
            },
            data: {
                type: Array as PropType<Array<ParentTreeNode | PermissionTreeNode>>,
                default: () => [],
            },
            allowClear: {
                type: Boolean,
                default: true,
            },
            disabled: {
                type: Boolean,
                default: false,
            },
            numberValue: {
                type: Boolean,
                default: false,
            },
            placeholder: {
                type: String,
                default: "请选择",
            },
        },
        emits: ["update:modelValue"],
        setup(componentProps, { attrs, emit }) {
            const TreeSelect = resolveComponent("a-tree-select");
            const updateValue = (value: unknown) => {
                if (value === undefined || value === null || value === "") {
                    emit("update:modelValue", componentProps.numberValue ? undefined : "");
                    return;
                }
                emit(
                    "update:modelValue",
                    componentProps.numberValue ? Number(value) : String(value),
                );
            };

            return () =>
                h(TreeSelect, {
                    ...attrs,
                    "modelValue": componentProps.modelValue || undefined,
                    "data": componentProps.data,
                    "fieldNames": {
                        key: "key",
                        title: "title",
                        children: "children",
                    },
                    "allowClear": componentProps.allowClear,
                    "allowSearch": true,
                    "disabled": componentProps.disabled,
                    "placeholder": componentProps.placeholder,
                    "treeProps": { blockNode: true, showLine: true },
                    "onUpdate:modelValue": updateValue,
                    "onClear": () => updateValue(undefined),
                });
        },
    });

    const PathInput = defineComponent({
        name: "MenuMetadataPathInput",
        inheritAttrs: false,
        props: {
            modelValue: {
                type: String,
                default: "",
            },
            disabled: {
                type: Boolean,
                default: false,
            },
            placeholder: {
                type: String,
                default: "",
            },
        },
        emits: ["update:modelValue"],
        setup(componentProps, { attrs, emit }) {
            const Input = resolveComponent("a-input");

            return () =>
                componentProps.disabled
                    ? h(PathSegments, { path: componentProps.modelValue })
                    : h(Input, {
                          ...attrs,
                          "modelValue": componentProps.modelValue,
                          "placeholder": componentProps.placeholder,
                          "allowClear": true,
                          "onUpdate:modelValue": (value: string) =>
                              emit("update:modelValue", value),
                      });
        },
    });

    const menuTreeSelectComponent = markRaw(MenuTreeSelect);
    const pathInputComponent = markRaw(PathInput);
    const iconSelectorComponent = markRaw(IconSelector);
    const menuMetadataOptions = computed(
        () =>
            ({
                form: {
                    layout: "vertical",
                    disabled: props.disabled,
                },
                row: {
                    gutter: 16,
                },
                // 非全屏弹窗宽度有限，局部覆盖插件级响应式列宽，避免 textarea 被压窄。
                col: { span: 24 },
                submitBtn: false,
                resetBtn: false,
            }) satisfies FormCreateOptions,
    );
    const layoutOptions: FormSelectOption[] = [
        { label: "侧边栏", value: RbacMenuLayoutType.LAYOUT_SIDE },
        { label: "顶部", value: RbacMenuLayoutType.LAYOUT_TOP },
        { label: "默认", value: RbacMenuLayoutType.LAYOUT_DEFAULT },
    ];
    const pageTypeOptions: FormSelectOption[] = [
        { label: "页面", value: RbacPageType.PAGE },
        { label: "外链", value: RbacPageType.LINK },
        { label: "Iframe", value: RbacPageType.IFRAME },
    ];
    const statusOptions: FormSelectOption[] = [
        { label: "启用", value: RbacStatus.ENABLE },
        { label: "禁用", value: RbacStatus.DISABLE },
    ];
    const menuMetadataRules = computed<FormCreateRule[]>(() => {
        const disabled = props.disabled;
        const type = props.form.type;
        const rules: FormCreateRule[] = [];

        if (props.showMenuId && props.menuId) {
            rules.push({
                ...createInputRule("menuId", "菜单 ID", { disabled: true }, { span: 24 }),
                value: String(props.menuId),
            });
        }

        rules.push(
            createRequiredInputRule(
                "title",
                "菜单标题",
                { placeholder: "例如 用户管理", disabled },
                { span: 24 },
            ),
            createTreeSelectRule(
                "requiredPermissionCode",
                "所需权限",
                props.permissionTreeData,
                {
                    allowClear: true,
                    placeholder: "选择权限",
                    disabled,
                },
                true,
            ),
            createSelectRule(
                "groupId",
                "权限分组",
                props.permissionGroupOptions,
                { placeholder: "未分组", disabled },
                { span: 24 },
            ),
            createSelectRule(
                "type",
                "菜单类型",
                props.menuTypeOptions,
                { allowClear: false, disabled: disabled || !props.isAddMode },
                { span: 24 },
            ),
            createTreeSelectRule(
                "pid",
                "父级菜单",
                props.parentMenuTree,
                {
                    allowClear: !props.isParentRequired,
                    placeholder: "不选择则作为根节点",
                    disabled,
                    numberValue: true,
                },
                props.isParentRequired,
            ),
        );

        if (type !== RbacMenuType.Button) {
            rules.push(
                createPathInputRule(
                    "path",
                    "路由路径",
                    "例如 system/user 或 user",
                    disabled,
                    false,
                ),
            );
        }

        if (type === RbacMenuType.Page) {
            rules.push(
                createPathInputRule(
                    "componentPath",
                    "组件路径",
                    "例如 system/user/User",
                    disabled,
                    true,
                ),
                createRequiredInputRule(
                    "componentName",
                    "组件名称",
                    { placeholder: "例如 User", disabled },
                    { span: 24 },
                ),
                createRequiredSelectRule(
                    "layout",
                    "布局",
                    layoutOptions,
                    { disabled },
                    { span: 24 },
                ),
                createRequiredSelectRule(
                    "pageType",
                    "页面类型",
                    pageTypeOptions,
                    { disabled },
                    { span: 24 },
                ),
            );
        }

        rules.push(
            {
                field: "icon",
                title: "图标",
                type: "menuMetadataIconSelector",
                component: iconSelectorComponent,
                props: { allowClear: true, disabled },
                col: { span: 24 },
            },
            createNumberRule("order", "排序", { disabled }, { span: 24 }),
            createSelectRule(
                "status",
                "状态",
                statusOptions,
                { allowClear: false, disabled },
                { span: 24 },
            ),
        );

        if (type !== RbacMenuType.Button) {
            rules.push(createSwitchRule("isMenuVisible", "菜单可见", { disabled }, { span: 24 }));
        }
        if (type === RbacMenuType.Page) {
            rules.push(
                createSwitchRule("isTabVisible", "标签可见", { disabled }, { span: 24 }),
                createSwitchRule("isCache", "页面缓存", { disabled }, { span: 24 }),
                createSwitchRule("isResident", "常驻标签", { disabled }, { span: 24 }),
            );
        }
        if (type === RbacMenuType.Catalog) {
            rules.push(createSwitchRule("showChildren", "显示子菜单", { disabled }, { span: 24 }));
        }

        rules.push(createTextareaRule("description", "描述", { disabled }, { span: 24 }));
        return rules;
    });

    function createTreeSelectRule(
        field: string,
        title: string,
        data: Array<ParentTreeNode | PermissionTreeNode>,
        fieldProps: Record<string, unknown>,
        required: boolean,
    ): FormCreateRule {
        return {
            field,
            title,
            type: "menuMetadataTreeSelect",
            component: menuTreeSelectComponent,
            props: {
                data,
                ...fieldProps,
            },
            validate: required
                ? [{ required: true, message: `请选择${title}`, trigger: "change" }]
                : [],
            col: { span: 24 },
        };
    }

    function createPathInputRule(
        field: string,
        title: string,
        placeholder: string,
        disabled: boolean,
        required: boolean,
    ): FormCreateRule {
        return {
            field,
            title,
            type: "menuMetadataPathInput",
            component: pathInputComponent,
            props: { placeholder, disabled },
            validate: required
                ? [{ required: true, message: `请输入${title}`, trigger: "change" }]
                : [],
            col: { span: 24 },
        };
    }

    function createInputRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "input",
            props: {
                allowClear: true,
                placeholder: `请输入${title}`,
                ...props,
            },
            col,
        };
    }

    function createRequiredInputRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            ...createInputRule(field, title, props, col),
            validate: [{ required: true, message: `请输入${title}`, trigger: "change" }],
        };
    }

    function createSelectRule(
        field: string,
        title: string,
        options: Array<{ label: string; value: string | number | boolean }>,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "select",
            props: {
                allowClear: true,
                allowSearch: true,
                placeholder: `请选择${title}`,
                options,
                ...props,
                triggerProps: {
                    autoFitPopupWidth: false,
                    autoFitPopupMinWidth: true,
                },
            },
            col,
        };
    }

    function createRequiredSelectRule(
        field: string,
        title: string,
        options: Array<{ label: string; value: string | number | boolean }>,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            ...createSelectRule(field, title, options, { allowClear: false, ...props }, col),
            validate: [{ required: true, message: `请选择${title}`, trigger: "change" }],
        };
    }

    function createNumberRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "inputNumber",
            props: {
                min: 0,
                precision: 0,
                class: "tw:w-full",
                placeholder: `请输入${title}`,
                ...props,
            },
            col,
        };
    }

    function createSwitchRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "switch",
            props: {
                checkedValue: true,
                uncheckedValue: false,
                checkedText: "是",
                uncheckedText: "否",
                ...props,
            },
            col,
        };
    }

    function createTextareaRule(
        field: string,
        title: string,
        props: Record<string, unknown> = {},
        col: FormCreateRule["col"] = { span: 24 },
    ): FormCreateRule {
        return {
            field,
            title,
            type: "textarea",
            props: {
                allowClear: true,
                placeholder: `请输入${title}`,
                autoSize: { minRows: 3, maxRows: 5 },
                ...props,
            },
            col,
        };
    }

    function syncForm(value: Partial<RbacMenuFormState>) {
        Object.assign(props.form, value);
    }
</script>
