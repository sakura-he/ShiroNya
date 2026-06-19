import { Box, Text, renderToString } from 'ink';
import { createElement } from 'react';

import type { InkUITheme } from '../components/ui/_core.js';
import { DataTable, type DataTableColumn } from '../components/ui/data-table/index.js';
import { Header } from '../components/ui/header/index.js';
import { Toast, type ToastVariant } from '../components/ui/toast/index.js';
import type { DockerContainerStatus } from '../core/types.ts';

const ansiReset = '\x1b[0m';
const ansiBold = '\x1b[1m';

function rgb(r: number, g: number, b: number): string {
    return `\x1b[38;2;${r};${g};${b}m`;
}

const theme = {
    frame: rgb(167, 139, 250),
    title: `${ansiBold}${rgb(233, 213, 255)}`,
    section: `${ansiBold}${rgb(216, 180, 254)}`,
    label: rgb(196, 181, 253),
    value: rgb(245, 243, 255),
    path: rgb(221, 214, 254),
    url: rgb(216, 180, 254),
    muted: rgb(139, 124, 186),
    danger: rgb(240, 171, 252)
};

const deployInkTheme: InkUITheme = {
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

const ansiPattern = /\x1b\[[0-9;]*m/g;
let deployThemeBypassDepth = 0;

function color(text: string, style: string): string {
    return `${style}${text}${ansiReset}`;
}

function applyDeployThemeToAnsi(input: string): string {
    return input
        .replaceAll('\x1b[32m', theme.frame)
        .replaceAll('\x1b[36m', theme.frame)
        .replaceAll('\x1b[34m', theme.label)
        .replaceAll('\x1b[33m', theme.section)
        .replaceAll('\x1b[31m', theme.danger)
        .replaceAll('\x1b[90m', theme.muted)
        .replaceAll('\x1b[2m', theme.muted)
        .replaceAll('\x1b[22m', '\x1b[22m\x1b[39m');
}

function installWriteTransform(stream: NodeJS.WriteStream): void {
    const state = stream as NodeJS.WriteStream & { __shiroNyaDeployThemeInstalled?: boolean };
    if (state.__shiroNyaDeployThemeInstalled) return;

    const originalWrite = stream.write.bind(stream) as (
        chunk: string | Uint8Array,
        encoding?: BufferEncoding | ((error?: Error | null) => void),
        cb?: (error?: Error | null) => void
    ) => boolean;
    state.__shiroNyaDeployThemeInstalled = true;
    stream.write = ((
        chunk: string | Uint8Array,
        encoding?: BufferEncoding | ((error?: Error | null) => void),
        cb?: (error?: Error | null) => void
    ) => {
        if (deployThemeBypassDepth > 0) {
            if (typeof encoding === 'function') {
                return originalWrite(chunk, encoding);
            }

            return originalWrite(chunk, encoding, cb);
        }

        const themedChunk = applyDeployThemeToAnsi(
            typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
        );
        if (typeof encoding === 'function') {
            return originalWrite(themedChunk, encoding);
        }

        return originalWrite(themedChunk, encoding, cb);
    }) as NodeJS.WriteStream['write'];
}

export function installDeployThemeOutputTransform(): void {
    installWriteTransform(process.stdout);
    installWriteTransform(process.stderr);
}

export function withDeployThemeBypass<T>(callback: () => T): T {
    deployThemeBypassDepth++;

    try {
        return callback();
    } finally {
        deployThemeBypassDepth--;
    }
}

function stripAnsi(input: string): string {
    return input.replace(ansiPattern, '');
}

function visibleWidth(input: string): number {
    let width = 0;

    for (const char of stripAnsi(input)) {
        width += char.charCodeAt(0) > 255 ? 2 : 1;
    }

    return width;
}

function padVisible(input: string, width: number): string {
    return `${input}${' '.repeat(Math.max(0, width - visibleWidth(input)))}`;
}

function takeVisible(input: string, width: number): [string, string] {
    let used = 0;
    let taken = '';

    for (const char of input) {
        const charWidth = char.charCodeAt(0) > 255 ? 2 : 1;
        if (used + charWidth > width) break;
        used += charWidth;
        taken += char;
    }

    return [taken, input.slice(taken.length)];
}

function wrapLine(line: string, width: number): string[] {
    if (!line || visibleWidth(line) <= width) return [line];

    const indent = /^(\s*)/.exec(line)?.[1] ?? '';
    const continuationIndent = `${indent}  `;
    const lines: string[] = [];
    let prefix = '';
    let remaining = line;

    while (remaining && visibleWidth(`${prefix}${remaining}`) > width) {
        const available = Math.max(1, width - visibleWidth(prefix));
        const [head, tail] = takeVisible(remaining, available);
        lines.push(`${prefix}${head}`);
        remaining = tail;
        prefix = continuationIndent;
    }

    if (remaining) lines.push(`${prefix}${remaining}`);
    return lines;
}

function truncateCellValue(input: unknown, width: number): string {
    const text = String(input ?? '');
    if (visibleWidth(text) < width) return text;

    const suffix = '…';
    const targetWidth = Math.max(1, width - visibleWidth(suffix) - 1);
    const [head] = takeVisible(text, targetWidth);
    return `${head}${suffix}`;
}

function colorSummaryLine(line: string): string {
    if (!line.trim()) return '';

    if (line.trim().endsWith(':')) {
        return color(line, theme.section);
    }

    const envMatch = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (envMatch) {
        return `${color(envMatch[1], theme.label)}${color('=', theme.muted)}${color(envMatch[2], theme.value)}`;
    }

    const labelMatch = /^(\s*)([^:]+):(\s.*)$/.exec(line);
    if (labelMatch) {
        const [, indent, label, value] = labelMatch;
        const valueStyle = /https?:\/\//.test(value) ? theme.url : theme.value;
        return `${indent}${color(`${label}:`, theme.label)}${color(value, valueStyle)}`;
    }

    if (/^\s+\S/.test(line)) {
        return color(line, theme.path);
    }

    return color(line, theme.value);
}

export function printDeploySummary(summary: string, title = '部署摘要'): void {
    const rawLines = ['', ...summary.split('\n'), ''];
    const terminalWidth = Math.max(40, (process.stdout.columns ?? 120) - 6);
    const contentWidth = Math.min(Math.max(32, ...rawLines.map(visibleWidth), visibleWidth(title) + 2), terminalWidth);
    const lines = rawLines.flatMap((line) => wrapLine(line, contentWidth)).map(colorSummaryLine);

    process.stdout.write(
        [
            renderToString(
                createElement(Header, {
                    style: 'line',
                    theme: deployInkTheme,
                    title,
                    width: terminalWidth
                }),
                { columns: terminalWidth }
            ),
            ...lines.map((line) => `  ${padVisible(line, contentWidth)}`),
            ''
        ].join('\n')
    );
}

export function printDeployToast(options: { message?: string; title: string; variant?: ToastVariant }): void {
    process.stdout.write(
        `${renderToString(
            createElement(
                Box,
                { flexDirection: 'column' },
                createElement(Toast, {
                    duration: 0,
                    message: options.title,
                    theme: deployInkTheme,
                    variant: options.variant
                }),
                options.message
                    ? createElement(Text, { color: deployInkTheme.colors.muted }, `  ${options.message}`)
                    : null
            )
        )}\n`
    );
}

function dockerContainerStatusColumns(tableInnerWidth: number): Array<DataTableColumn<DockerContainerStatus>> {
    const columnConfigs = [
        { header: '服务', key: 'service', minWidth: 13, weight: 2 },
        { header: '容器', key: 'name', minWidth: 16, weight: 3 },
        { header: '状态', key: 'state', minWidth: 10, weight: 0 },
        { header: '详情', key: 'status', minWidth: 15, weight: 2 },
        { header: '端口', key: 'ports', minWidth: 15, weight: 4 }
    ] satisfies Array<{
        header: string;
        key: keyof DockerContainerStatus & string;
        minWidth: number;
        weight: number;
    }>;
    const totalMinWidth = columnConfigs.reduce((total, column) => total + column.minWidth, 0);
    const totalWeight = columnConfigs.reduce((total, column) => total + column.weight, 0);
    let remainingWidth = Math.max(0, tableInnerWidth - totalMinWidth);
    const widths = columnConfigs.map((column) => {
        const extra = totalWeight > 0 ? Math.floor((remainingWidth * column.weight) / totalWeight) : 0;
        return column.minWidth + extra;
    });
    remainingWidth = Math.max(0, tableInnerWidth - widths.reduce((total, width) => total + width, 0));

    for (let index = widths.length - 1; remainingWidth > 0; index = (index - 1 + widths.length) % widths.length) {
        if (columnConfigs[index].weight <= 0) continue;
        widths[index]++;
        remainingWidth--;
    }

    return columnConfigs.map((column, index) => ({
        header: column.header,
        key: column.key,
        render: (value) => truncateCellValue(value, widths[index]),
        width: widths[index]
    }));
}

export function printDockerContainerStatusTable(statuses: DockerContainerStatus[]): void {
    const terminalColumns = process.stdout.columns ?? 80;
    const fixedFrameColumns = 2;
    const safeWidth = Math.max(49, terminalColumns - 2);
    const columns = dockerContainerStatusColumns(Math.max(1, safeWidth - fixedFrameColumns));

    process.stdout.write(
        [
            renderToString(
                createElement(Header, {
                    style: 'line',
                    theme: deployInkTheme,
                    title: 'Docker 容器状态',
                    width: safeWidth
                }),
                { columns: safeWidth }
            ),
            renderToString(
                createElement(DataTable<DockerContainerStatus>, {
                    borderStyle: 'single',
                    columns,
                    data: statuses,
                    emptyMessage: '未发现容器',
                    focus: false,
                    pageSize: Math.max(1, statuses.length),
                    searchable: false,
                    selectable: false,
                    showFooter: false,
                    theme: deployInkTheme
                }),
                { columns: safeWidth }
            ),
            ''
        ].join('\n')
    );
}
