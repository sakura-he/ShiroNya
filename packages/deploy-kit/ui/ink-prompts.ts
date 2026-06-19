import { Box, Text, render, useInput, type Instance } from 'ink';
import { createElement, useEffect, useMemo, useState } from 'react';

import { type InkUITheme } from '../components/ui/_core.js';
import { Confirm } from '../components/ui/confirm/index.js';
import { KeyHint, type KeyHintItem } from '../components/ui/key-hint/index.js';
import { Select, type SelectItem } from '../components/ui/select/index.js';
import { TextInput } from '../components/ui/text-input/index.js';
import type {
    DeployHeaderLogoController,
    DeployPromptKind,
    DeployPromptRequest,
    DeployPromptSelectOption
} from '../core/types.ts';

export class PromptBackRequested extends Error {
    constructor() {
        super('back');
    }
}

export class PromptCancelled extends Error {
    constructor() {
        super('cancelled');
    }
}

export type PromptSelectOption<T extends string> = DeployPromptSelectOption<T>;

type PromptKind = DeployPromptKind;

export type PromptResult =
    | {
          type: 'submit';
          value: string;
      }
    | {
          type: 'back';
      }
    | {
          type: 'cancel';
      };

export type PromptProps = DeployPromptRequest & {
    flowState?: PromptFlowState | null;
};

export type InkPromptProps = PromptProps & {
    height?: number;
    onResult: (result: PromptResult) => void;
    promptKey: number;
    width?: number;
};

const promptFooterRows = 1;

const promptTheme: InkUITheme = {
    colors: {
        primary: '#c4b5fd',
        secondary: '#e9d5ff',
        success: '#ddd6fe',
        warning: '#fde68a',
        error: '#f0abfc',
        info: '#a78bfa',
        muted: '#8b7cba',
        text: '#f5f3ff',
        textInverse: '#21143a',
        border: '#a78bfa',
        focus: '#e9d5ff',
        selection: '#7c3aed'
    },
    border: 'single'
};

export type PromptFlowState = {
    stepCount: number;
    stepIndex: number;
};

let activePromptFlowState: PromptFlowState | null = null;
let activePromptHeaderLogo: DeployHeaderLogoController | null = null;
let promptInstance: Instance | undefined;
let promptKey = 0;

export function setPromptHeaderLogoController(controller: DeployHeaderLogoController | null): void {
    activePromptHeaderLogo = controller;
}

export function setPromptFlowState(state: PromptFlowState): void {
    activePromptFlowState = state;
    activePromptHeaderLogo?.setHeaderStep?.(state.stepIndex + 1, state.stepCount);
}

export function clearPromptFlowState(): void {
    activePromptFlowState = null;
}

function promptFlowRows(): number {
    return Math.max(4, activePromptHeaderLogo?.getFlowRows?.() ?? process.stdout.rows ?? 24);
}

type RawPromptControl = {
    teardown: () => void;
    wait: Promise<PromptResult>;
};

function isInterrupt(input: string, key: { ctrl: boolean }): boolean {
    return input === '\u0003' || (key.ctrl && input.toLowerCase() === 'c');
}

function isRawInterrupt(input: string): boolean {
    return input === '\u0003';
}

function isRawEscape(input: string): boolean {
    return input === '\u001B';
}

function createRawPromptControl(allowBack: boolean): RawPromptControl {
    let done = false;
    let resolveResult: (result: PromptResult) => void = () => undefined;
    const wait = new Promise<PromptResult>((resolve) => {
        resolveResult = resolve;
    });
    const onData = (chunk: Buffer | string): void => {
        if (done) return;

        const input = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        if (isRawInterrupt(input)) {
            done = true;
            resolveResult({ type: 'cancel' });
            return;
        }

        if (isRawEscape(input)) {
            done = true;
            resolveResult({ type: allowBack ? 'back' : 'cancel' });
        }
    };

    process.stdin.on('data', onData);

    return {
        teardown() {
            process.stdin.off('data', onData);
        },
        wait
    };
}

function optionLabel(option: PromptSelectOption<string>): string {
    return `${option.label ?? option.value}${option.hint ? `  ${option.hint}` : ''}`;
}

