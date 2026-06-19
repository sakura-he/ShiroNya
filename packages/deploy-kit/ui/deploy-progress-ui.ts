import { Box, Text, render, useStdout, type Instance } from 'ink';
import { createElement } from 'react';

import { type InkUITheme } from '../components/ui/_core.js';
import { Header } from '../components/ui/header/index.js';
import { ProgressBar } from '../components/ui/progress-bar/index.js';
import { Spinner } from '../components/ui/spinner/index.js';
import { StatusIndicator, type StatusValue } from '../components/ui/status-indicator/index.js';
import type { DeployHeaderLogoController, DeployProgressUiController, DeployStep } from '../core/types.ts';
import { formatDuration } from '../utils/format.ts';

export type DeployUiStepStatus = 'pending' | 'running' | 'done' | 'failed';

export type DeployUiStep = {
    durationMs?: number;
    progress: number;
    status: DeployUiStepStatus;
    title: string;
};

export type DeployUiState = {
    logs: string[];
    pendingLogLine: string;
    steps: DeployUiStep[];
};

type DeployLayerRows = {
    log: number;
    status: number;
    step: number;
    total: number;
};

type DeployProgressAppProps = {
    flowRows?: number;
    getFlowRows: () => number;
    state: DeployUiState;
};

const deployProgressTheme: InkUITheme = {
    colors: {
        primary: '#c4b5fd',
        secondary: '#e9d5ff',
        success: '#8b5cf6',
        warning: '#fde68a',
        error: '#f0abfc',
        info: '#7c3aed',
        muted: '#8b7cba',
        text: '#a78bfa',
        textInverse: '#21143a',
        border: '#a78bfa',
        focus: '#e9d5ff',
        selection: '#7c3aed'
    },
    border: 'single'
};
const deployLogLayerRows = 10;
const deployStatusLayerRows = 3;
const renderThrottleMs = 50;

function cursorTo(row: number, column: number): string {
    return `\x1b[${row};${column}H`;
}

function deployLayerRows(flowRows: number): DeployLayerRows {
    const rows = Math.max(1, Math.floor(flowRows));
    const status = rows >= 2 ? Math.min(deployStatusLayerRows, rows - 1) : 0;
    const log = Math.min(deployLogLayerRows, Math.max(0, rows - status - 1));
    const step = Math.max(1, rows - status - log);

    return {
        log,
        status,
        step,
        total: step + status + log
    };
}

function statusValue(status: DeployUiStepStatus): StatusValue {
    switch (status) {
        case 'done':
            return 'online';
        case 'failed':
            return 'error';
        case 'running':
            return 'loading';
        case 'pending':
            return 'idle';
    }
}

function isDockerPullStep(title: string): boolean {
    return /拉取\s*Docker\s*镜像/i.test(title);
}

function findLastStepIndex(steps: DeployUiStep[], predicate: (step: DeployUiStep) => boolean): number {
    for (let index = steps.length - 1; index >= 0; index--) {
        if (predicate(steps[index])) return index;
    }

    return -1;
}

function currentStepIndex(steps: DeployUiStep[]): number {
    return Math.max(
        steps.findIndex((step) => step.status === 'running'),
        findLastStepIndex(steps, (step) => step.status === 'done' || step.status === 'failed'),
        0
    );
}

function visibleDeploySteps(steps: DeployUiStep[], maxRows: number): Array<{ index: number; step: DeployUiStep }> {
    if (!steps.length) return [];

    const safeMaxRows = Math.max(1, Math.floor(maxRows));
    const runningIndex = steps.findIndex((step) => step.status === 'running');
    const lastActiveIndex = Math.max(
        runningIndex,
        findLastStepIndex(steps, (step) => step.status === 'done' || step.status === 'failed'),
        0
    );
    let start = lastActiveIndex;
    let end = lastActiveIndex;
    let usedRows = 1;

    while (usedRows < safeMaxRows && (start > 0 || end < steps.length - 1)) {
        const preferPrevious = start > 0 && (runningIndex >= 0 || end >= steps.length - 1);

        if (preferPrevious) {
            start--;
        } else {
            end++;
        }
        usedRows++;
    }

    return steps.slice(start, end + 1).map((step, offset) => ({
        index: start + offset,
        step
    }));
}

