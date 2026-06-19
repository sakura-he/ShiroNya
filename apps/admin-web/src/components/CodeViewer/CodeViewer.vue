<template>
    <div class="code-viewer">
        <div
            class="code-viewer__editor"
            ref="editorContainerRef"
            :style="{ height }"
        >
            <CodeEditor
                :value="modelValue"
                :language="language"
                :theme="theme"
                :options="editorOptions"
                class="code-viewer__monaco"
                @editor-did-mount="handleEditorDidMount"
                @change="handleEditorChange"
                @update:value="handleEditorValueUpdate"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
    import { Message } from "@arco-design/web-vue";
    import { computed, onBeforeUnmount, onMounted, ref } from "vue";
    import { CodeEditor } from "monaco-editor-vue3";
    import type * as monaco from "monaco-editor";
    import { registerSpiceDBMonacoLanguage } from "./spiceDBMonacoLanguage";

    defineOptions({
        name: "CodeViewer",
    });

    registerSpiceDBMonacoLanguage();

    type MonacoTheme = "vs" | "vs-dark" | "hc-black";

    type Props = {
        value: string;
        language?: string;
        theme?: MonacoTheme;
        height?: string;
        readonly?: boolean;
        wordWrap?: "off" | "on";
        minimap?: boolean;
        lineNumbers?: "on" | "off";
    };

    const props = withDefaults(defineProps<Props>(), {
        language: "plaintext",
        theme: "vs",
        height: "320px",
        readonly: true,
        wordWrap: "on",
        minimap: false,
        lineNumbers: "on",
    });

    const emit = defineEmits<{
        (event: "update:value", value: string): void;
        (event: "change", value: string): void;
    }>();

    // Monaco 需要显式声明字体栈，避免只继承全局 CSS 时回退到默认等宽字体。
    const CODE_FONT_FAMILY =
        '"JetBrains Mono", "JetBrains Mono NL", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

    const modelValue = computed(() => props.value);
    const languageLabel = computed(() => props.language || "plaintext");
    const editorContainerRef = ref<HTMLDivElement | null>(null);
    let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;
    let editorResizeObserver: ResizeObserver | null = null;

    const editorOptions = computed(() => {
        return {
            readOnly: props.readonly,
            automaticLayout: true,
            minimap: {
                enabled: props.minimap,
            },
            wordWrap: props.wordWrap,
            lineNumbers: props.lineNumbers,
            scrollBeyondLastLine: false,
            renderWhitespace: "selection",
            fontFamily: CODE_FONT_FAMILY,
            fontLigatures: true,
            fontSize: 13,
            tabSize: 2,
            folding: true,
            formatOnPaste: false,
            formatOnType: false,
        };
    });

    /**
     * 接收 Monaco 编辑器挂载事件，并立即按容器尺寸布局。
     */
    function handleEditorDidMount(editor: monaco.editor.IStandaloneCodeEditor) {
        editorInstance = editor;
        editor.layout();
    }

    /**
     * 将 Monaco change 事件同步给父组件，供外层感知编辑变化。
     */
    function handleEditorChange(value: string) {
        emit("change", value);
    }

    /**
     * 接收 monaco-editor-vue3 的 update:value 事件，保持外层 v-model 可用。
     */
    function handleEditorValueUpdate(value: string) {
        emit("update:value", value);
    }

    /**
     * 监听容器尺寸变化，让 Monaco 在抽屉宽度变化后重新计算布局。
     */
    function refreshEditorLayout() {
        editorInstance?.layout();
    }

    onMounted(() => {
        if (typeof ResizeObserver === "undefined") {
            return;
        }

        const target = editorContainerRef.value;
        if (!target) {
            return;
        }

        editorResizeObserver = new ResizeObserver(() => {
            refreshEditorLayout();
        });
        editorResizeObserver.observe(target);
    });

    onBeforeUnmount(() => {
        editorResizeObserver?.disconnect();
        editorResizeObserver = null;
        editorInstance = null;
    });

    /**
     * 复制当前展示内容到剪贴板，失败时给出明确提示。
     */
    async function copyContent() {
        const text = modelValue.value ?? "";
        if (!text) {
            Message.warning("当前没有可复制内容");
            return;
        }

        if (!navigator.clipboard?.writeText) {
            Message.error("当前环境不支持剪贴板写入");
            return;
        }

        await navigator.clipboard.writeText(text);
        Message.success("已复制到剪贴板");
    }
</script>

<style scoped lang="scss">
    .code-viewer {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
        min-width: 0;
    }

    .code-viewer__toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    .code-viewer__editor {
        width: 100%;
        min-height: 240px;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        background: var(--color-bg-2);
    }

    .code-viewer__monaco {
        width: 100%;
        height: 100%;
    }
</style>