function enabledOptions(options: PromptSelectOption<string>[]): PromptSelectOption<string>[] {
    return options.filter((option) => !option.disabled);
}

function orderedEnabledOptions(
    options: PromptSelectOption<string>[],
    initialValue: string
): PromptSelectOption<string>[] {
    const enabled = enabledOptions(options);
    const selectedIndex = enabled.findIndex((option) => option.value === initialValue);
    if (selectedIndex <= 0) return enabled;

    return [enabled[selectedIndex], ...enabled.slice(0, selectedIndex), ...enabled.slice(selectedIndex + 1)];
}

function usePromptExit(allowBack: boolean, onResult: (result: PromptResult) => void): void {
    useInput((input, key) => {
        if (isInterrupt(input, key)) {
            onResult({ type: 'cancel' });
            return;
        }

        if (key.escape) {
            onResult({ type: allowBack ? 'back' : 'cancel' });
        }
    });
}

function createKeyHints(kind: PromptKind, allowBack: boolean): KeyHintItem[] {
    const hints: KeyHintItem[] = [
        { key: 'Ctrl+C', label: '取消' },
        { key: 'Esc', label: allowBack ? '返回上一步' : '取消' },
        { key: 'Enter', label: '确认' }
    ];

    if (kind === 'select') {
        hints.push({ key: '↑↓', label: '选择' });
    }
    if (kind === 'confirm') {
        hints.push({ key: 'Y/N', label: '确认/取消' });
    }

    return hints;
}

function submitWithValidation(
    onResult: (result: PromptResult) => void,
    setError: (error: string | null) => void,
    validate: PromptProps['validate'],
    value: string
): void {
    const normalizedValue = value.trim();
    const errorMessage = validate?.(normalizedValue);
    if (errorMessage) {
        setError(errorMessage);
        return;
    }

    onResult({ type: 'submit', value: normalizedValue });
}

export function InkPrompt({
    allowBack,
    height,
    initialValue,
    kind,
    message,
    onResult,
    options = [],
    promptKey,
    validate,
    width
}: InkPromptProps) {
    const [error, setError] = useState<string | null>(null);
    const [draftValue, setDraftValue] = useState(initialValue);
    const orderedOptions = useMemo(() => orderedEnabledOptions(options, initialValue), [initialValue, options]);
    const selectItems = useMemo<SelectItem<string>[]>(
        () =>
            orderedOptions.map((option) => ({
                label: optionLabel(option),
                value: option.value
            })),
        [orderedOptions]
    );
    const keyHints = useMemo(() => createKeyHints(kind, allowBack), [allowBack, kind]);
    usePromptExit(allowBack, onResult);

    useEffect(() => {
        setError(null);
        setDraftValue(initialValue);
    }, [initialValue, promptKey]);

    const submit = (value: string): void => {
        submitWithValidation(onResult, setError, validate, value);
    };

    const changeDraftValue = (value: string): void => {
        setError(null);
        setDraftValue(value);
    };

    const content = createElement(
        Box,
        { flexDirection: 'column', flexShrink: 1, width },
        kind === 'confirm' ? null : createElement(Text, null, message),
        kind === 'select'
            ? createElement(Select, {
                  key: promptKey,
                  items: selectItems,
                  onSelect: (item: SelectItem<string>) => submit(item.value),
                  theme: promptTheme
              })
            : null,
        kind === 'text'
            ? createElement(TextInput, {
                  key: promptKey,
                  onChange: changeDraftValue,
                  onSubmit: submit,
                  placeholder: '输入后按 Enter',
                  theme: promptTheme,
                  value: draftValue
              })
            : null,
        kind === 'password'
            ? createElement(TextInput, {
                  key: promptKey,
                  onChange: changeDraftValue,
                  onSubmit: submit,
                  password: true,
                  placeholder: '输入后按 Enter',
                  theme: promptTheme,
                  value: draftValue
              })
            : null,
        kind === 'confirm'
            ? createElement(Confirm, {
                  key: promptKey,
                  defaultValue: initialValue === 'yes',
                  message,
                  onCancel: () => submit('no'),
                  onConfirm: () => submit('yes'),
                  theme: promptTheme
              })
            : null,
        error ? createElement(Text, { color: promptTheme.colors.error }, `▲ ${error}`) : null
    );
    const rows = height ?? promptFlowRows();

    return createElement(
        Box,
        { flexDirection: 'column', height: rows, width },
        content,
        createElement(Box, { flexGrow: 1 }),
        createElement(
            Box,
            {
                flexShrink: 0,
                height: promptFooterRows,
                width
            },
            createElement(KeyHint, { keys: keyHints, theme: promptTheme })
        )
    );
}

