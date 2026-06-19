<template>
    <div class="code-diff-viewer">
        <div
            class="code-diff-viewer__editor"
            ref="editorContainerRef"
            :style="{ height }"
        />
    </div>
</template>

<script setup lang="ts">
    import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
    import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
    import { registerSpiceDBMonacoLanguage } from "./spiceDBMonacoLanguage";

    defineOptions({
        name: "CodeDiffViewer",
    });

    registerSpiceDBMonacoLanguage();

    type MonacoTheme = "vs" | "vs-dark" | "hc-black";

    type Props = {
        original: string;
        value: string;
        language?: string;
        theme?: MonacoTheme;
        height?: string;
        wordWrap?: "off" | "on";
        minimap?: boolean;
        lineNumbers?: "on" | "off";
    };

    type DiffChunk = {
        anchorLine: number;
        deletedLines: string[];
        insertedStartLine: number | null;
        insertedEndLine: number | null;
        insertedKind: "added" | "changed" | null;
    };

    const props = withDefaults(defineProps<Props>(), {
        language: "plaintext",
        theme: "vs",
        height: "560px",
        wordWrap: "on",
        minimap: false,
        lineNumbers: "on",
    });

    const emit = defineEmits<{
        (event: "update:value", value: string): void;
        (event: "change", value: string): void;
    }>();

    // Monaco 编辑器与普通代码预览使用同一字体栈，保证 schema 对齐清晰。
    const CODE_FONT_FAMILY =
        '"JetBrains Mono", "JetBrains Mono NL", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

    const editorContainerRef = ref<HTMLDivElement | null>(null);
    let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;
    let modifiedModel: monaco.editor.ITextModel | null = null;
    let modelChangeDisposable: monaco.IDisposable | null = null;
    let spaceKeyDisposable: monaco.IDisposable | null = null;
    let editorResizeObserver: ResizeObserver | null = null;
    let diffDecorationIds: string[] = [];
    let diffViewZoneIds: string[] = [];
    let diffRefreshFrame = 0;
    let syncingFromProps = false;

    /**
     * 创建单栏草稿编辑器，并用装饰层把远端 schema 差异标在同一个编辑器里。
     */
    async function mountEditor() {
        await nextTick();
        const container = editorContainerRef.value;
        if (!container || editorInstance) {
            return;
        }

        modifiedModel = monaco.editor.createModel(props.value, props.language);
        editorInstance = monaco.editor.create(container, {
            model: modifiedModel,
            theme: props.theme,
            readOnly: false,
            domReadOnly: false,
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
            folding: true,
            tabSize: 2,
        });

        bindSpaceInput();
        modelChangeDisposable = modifiedModel.onDidChangeContent(() => {
            if (syncingFromProps || !modifiedModel) {
                return;
            }
            const value = modifiedModel.getValue();
            emit("change", value);
            emit("update:value", value);
            scheduleDiffMarkers();
        });

        refreshDiffMarkers();
        editorInstance.layout();
        editorInstance.focus();
        observeEditorResize(container);
    }

    /**
     * 兜底处理空格键，避免外层组件或 Monaco 装饰层吞掉普通空格输入。
     */
    function bindSpaceInput() {
        const editor = editorInstance;
        if (!editor) {
            return;
        }

        spaceKeyDisposable?.dispose();
        spaceKeyDisposable = editor.onKeyDown((event) => {
            const browserEvent = event.browserEvent;
            const isPlainSpace =
                event.keyCode === monaco.KeyCode.Space &&
                !browserEvent.ctrlKey &&
                !browserEvent.altKey &&
                !browserEvent.metaKey &&
                !browserEvent.isComposing;

            if (!isPlainSpace) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            editor.trigger("keyboard", "type", { text: " " });
        });
    }

    /**
     * 在容器尺寸变化时刷新 Monaco 布局，避免 tab/card 切换后显示错位。
     */
    function observeEditorResize(target: HTMLDivElement) {
        if (typeof ResizeObserver === "undefined") {
            return;
        }

        editorResizeObserver = new ResizeObserver(() => {
            editorInstance?.layout();
        });
        editorResizeObserver.observe(target);
    }

    /**
     * 同步父组件传入的草稿 schema，避免回写事件造成循环更新。
     */
    function syncModifiedModel(value: string) {
        if (!modifiedModel || modifiedModel.getValue() === value) {
            return;
        }

        syncingFromProps = true;
        try {
            modifiedModel.setValue(value);
        } finally {
            syncingFromProps = false;
        }
        scheduleDiffMarkers();
    }

    /**
     * 同步编辑器配置，保持单栏草稿编辑器的可输入状态。
     */
    function syncEditorOptions() {
        editorInstance?.updateOptions({
            theme: props.theme,
            readOnly: false,
            domReadOnly: false,
            minimap: {
                enabled: props.minimap,
            },
            wordWrap: props.wordWrap,
            lineNumbers: props.lineNumbers,
        });
    }

    /**
     * 将差异刷新合并到下一帧，避免连续输入时频繁重算装饰。
     */
    function scheduleDiffMarkers() {
        if (diffRefreshFrame) {
            cancelAnimationFrame(diffRefreshFrame);
        }

        diffRefreshFrame = requestAnimationFrame(() => {
            diffRefreshFrame = 0;
            refreshDiffMarkers();
        });
    }

    /**
     * 根据远端 schema 与当前草稿重建行级差异装饰和删除行视图区。
     */
    function refreshDiffMarkers() {
        const editor = editorInstance;
        const model = modifiedModel;
        if (!editor || !model) {
            return;
        }

        const chunks = buildLineDiffChunks(props.original, model.getValue());
        const decorations: monaco.editor.IModelDeltaDecoration[] = [];

        clearDiffViewZones();
        chunks.forEach((chunk) => {
            if (chunk.insertedStartLine && chunk.insertedEndLine && chunk.insertedKind) {
                addLineDecorations(decorations, chunk);
            }
            if (chunk.deletedLines.length > 0) {
                addDeletedViewZone(chunk);
            }
        });

        diffDecorationIds = editor.deltaDecorations(diffDecorationIds, decorations);
    }

    /**
     * 清理删除行视图区，防止刷新后残留过期 diff 块。
     */
    function clearDiffViewZones() {
        const editor = editorInstance;
        if (!editor || diffViewZoneIds.length === 0) {
            return;
        }

        editor.changeViewZones((accessor) => {
            diffViewZoneIds.forEach((zoneId) => accessor.removeZone(zoneId));
        });
        diffViewZoneIds = [];
    }

    /**
     * 为新增或修改行追加背景装饰，让差异直接显示在草稿编辑器里。
     */
    function addLineDecorations(
        decorations: monaco.editor.IModelDeltaDecoration[],
        chunk: DiffChunk,
    ) {
        if (!chunk.insertedStartLine || !chunk.insertedEndLine || !chunk.insertedKind) {
            return;
        }

        const className =
            chunk.insertedKind === "added"
                ? "schema-diff-line--added"
                : "schema-diff-line--changed";

        for (let line = chunk.insertedStartLine; line <= chunk.insertedEndLine; line += 1) {
            decorations.push({
                range: new monaco.Range(line, 1, line, 1),
                options: {
                    isWholeLine: true,
                    className,
                },
            });
        }
    }

    /**
     * 在草稿编辑器对应位置插入被删除的远端 schema 行。
     */
    function addDeletedViewZone(chunk: DiffChunk) {
        const editor = editorInstance;
        if (!editor) {
            return;
        }

        editor.changeViewZones((accessor) => {
            const zoneId = accessor.addZone({
                afterLineNumber: chunk.anchorLine,
                heightInLines: Math.max(chunk.deletedLines.length, 1),
                domNode: createDeletedZoneNode(chunk.deletedLines),
            });
            diffViewZoneIds.push(zoneId);
        });
    }

    /**
     * 创建删除行视图区节点，用红色块展示远端已存在但草稿中移除的内容。
     */
    function createDeletedZoneNode(lines: string[]) {
        const node = document.createElement("div");
        node.className = "schema-diff-deleted-zone";
        node.textContent = lines.map((line) => `- ${line}`).join("\n");
        return node;
    }

    /**
     * 计算远端 schema 与草稿 schema 的行级差异块。
     */
    function buildLineDiffChunks(originalText: string, modifiedText: string) {
        const originalLines = splitTextLines(originalText);
        const modifiedLines = splitTextLines(modifiedText);
        const lcsTable = buildLcsTable(originalLines, modifiedLines);
        const chunks: DiffChunk[] = [];
        let originalIndex = 0;
        let modifiedIndex = 0;

        while (originalIndex < originalLines.length || modifiedIndex < modifiedLines.length) {
            if (
                originalIndex < originalLines.length &&
                modifiedIndex < modifiedLines.length &&
                originalLines[originalIndex] === modifiedLines[modifiedIndex]
            ) {
                originalIndex += 1;
                modifiedIndex += 1;
                continue;
            }

            const anchorLine = modifiedIndex;
            const deletedLines: string[] = [];
            const insertedStartLine = modifiedIndex + 1;
            let insertedCount = 0;

            while (originalIndex < originalLines.length || modifiedIndex < modifiedLines.length) {
                if (
                    originalIndex < originalLines.length &&
                    modifiedIndex < modifiedLines.length &&
                    originalLines[originalIndex] === modifiedLines[modifiedIndex]
                ) {
                    break;
                }

                const shouldInsert =
                    modifiedIndex < modifiedLines.length &&
                    (originalIndex >= originalLines.length ||
                        lcsTable[originalIndex][modifiedIndex + 1] >=
                            lcsTable[originalIndex + 1][modifiedIndex]);

                if (shouldInsert) {
                    modifiedIndex += 1;
                    insertedCount += 1;
                } else if (originalIndex < originalLines.length) {
                    deletedLines.push(originalLines[originalIndex]);
                    originalIndex += 1;
                }
            }

            chunks.push({
                anchorLine,
                deletedLines,
                insertedStartLine: insertedCount > 0 ? insertedStartLine : null,
                insertedEndLine: insertedCount > 0 ? insertedStartLine + insertedCount - 1 : null,
                insertedKind:
                    insertedCount === 0 ? null : deletedLines.length > 0 ? "changed" : "added",
            });
        }

        return chunks;
    }

    /**
     * 按 Monaco 文本模型语义拆行，保留末尾空行用于准确计算差异。
     */
    function splitTextLines(text: string) {
        return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    }

    /**
     * 构建最长公共子序列表，用于稳定计算新增、删除和修改行。
     */
    function buildLcsTable(originalLines: string[], modifiedLines: string[]) {
        const table = Array.from({ length: originalLines.length + 1 }, () =>
            Array.from({ length: modifiedLines.length + 1 }, () => 0),
        );

        for (let i = originalLines.length - 1; i >= 0; i -= 1) {
            for (let j = modifiedLines.length - 1; j >= 0; j -= 1) {
                table[i][j] =
                    originalLines[i] === modifiedLines[j]
                        ? table[i + 1][j + 1] + 1
                        : Math.max(table[i + 1][j], table[i][j + 1]);
            }
        }

        return table;
    }

    /**
     * 销毁 Monaco 模型、装饰和编辑器，释放 worker/model 资源。
     */
    function disposeEditor() {
        if (diffRefreshFrame) {
            cancelAnimationFrame(diffRefreshFrame);
            diffRefreshFrame = 0;
        }
        clearDiffViewZones();
        editorResizeObserver?.disconnect();
        editorResizeObserver = null;
        modelChangeDisposable?.dispose();
        modelChangeDisposable = null;
        spaceKeyDisposable?.dispose();
        spaceKeyDisposable = null;
        editorInstance?.dispose();
        editorInstance = null;
        modifiedModel?.dispose();
        modifiedModel = null;
    }

    watch(
        () => props.original,
        () => scheduleDiffMarkers(),
    );

    watch(
        () => props.value,
        (value) => syncModifiedModel(value),
    );

    watch(
        () => [props.theme, props.minimap, props.wordWrap, props.lineNumbers] as const,
        () => syncEditorOptions(),
    );

    onMounted(() => {
        void mountEditor();
    });

    onBeforeUnmount(() => {
        disposeEditor();
    });
</script>

<style scoped lang="scss">
    .code-diff-viewer {
        width: 100%;
        min-width: 0;
    }

    .code-diff-viewer__editor {
        width: 100%;
        min-height: 320px;
        overflow: hidden;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        background: var(--color-bg-2);
    }

    :deep(.schema-diff-line--added) {
        background: rgba(0, 180, 42, 0.12);
        box-shadow: inset 3px 0 rgba(0, 180, 42, 0.7);
    }

    :deep(.schema-diff-line--changed) {
        background: rgba(255, 125, 0, 0.12);
        box-shadow: inset 3px 0 rgba(255, 125, 0, 0.7);
    }

    :deep(.schema-diff-deleted-zone) {
        box-sizing: border-box;
        height: 100%;
        padding: 0 12px 0 54px;
        overflow: hidden;
        color: rgb(var(--red-6));
        font-family:
            "JetBrains Mono", "JetBrains Mono NL", ui-monospace, SFMono-Regular, Menlo, Monaco,
            Consolas, "Liberation Mono", monospace;
        font-size: 13px;
        line-height: 19px;
        white-space: pre;
        background: rgba(245, 63, 63, 0.1);
        border-left: 3px solid rgba(245, 63, 63, 0.72);
    }
</style>