function terminalCharWidth(char: string): number {
    return char.charCodeAt(0) > 255 ? 2 : 1;
}

function truncateLine(input: string, maxWidth: number): string {
    let output = '';
    let used = 0;

    for (const char of input) {
        const width = terminalCharWidth(char);
        if (used + width > maxWidth) break;
        output += char;
        used += width;
    }

    return output;
}

function DeployTimelineLayer(props: { rows: number; steps: DeployUiStep[] }) {
    const visibleSteps = visibleDeploySteps(props.steps, props.rows);

    return createElement(
        Box,
        { flexDirection: 'column', height: props.rows, width: '100%' },
        ...visibleSteps.map(({ index, step }) => {
            const durationText = step.durationMs === undefined ? '' : ` · ${formatDuration(step.durationMs)}`;
            return createElement(StatusIndicator, {
                key: `${index}-${step.title}`,
                label: `${index + 1}. ${step.title}${durationText}`,
                status: statusValue(step.status),
                theme: deployProgressTheme
            });
        })
    );
}

function DeployStatusLayer(props: { columns: number; rows: number; step?: DeployUiStep }) {
    if (props.rows <= 0) return null;

    if (!props.step) {
        return createElement(
            Box,
            { flexDirection: 'column', height: props.rows, width: props.columns },
            createElement(StatusIndicator, {
                label: '等待部署步骤',
                pulse: false,
                status: 'idle',
                theme: deployProgressTheme
            })
        );
    }

    const progress = Math.round(props.step.progress * 100);
    const statusTitle =
        props.step.status === 'running'
            ? createElement(Spinner, {
                  interval: 80,
                  label: `${props.step.title} ${progress}%`,
                  theme: deployProgressTheme,
                  type: 'dots'
              })
            : createElement(StatusIndicator, {
                  label: props.step.title,
                  status: statusValue(props.step.status),
                  theme: deployProgressTheme
              });

    return createElement(
        Box,
        { flexDirection: 'column', height: props.rows, width: props.columns },
        statusTitle,
        createElement(ProgressBar, {
            label: isDockerPullStep(props.step.title) ? 'Docker' : '部署',
            showPercent: true,
            theme: deployProgressTheme,
            value: props.step.progress * 100,
            width: Math.max(16, props.columns - (isDockerPullStep(props.step.title) ? 16 : 14))
        })
    );
}

function DeployLogLayer(props: { columns: number; pendingLogLine: string; rows: number; logs: string[] }) {
    if (props.rows <= 0) return null;

    const width = Math.max(1, props.columns - 1);
    const logRows = Math.max(0, props.rows - 1);
    const lines = props.pendingLogLine ? [...props.logs, props.pendingLogLine] : props.logs;
    const visibleLines = lines.slice(-logRows);

    return createElement(
        Box,
        { flexDirection: 'column', height: props.rows, width: props.columns },
        createElement(Header, {
            style: 'line',
            theme: deployProgressTheme,
            title: '实时部署日志',
            width: props.columns
        }),
        ...Array.from({ length: logRows }, (_, index) =>
            createElement(
                Text,
                {
                    color: deployProgressTheme.colors.muted,
                    key: index
                },
                truncateLine(visibleLines[index] ?? '', width)
            )
        )
    );
}

export function DeployProgressApp({ flowRows, getFlowRows, state }: DeployProgressAppProps) {
    const { stdout } = useStdout();
    const columns = Math.max(24, stdout?.columns ?? process.stdout.columns ?? 120);
    const rows = deployLayerRows(Math.max(1, flowRows ?? getFlowRows()));
    const index = currentStepIndex(state.steps);

    return createElement(
        Box,
        { flexDirection: 'column', height: rows.total, width: columns },
        createElement(DeployTimelineLayer, { rows: rows.step, steps: state.steps }),
        createElement(DeployStatusLayer, {
            columns,
            rows: rows.status,
            step: state.steps[index]
        }),
        createElement(DeployLogLayer, {
            columns,
            logs: state.logs,
            pendingLogLine: state.pendingLogLine,
            rows: rows.log
        })
    );
}