async function closePromptSession(): Promise<void> {
    const instance = promptInstance;
    if (!instance) return;

    promptInstance = undefined;
    instance.clear();
    await instance.waitUntilRenderFlush().catch(() => undefined);
    instance.unmount();
    await instance.waitUntilExit().catch(() => undefined);
}

export async function closeConfigPromptSession(): Promise<void> {
    await closePromptSession();
}

async function runInkPrompt(props: PromptProps): Promise<string> {
    if (activePromptHeaderLogo?.runPrompt) {
        return activePromptHeaderLogo.runPrompt(props);
    }

    const rawControl = createRawPromptControl(props.allowBack);
    let settled = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let resolvePrompt: (result: PromptResult) => void = () => undefined;
    const wait = new Promise<PromptResult>((resolve) => {
        resolvePrompt = resolve;
    });
    const finish = (result: PromptResult): void => {
        if (settled) return;
        settled = true;
        resolvePrompt(result);
    };
    const nextPromptKey = ++promptKey;
    const element = createElement(InkPrompt, {
        ...props,
        onResult: finish,
        promptKey: nextPromptKey
    });
    const handleResize = (): void => {
        if (settled || !promptInstance) return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            void (async () => {
                const instance = promptInstance;
                if (!instance || settled) return;
                instance.clear();
                await instance.waitUntilRenderFlush().catch(() => undefined);
                if (promptInstance === instance && !settled) {
                    instance.rerender(element);
                }
            })();
        }, 40);
    };

    rawControl.wait.then(finish).catch(() => undefined);
    process.stdout.on('resize', handleResize);

    if (promptInstance) {
        promptInstance.clear();
        await promptInstance.waitUntilRenderFlush().catch(() => undefined);
        promptInstance.rerender(element);
    } else {
        promptInstance = render(element, {
            exitOnCtrlC: false,
            patchConsole: false
        });
    }

    try {
        const result = await wait;

        if (!result || result.type === 'cancel') {
            throw new PromptCancelled();
        }

        if (result.type === 'back') {
            throw new PromptBackRequested();
        }

        return result.value;
    } finally {
        if (resizeTimer) clearTimeout(resizeTimer);
        process.stdout.off('resize', handleResize);
        rawControl.teardown();
    }
}

export async function promptSelect<T extends string>(
    message: string,
    initialValue: T,
    options: PromptSelectOption<T>[],
    allowBack: boolean
): Promise<T> {
    return (await runInkPrompt({
        allowBack,
        flowState: activePromptFlowState,
        initialValue,
        kind: 'select',
        message,
        options
    })) as T;
}

export async function promptConfirm(message: string, initialValue: boolean, allowBack: boolean): Promise<boolean> {
    const value = await runInkPrompt({
        allowBack,
        flowState: activePromptFlowState,
        initialValue: initialValue ? 'yes' : 'no',
        kind: 'confirm',
        message
    });
    return value === 'yes';
}

export async function promptNonEmpty(message: string, initialValue: string, allowBack: boolean): Promise<string> {
    return runInkPrompt({
        allowBack,
        flowState: activePromptFlowState,
        initialValue,
        kind: 'text',
        message,
        validate(value) {
            if (!value.trim()) return '不能为空';
            return undefined;
        }
    });
}

export async function promptPassword(message: string, allowBack: boolean): Promise<string> {
    return runInkPrompt({
        allowBack,
        flowState: activePromptFlowState,
        initialValue: '',
        kind: 'password',
        message,
        validate(value) {
            if (!value.trim()) return '不能为空';
            if (value.length < 8) return '至少 8 个字符';
            return undefined;
        }
    });
}
