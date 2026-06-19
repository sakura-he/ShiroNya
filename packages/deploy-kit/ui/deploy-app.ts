import { Box } from 'ink';
import { createElement, memo } from 'react';

import { type InkUITheme } from '../components/ui/_core.js';
import { Header } from '../components/ui/header/index.js';
import { DeployProgressApp, type DeployUiState } from './deploy-progress-ui.ts';
import { InkPrompt, type PromptProps, type PromptResult } from './ink-prompts.ts';

export const deployHeaderRows = 2;
export const deployHeaderTitle = '(✿◠‿◠) ShiroNya 部署';

export const deployHeaderTheme: InkUITheme = {
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

export type DeployAppPromptState = PromptProps & {
    onResult: (result: PromptResult) => void;
    promptKey: number;
};

export type DeployAppState = {
    deploy?: DeployUiState;
    deployCompleted?: boolean;
    headerStep?: {
        currentStep: number;
        totalSteps: number;
    };
    logoHeight: number;
    prompt?: DeployAppPromptState;
    showLogo: boolean;
};

export function cloneDeployAppState(state: DeployAppState): DeployAppState {
    return {
        ...state,
        deploy: state.deploy
            ? {
                  logs: [...state.deploy.logs],
                  pendingLogLine: state.deploy.pendingLogLine,
                  steps: state.deploy.steps.map((step) => ({ ...step }))
              }
            : undefined
    };
}

const DeployIdleLayer = memo(function DeployIdleLayer(props: { rows: number }) {
    return createElement(Box, { height: props.rows, width: '100%' });
});

export function DeployInkRoot(props: { columns: number; rows: number; state: DeployAppState }) {
    const columns = Math.max(24, props.columns);
    const inkRows = Math.max(deployHeaderRows + 1, props.rows);
    const contentRows = Math.max(1, inkRows - deployHeaderRows);
    const headerSubtitle = props.state.headerStep
        ? `STEP ${props.state.headerStep.currentStep}/${props.state.headerStep.totalSteps}`
        : props.state.deployCompleted
          ? '部署完成'
          : '部署';

    return createElement(
        Box,
        { flexDirection: 'column', height: inkRows },
        createElement(Header, {
            style: 'filled',
            subtitle: headerSubtitle,
            theme: deployHeaderTheme,
            title: deployHeaderTitle,
            typewriter: true,
            typewriterSpeed: 12,
            width: columns
        }),
        props.state.prompt
            ? createElement(InkPrompt, {
                  ...props.state.prompt,
                  height: contentRows,
                  width: columns
              })
            : props.state.deploy
              ? createElement(DeployProgressApp, {
                    flowRows: contentRows,
                    getFlowRows: () => contentRows,
                    state: props.state.deploy
                })
              : createElement(DeployIdleLayer, { rows: contentRows })
    );
}