export function cloneDeployProgressState(state: DeployUiState): DeployUiState {
    return {
        logs: [...state.logs],
        pendingLogLine: state.pendingLogLine,
        steps: state.steps.map((step) => ({ ...step }))
    };
}

export function createDeployProgressState(steps: DeployStep[]): DeployUiState {
    return {
        logs: [],
        pendingLogLine: '',
        steps: steps.map((step) => ({
            progress: 0,
            status: 'pending',
            title: step.title
        }))
    };
}

export function startDeployProgressUi(
    steps: DeployStep[],
    logo: DeployHeaderLogoController
): DeployProgressUiController {
    const state = createDeployProgressState(steps);
    const getFlowRows = (): number => Math.max(1, logo.getFlowRows?.() ?? process.stdout.rows ?? 40);
    const element = (): ReturnType<typeof createElement> =>
        createElement(DeployProgressApp, {
            getFlowRows,
            state: cloneDeployProgressState(state)
        });
    let stopped = false;
    let renderTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let instance: Instance | undefined;

    const mount = (): void => {
        process.stdout.write(cursorTo(Math.max(1, logo.getFlowTop?.() ?? 1), 1));
        instance = render(element(), {
            exitOnCtrlC: false,
            patchConsole: false
        });
    };

    const unmount = (): void => {
        instance?.clear();
        instance?.unmount();
        instance = undefined;
    };

    const rerenderNow = (): void => {
        if (stopped || !instance) return;
        if (renderTimer) {
            clearTimeout(renderTimer);
            renderTimer = undefined;
        }
        instance.rerender(element());
    };

    const scheduleRender = (): void => {
        if (stopped || renderTimer) return;
        renderTimer = setTimeout(() => {
            renderTimer = undefined;
            rerenderNow();
        }, renderThrottleMs);
    };

    const handleResize = (): void => {
        if (stopped) return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (stopped) return;
            unmount();
            mount();
        }, 140);
    };

    mount();
    process.stdout.on('resize', handleResize);

    return {
        writeLog(text) {
            const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const endedWithNewline = normalized.endsWith('\n');
            const parts = normalized.split('\n');
            const tail = endedWithNewline ? '' : (parts.pop() ?? '');

            if (endedWithNewline) {
                parts.pop();
            }

            for (const part of parts) {
                const line = `${state.pendingLogLine}${part}`;
                state.pendingLogLine = '';
                if (!line) continue;
                state.logs.push(line);
            }
            state.pendingLogLine += tail;
            if (state.logs.length > deployLogLayerRows * 20) {
                state.logs.splice(0, state.logs.length - deployLogLayerRows * 20);
            }
            scheduleRender();
        },
        setProgress(currentStep, progress) {
            const step = state.steps[currentStep];
            if (!step) return;
            step.progress = Math.min(1, Math.max(0, progress));
            scheduleRender();
        },
        startStep(currentStep) {
            const step = state.steps[currentStep];
            if (!step) return;
            step.status = 'running';
            step.progress = Math.max(step.progress, 0.02);
            rerenderNow();
        },
        completeStep(currentStep, durationMs) {
            const step = state.steps[currentStep];
            if (!step) return;
            step.status = 'done';
            step.progress = 1;
            step.durationMs = durationMs;
            rerenderNow();
        },
        failStep(currentStep, durationMs) {
            const step = state.steps[currentStep];
            if (!step) return;
            step.status = 'failed';
            step.durationMs = durationMs;
            rerenderNow();
        },
        stop() {
            stopped = true;
            if (renderTimer) clearTimeout(renderTimer);
            if (resizeTimer) clearTimeout(resizeTimer);
            process.stdout.off('resize', handleResize);
            unmount();
        }
    };
}
