import { defineComponent, h, resolveComponent } from "vue";

export const FormCreatePasswordInput = defineComponent({
    name: "FormCreatePasswordInput",
    inheritAttrs: false,
    props: {
        modelValue: {
            type: String,
            default: "",
        },
        placeholder: {
            type: String,
            default: "",
        },
    },
    emits: ["update:modelValue"],
    setup(props, { attrs, emit }) {
        const PasswordInput = resolveComponent("a-input-password");
        return () =>
            h(PasswordInput, {
                ...attrs,
                "modelValue": props.modelValue,
                "placeholder": props.placeholder,
                "defaultVisibility": false,
                "onUpdate:modelValue": (value: string) => emit("update:modelValue", value),
            });
    },
});
