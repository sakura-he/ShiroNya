import fs from 'fs-extra';
import { render, type Instance } from 'ink';
import { createElement } from 'react';

import { shouldShowLogo } from '../cli/help.ts';
import { cloneDeployAppState, deployHeaderRows, DeployInkRoot, type DeployAppState } from './deploy-app.ts';
import { createDeployProgressState } from './deploy-progress-ui.ts';
import { PromptBackRequested, PromptCancelled } from './ink-prompts.ts';
import { deployHeaderLogoPath } from '../core/paths.ts';
import { withDeployThemeBypass } from './theme.ts';
import type {
    DeployHeaderLogoController,
    DeployLogoFrame,
    DeployLogoKeyframeFile,
    DeployLogoPlayback,
    DeployProgressUiController,
    DeployProgressLogo,
    DeployStep,
    MotionCell,
    MotionFrame,
    Rgb,
    RuntimeFrameData,
    RuntimeLogoCell
} from '../core/types.ts';

const ansiReset = '\x1b[0m';
const ansiClearScreen = '\x1b[2J';
const ansiHome = '\x1b[H';
const ansiSaveCursor = '\x1b[s';
const ansiRestoreCursor = '\x1b[u';
const ansiClearLine = '\x1b[2K';
const ansiStylePattern = /\x1b\[[0-9;]*m/g;
const terminalCellAspectRatio = 0.46;
const maxTerminalAspectScale = 1.55;
const terminalHeightScaleExponent = 0.8;
const deployLogoScale = 0.82;
const deployLogoHorizontalCorrection = 0.97;
const deployLogoResponsiveBaselineColumns = 120;
const progressFallDurationMs = 620;
const progressFallFrameMs = 1000 / 24;
const deployManualLogoMinFrameMs = 8;
const deployLogoHeaderGapRows = 1;
const deployInkSafeColumns = 1;
const deployInkBottomSafeRows = 1;
const deployLogoInitialGlitchHoldMs = 1000;
const deployLogoKeyframeHoldSeconds = 3;

type DeployLogoGlitchFrame = {
    blankModulo?: number;
    diagonalModulo: number;
    diagonalOffset: number;
    duration: number;
    verticalOffset: number;
};

const deployLogoGlitchFrames: DeployLogoGlitchFrame[] = [
    { diagonalModulo: 6, diagonalOffset: 1, duration: 28, verticalOffset: -1 },
    { blankModulo: 8, diagonalModulo: 5, diagonalOffset: 2, duration: 42, verticalOffset: 2 },
    { blankModulo: 6, diagonalModulo: 4, diagonalOffset: 1, duration: 26, verticalOffset: -2 },
    { diagonalModulo: 7, diagonalOffset: 3, duration: 46, verticalOffset: 1 },
    { blankModulo: 9, diagonalModulo: 5, diagonalOffset: 2, duration: 34, verticalOffset: -1 },
    { diagonalModulo: 1, diagonalOffset: 0, duration: 54, verticalOffset: 0 }
];

function cursorTo(row: number, column: number): string {
    return `\x1b[${row};${column}H`;
}

function scrollRegion(top: number, bottom: number): string {
    return `\x1b[${top};${bottom}r`;
}

function resetScrollRegion(): string {
    return '\x1b[r';
}

function safeInkColumns(columns: number): number {
    return Math.max(24, columns - deployInkSafeColumns);
}

function writeLogoOutput(output: string): void {
    withDeployThemeBypass(() => {
        process.stdout.write(output);
    });
}

function createSafeInkStdout(
    stdout: NodeJS.WriteStream,
    getColumns: () => number,
    getRows: () => number
): NodeJS.WriteStream {
    return new Proxy(stdout, {
        get(target, property) {
            if (property === 'columns') return safeInkColumns(getColumns());
            if (property === 'rows') return getRows();

            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
}

function hexToRgb(hex: string | undefined): Rgb | null {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
    if (!match) return null;
    const value = Number.parseInt(match[1], 16);
    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255
    };
}

function foreground(color: string | undefined): string {
    const rgb = hexToRgb(color);
    return rgb ? `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m` : '';
}

function background(color: string | undefined): string {
    if (!color || color === 'transparent') return '';
    const rgb = hexToRgb(color);
    return rgb ? `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m` : '';
}

function terminalCharWidth(char: string): number {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0) return 0;

    if (
        (code >= 0x2500 && code <= 0x259f) ||
        (code >= 0x2800 && code <= 0x28ff) ||
        (code >= 0x1fb00 && code <= 0x1fbff)
    ) {
        return 1;
    }

    if (
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe10 && code <= 0xfe6f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6)
    ) {
        return 2;
    }

    return 1;
}

function visibleTerminalWidth(input: string): number {
    let width = 0;

    for (const char of input.replace(ansiStylePattern, '')) {
        width += terminalCharWidth(char);
    }

    return width;
}

function truncateVisibleTerminal(input: string, width: number): string {
    let output = '';
    let used = 0;
    let index = 0;
    let truncated = false;

    while (index < input.length) {
        const rest = input.slice(index);
        const ansiMatch = /^\x1b\[[0-9;]*m/.exec(rest);
        if (ansiMatch) {
            output += ansiMatch[0];
            index += ansiMatch[0].length;
            continue;
        }

        const code = input.codePointAt(index);
        if (code === undefined) break;

        const char = String.fromCodePoint(code);
        const charWidth = terminalCharWidth(char);
        if (used + charWidth > width) {
            truncated = true;
            break;
        }

        output += char;
        used += charWidth;
        index += char.length;
    }

    return truncated ? `${output}${ansiReset}` : output;
}

function centerVisibleTerminal(input: string, width: number): string {
    const fitted = truncateVisibleTerminal(input, width);
    const padding = Math.max(0, width - visibleTerminalWidth(fitted));
    const left = Math.floor(padding / 2);
    const right = padding - left;

    return `${' '.repeat(left)}${fitted}${' '.repeat(right)}`;
}

function deployHeaderColumns(columns: number): number {
    return Math.max(3, columns - 1);
}

function deployHeaderInnerColumns(columns: number): number {
    return Math.max(1, deployHeaderColumns(columns) - 2);
}

function renderDeployLogoLine(line: string, columns: number): string {
    const safeWidth = Math.max(1, Math.min(deployHeaderInnerColumns(columns), columns - 6));
    return ` ${centerVisibleTerminal(line, safeWidth)}`;
}

function parseCellKey(key: string): { x: number; y: number } {
    const [x, y] = key.split(',').map((part) => Number.parseInt(part, 10));
    return { x, y };
}

function cellKey(x: number, y: number): string {
    return `${x},${y}`;
}

function normalizeCell(cell: MotionCell | undefined): Required<MotionCell> {
    return {
        char: cell?.char || ' ',
        color: cell?.color || '#FFFFFF',
        bgColor: cell?.bgColor || 'transparent'
    };
}

function emptyMotionRows(width: number, height: number): Required<MotionCell>[][] {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => normalizeCell(undefined)));
}

function buildMotionRows(frame: MotionFrame, width: number, height: number): Required<MotionCell>[][] {
    const rows = emptyMotionRows(width, height);

    for (const [key, rawCell] of Object.entries(frame.data ?? {})) {
        const { x, y } = parseCellKey(key);
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) continue;
        rows[y][x] = normalizeCell(rawCell);
    }

    return rows;
}

function renderMotionRows(rows: Required<MotionCell>[][]): string {
    return rows
        .map((row) => {
            let line = '';
            let lastStyle = '';

            for (const cell of row) {
                const style = `${foreground(cell.color)}${background(cell.bgColor)}`;
                if (style !== lastStyle) {
                    line += ansiReset + style;
                    lastStyle = style;
                }
                line += cell.char;
            }

            return line + ansiReset;
        })
        .join('\n');
}

function scaledMotionRows(
    rows: Required<MotionCell>[][],
    displayWidth: number,
    displayHeight: number
): Required<MotionCell>[][] {
    if (!rows.length || (rows[0].length === displayWidth && rows.length === displayHeight)) return rows;

    const sourceWidth = rows[0].length;
    const sourceHeight = rows.length;
    return Array.from({ length: displayHeight }, (_, yIndex) => {
        const sourceY = scaleIndex(yIndex, displayHeight, sourceHeight);
        const row = rows[sourceY];

        return Array.from({ length: displayWidth }, (_, xIndex) => {
            const sourceX = scaleIndex(xIndex, displayWidth, sourceWidth);
            return row[sourceX];
        });
    });
}

function scaleIndex(index: number, displaySize: number, sourceSize: number): number {
    if (displaySize <= 1 || sourceSize <= 1) return 0;
    return Math.min(sourceSize - 1, Math.round((index * (sourceSize - 1)) / (displaySize - 1)));
}

function motionCellAspectRatio(source: DeployLogoKeyframeFile): number {
    const metrics = source.fontMetrics;
    if (metrics?.aspectRatio && Number.isFinite(metrics.aspectRatio)) return metrics.aspectRatio;

    if (metrics?.characterWidth && metrics.characterHeight) {
        return metrics.characterWidth / metrics.characterHeight;
    }

    return 0.6;
}

function logoTargetWidth(source: DeployLogoKeyframeFile, width: number): number {
    const aspectScale = clamp(motionCellAspectRatio(source) / terminalCellAspectRatio, 1, maxTerminalAspectScale);
    return Math.round(width * aspectScale);
}

function logoBaseDisplayWidth(source: DeployLogoKeyframeFile, width: number): number {
    return Math.max(1, Math.round(logoTargetWidth(source, width) * deployLogoScale));
}

function logoDisplayWidth(source: DeployLogoKeyframeFile, width: number, terminalColumns: number): number {
    const safeColumns = Math.max(1, terminalColumns - 1);
    const baseWidth = logoBaseDisplayWidth(source, width);
    const responsiveScale = Math.max(1, safeColumns / deployLogoResponsiveBaselineColumns);
    const responsiveWidth = Math.round(baseWidth * responsiveScale * deployLogoHorizontalCorrection);
    const minimumWidth = Math.min(width, safeColumns);

    return Math.max(1, Math.min(safeColumns, Math.max(minimumWidth, responsiveWidth)));
}

function logoDisplayHeight(
    height: number,
    displayWidth: number,
    baseWidth: number,
    terminalRows: number,
    maxLogoHeight?: number
): number {
    const widthRatio = displayWidth / Math.max(1, baseWidth);
    const targetHeight = Math.round(height * deployLogoScale * Math.pow(widthRatio, terminalHeightScaleExponent));
    const heightLimit = Math.max(1, maxLogoHeight ?? terminalRows - 8);

    return Math.max(1, Math.min(heightLimit, targetHeight));
}

function clamp(value: number, min = 0, max = 1): number {
    return Math.min(max, Math.max(min, value));
}

function rgbToHex(rgb: Rgb): string {
    return `#${[rgb.r, rgb.g, rgb.b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function isDeployLogoKeyframeFile(value: unknown): value is DeployLogoKeyframeFile {
    const source = value as DeployLogoKeyframeFile;
    return source?.format === 'shiro-nya-cli-logo-keyframes' && Array.isArray(source.frames);
}

function hash01(value: string | number, seed = 0): number {
    let hash = 2166136261 ^ seed;
    const text = String(value);

    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }

    return ((hash >>> 0) % 100000) / 100000;
}

function smoothstep(value: number): number {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
}

function mixColor(from: string | undefined, to: string | undefined, amount: number): string {
    const fromRgb = hexToRgb(from) ?? { r: 255, g: 255, b: 255 };
    const toRgb = hexToRgb(to) ?? fromRgb;
    const t = clamp(amount);

    return rgbToHex({
        r: Math.round(fromRgb.r + (toRgb.r - fromRgb.r) * t),
        g: Math.round(fromRgb.g + (toRgb.g - fromRgb.g) * t),
        b: Math.round(fromRgb.b + (toRgb.b - fromRgb.b) * t)
    });
}

function cellsFromFrame(frame: MotionFrame): RuntimeLogoCell[] {
    return Object.entries(frame.data ?? {})
        .map(([key, rawCell]) => ({
            key,
            ...parseCellKey(key),
            ...normalizeCell(rawCell)
        }))
        .filter((cell) => Number.isInteger(cell.x) && Number.isInteger(cell.y));
}

function isVisibleParticle(cell: MotionCell): boolean {
    const normalized = normalizeCell(cell);
    const color = normalized.color.toLowerCase();
    return normalized.char.trim().length > 0 && !(color === '#000000' && normalized.bgColor === 'transparent');
}

function visibleCellsFromFrame(frame: MotionFrame): RuntimeLogoCell[] {
    return cellsFromFrame(frame).filter(isVisibleParticle);
}

function orderedCells(cells: RuntimeLogoCell[], width: number, height: number, seed: number): RuntimeLogoCell[] {
    return [...cells].sort((left, right) => {
        const leftOrder =
            (left.x / Math.max(1, width - 1)) * 0.62 +
            (left.y / Math.max(1, height - 1)) * 0.24 +
            hash01(left.key, seed) * 0.14;
        const rightOrder =
            (right.x / Math.max(1, width - 1)) * 0.62 +
            (right.y / Math.max(1, height - 1)) * 0.24 +
            hash01(right.key, seed) * 0.14;

        return leftOrder - rightOrder;
    });
}

function topCharacters(frame: MotionFrame, limit = 12): string[] {
    const counts = new Map<string, number>();

    for (const cell of visibleCellsFromFrame(frame)) {
        counts.set(cell.char, (counts.get(cell.char) ?? 0) + 1);
    }

    return [...counts.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit)
        .map(([char]) => char);
}

function pickByRatio<T>(items: readonly T[], ratio: number, fallback: T): T {
    if (!items.length) return fallback;
    const index = Math.min(items.length - 1, Math.floor(clamp(ratio) * items.length));
    return items[index] ?? fallback;
}

function pairCell(cells: RuntimeLogoCell[], index: number, count: number): RuntimeLogoCell | null {
    if (!cells.length) return null;
    if (count <= 1) return cells[0];
    const cellIndex = Math.min(cells.length - 1, Math.round((index * (cells.length - 1)) / (count - 1)));
    return cells[cellIndex];
}

function writeRuntimeCell(data: RuntimeFrameData, key: string, cell: Required<MotionCell>, priority: number): void {
    const existingPriority = data[key]?.__priority ?? -1;

    if (priority >= existingPriority) {
        data[key] = {
            char: cell.char,
            color: cell.color,
            bgColor: cell.bgColor,
            __priority: priority
        };
    }
}

function cleanRuntimePriorities(data: RuntimeFrameData): Record<string, MotionCell> {
    const cleaned: Record<string, MotionCell> = {};

    for (const [key, cell] of Object.entries(data)) {
        cleaned[key] = {
            char: cell.char,
            color: cell.color,
            bgColor: cell.bgColor
        };
    }

    return cleaned;
}

function dimColor(color: string, amount = 0.24): string {
    return mixColor('#050510', color, amount);
}

function addRuntimeStabilityLayer(
    data: RuntimeFrameData,
    fromCells: RuntimeLogoCell[],
    toCells: RuntimeLogoCell[],
    transitionAmount: number,
    seed: number
): void {
    const t = clamp(transitionAmount);

    for (const cell of fromCells) {
        if (hash01(`${cell.key}:stable-from`, seed) < t * 0.22) continue;
        writeRuntimeCell(
            data,
            cell.key,
            {
                char: cell.char,
                color: dimColor(cell.color, 0.18 * (1 - t) + 0.08),
                bgColor: 'transparent'
            },
            -0.35 + hash01(`${cell.key}:stable-from-priority`, seed) * 0.01
        );
    }

    for (const cell of toCells) {
        if (hash01(`${cell.key}:stable-to`, seed) < (1 - t) * 0.28) continue;
        writeRuntimeCell(
            data,
            cell.key,
            {
                char: cell.char,
                color: dimColor(cell.color, 0.1 + 0.2 * t),
                bgColor: 'transparent'
            },
            -0.3 + hash01(`${cell.key}:stable-to-priority`, seed) * 0.01
        );
    }
}

function particleRuntimeTransitionData(
    fromFrame: MotionFrame,
    toFrame: MotionFrame,
    step: number,
    steps: number,
    width: number,
    height: number,
    seed: number
): Record<string, MotionCell> {
    const fromCells = orderedCells(visibleCellsFromFrame(fromFrame), width, height, seed + 11);
    const toCells = orderedCells(visibleCellsFromFrame(toFrame), width, height, seed + 29);
    const count = Math.max(fromCells.length, toCells.length);
    const targetChars = topCharacters(toFrame);
    const globalT = step / (steps + 1);
    const data: RuntimeFrameData = {};

    addRuntimeStabilityLayer(data, fromCells, toCells, globalT, seed);

    for (let index = 0; index < count; index++) {
        const from = pairCell(fromCells, index, count) ?? pairCell(toCells, index, count);
        const to = pairCell(toCells, index, count) ?? from;
        if (!from || !to) continue;

        const order =
            (to.x / Math.max(1, width - 1)) * 0.56 +
            (to.y / Math.max(1, height - 1)) * 0.24 +
            hash01(`${from.key}:${to.key}:${index}`, seed) * 0.2;
        const localT = smoothstep((globalT - order * 0.24) / 0.76);
        const arc = Math.sin(localT * Math.PI);
        const jitter = hash01(`${index}:jitter`, seed) - 0.5;
        const currentX = Math.round(from.x + (to.x - from.x) * localT + arc * jitter * 5);
        const currentY = Math.round(
            from.y + (to.y - from.y) * localT + arc * Math.sin((from.x + to.y + seed) * 0.45) * 2.4
        );

        if (currentX < 0 || currentY < 0 || currentX >= width || currentY >= height) continue;

        const bridgeChar = pickByRatio(targetChars, hash01(`${from.char}:${to.char}:${index}`, seed), to.char);
        const char = localT < 0.34 ? from.char : localT < 0.72 ? bridgeChar : to.char;
        const key = cellKey(currentX, currentY);

        writeRuntimeCell(
            data,
            key,
            {
                char,
                color: mixColor(from.color, to.color, localT),
                bgColor: localT < 0.5 ? from.bgColor : to.bgColor
            },
            localT + hash01(`${key}:${index}`, seed) * 0.02
        );
    }

    return cleanRuntimePriorities(data);
}

function windRuntimeTransitionData(
    fromFrame: MotionFrame,
    toFrame: MotionFrame,
    step: number,
    steps: number,
    width: number,
    height: number,
    seed: number
): Record<string, MotionCell> {
    const fromCells = orderedCells(visibleCellsFromFrame(fromFrame), width, height, seed + 101);
    const toCells = orderedCells(visibleCellsFromFrame(toFrame), width, height, seed + 131);
    const count = Math.max(fromCells.length, toCells.length);
    const targetChars = topCharacters(toFrame, 16);
    const globalT = step / (steps + 1);
    const data: RuntimeFrameData = {};

    addRuntimeStabilityLayer(data, fromCells, toCells, globalT, seed);

    for (let index = 0; index < count; index++) {
        const from = pairCell(fromCells, index, count) ?? pairCell(toCells, index, count);
        const to = pairCell(toCells, index, count) ?? from;
        if (!from || !to) continue;

        const gustOrder =
            (from.x / Math.max(1, width - 1)) * 0.48 +
            hash01(`${from.key}:gust`, seed) * 0.36 +
            (from.y / Math.max(1, height - 1)) * 0.16;
        const localT = smoothstep((globalT - gustOrder * 0.22) / 0.78);
        const gust = Math.sin(localT * Math.PI);
        const swirl = Math.sin(from.y * 0.7 + index * 0.031 + seed + globalT * 9);
        const currentX = Math.round(
            from.x + (to.x - from.x) * localT + gust * (10 + hash01(`${index}:wind-x`, seed) * 16)
        );
        const currentY = Math.round(
            from.y + (to.y - from.y) * localT + gust * swirl * (2.5 + hash01(`${index}:wind-y`, seed) * 3.5)
        );

        if (currentX < 0 || currentY < 0 || currentX >= width || currentY >= height) continue;

        const bridgeChar = pickByRatio(targetChars, hash01(`${to.char}:wind-char:${index}`, seed), to.char);
        const char = localT < 0.45 ? from.char : localT < 0.82 ? bridgeChar : to.char;
        const key = cellKey(currentX, currentY);

        writeRuntimeCell(
            data,
            key,
            {
                char,
                color: mixColor(from.color, to.color, localT),
                bgColor: localT < 0.55 ? from.bgColor : to.bgColor
            },
            localT + gust * 0.08 + hash01(`${key}:wind-priority`, seed) * 0.02
        );

        if (gust <= 0.28 || localT >= 0.82) continue;

        const trailX = currentX - 1;
        if (trailX < 0) continue;
        writeRuntimeCell(
            data,
            cellKey(trailX, currentY),
            {
                char: from.char,
                color: mixColor(from.color, to.color, localT * 0.45),
                bgColor: from.bgColor
            },
            localT * 0.75
        );
    }

    return cleanRuntimePriorities(data);
}

function cellsByColumn(cells: RuntimeLogoCell[]): Map<number, RuntimeLogoCell[]> {
    const columns = new Map<number, RuntimeLogoCell[]>();

    for (const cell of cells) {
        const column = columns.get(cell.x) ?? [];
        column.push(cell);
        columns.set(cell.x, column);
    }

    for (const column of columns.values()) {
        column.sort((left, right) => left.y - right.y);
    }

    return columns;
}

function nearestColumnCell(columns: Map<number, RuntimeLogoCell[]>, x: number, y: number): RuntimeLogoCell | null {
    const column = columns.get(x);
    if (!column?.length) return null;

    let nearest = column[0];
    let nearestDistance = Math.abs(nearest.y - y);

    for (let index = 1; index < column.length; index++) {
        const cell = column[index];
        const distance = Math.abs(cell.y - y);
        if (distance >= nearestDistance) continue;
        nearest = cell;
        nearestDistance = distance;
    }

    return nearest;
}

function targetCellForRain(
    toCells: RuntimeLogoCell[],
    columns: Map<number, RuntimeLogoCell[]>,
    x: number,
    y: number,
    seed: number
): RuntimeLogoCell | null {
    return (
        nearestColumnCell(columns, x, y) ??
        pickByRatio<RuntimeLogoCell | null>(toCells, hash01(`${x}:${y}:target-rain`, seed), null)
    );
}

function matrixRuntimeTransitionData(
    fromFrame: MotionFrame,
    toFrame: MotionFrame,
    step: number,
    steps: number,
    width: number,
    height: number,
    seed: number
): Record<string, MotionCell> {
    const fromCells = visibleCellsFromFrame(fromFrame);
    const toCells = visibleCellsFromFrame(toFrame);
    const fromMap = new Map(fromCells.map((cell) => [cell.key, cell]));
    const toMap = new Map(toCells.map((cell) => [cell.key, cell]));
    const targetColumns = cellsByColumn(toCells);
    const rainChars = topCharacters(toFrame, 18);
    const globalT = step / (steps + 1);
    const data: RuntimeFrameData = {};

    for (const from of fromCells) {
        const target = toMap.get(from.key) ?? targetCellForRain(toCells, targetColumns, from.x, from.y, seed);
        const dissolve = smoothstep((globalT - hash01(`${from.key}:matrix-drift`, seed) * 0.18) / 0.36);
        if (dissolve >= 0.98) continue;

        const y = from.y + Math.round(dissolve * (4 + hash01(`${from.key}:matrix-fall`, seed) * 9));
        if (y < 0 || y >= height) continue;

        const key = cellKey(from.x, y);
        const char =
            dissolve < 0.38
                ? from.char
                : pickByRatio(rainChars, hash01(`${from.key}:matrix-source:${step}`, seed), target?.char ?? from.char);
        const targetColor = target?.color ?? from.color;

        writeRuntimeCell(
            data,
            key,
            {
                char,
                color: mixColor(from.color, targetColor, dissolve * 0.9),
                bgColor: dissolve < 0.55 ? from.bgColor : 'transparent'
            },
            1 - dissolve + hash01(`${key}:source-priority`, seed) * 0.02
        );
    }

    for (let x = 0; x < width; x++) {
        const hasTargetColumn = targetColumns.has(x);
        if (!hasTargetColumn && hash01(`column:${x}:empty-skip`, seed) > 0.22) continue;

        const columnProgress = clamp((globalT - hash01(`column:${x}`, seed) * 0.34 * 0.42) / 0.72);
        if (columnProgress <= 0) continue;

        const trailLength = 5 + Math.floor(hash01(`trail:${x}`, seed) * 8);
        const headY = Math.floor(columnProgress * (height + trailLength + 8)) - trailLength;

        for (let trail = 0; trail < trailLength; trail++) {
            const y = headY - trail;
            if (y < 0 || y >= height) continue;

            const key = cellKey(x, y);
            const target = toMap.get(key) ?? targetCellForRain(toCells, targetColumns, x, y, seed);
            const from = fromMap.get(key);
            const char = pickByRatio(
                rainChars,
                hash01(`${x}:${y}:${step}:rain-char`, seed),
                target?.char ?? from?.char ?? rainChars[0] ?? ' '
            );
            const fade = clamp(1 - trail / Math.max(1, trailLength - 1));
            const targetColor = target?.color ?? from?.color ?? '#FFFFFF';
            const rainColor =
                fade > 0.72
                    ? mixColor(targetColor, '#FFFFFF', 0.22)
                    : fade > 0.34
                      ? targetColor
                      : dimColor(targetColor, 0.42);

            writeRuntimeCell(
                data,
                key,
                {
                    char,
                    color: rainColor,
                    bgColor: 'transparent'
                },
                0.55 + fade + columnProgress * 0.35
            );
        }
    }

    for (const to of toCells) {
        const bottomToTopOrder = (height - 1 - to.y) / Math.max(1, height - 1);
        const columnOrder = hash01(`column:${to.x}`, seed) * 0.28;
        const settleOrder = bottomToTopOrder * 0.58 + columnOrder + hash01(`${to.key}:settle`, seed) * 0.14;
        const reveal = smoothstep((globalT - 0.34 - settleOrder * 0.42) / 0.18);
        if (reveal <= 0) continue;

        const from = fromMap.get(to.key) ?? to;
        const char =
            reveal < 0.52 ? pickByRatio(rainChars, hash01(`${to.key}:settle-char:${step}`, seed), to.char) : to.char;

        writeRuntimeCell(
            data,
            to.key,
            {
                char,
                color: mixColor(dimColor(to.color, 0.46), mixColor(from.color, to.color, reveal), reveal),
                bgColor: reveal > 0.72 ? to.bgColor : 'transparent'
            },
            2 + reveal + ((height - to.y) / Math.max(1, height)) * 0.05
        );
    }

    return cleanRuntimePriorities(data);
}

function runtimeTransitionDataForPair(
    fromFrame: MotionFrame,
    toFrame: MotionFrame,
    step: number,
    steps: number,
    width: number,
    height: number,
    pairIndex: number
): Record<string, MotionCell> {
    if (pairIndex === 0)
        return windRuntimeTransitionData(fromFrame, toFrame, step, steps, width, height, pairIndex + 1);
    if (pairIndex === 1)
        return matrixRuntimeTransitionData(fromFrame, toFrame, step, steps, width, height, pairIndex + 1);
    return particleRuntimeTransitionData(fromFrame, toFrame, step, steps, width, height, pairIndex + 1);
}

function renderRuntimeLogoData(
    data: Record<string, MotionCell> | undefined,
    width: number,
    height: number,
    displayWidth: number,
    displayHeight: number
): string {
    return renderMotionRows(scaledMotionRows(buildMotionRows({ data }, width, height), displayWidth, displayHeight));
}

function writeProgressCell(rows: Required<MotionCell>[][], x: number, y: number, cell: Required<MotionCell>): void {
    if (!cell.char.trim()) return;
    if (y < 0 || y >= rows.length || x < 0 || x >= (rows[0]?.length ?? 0)) return;
    rows[y][x] = cell;
}

function renderHorizontalProgressLogoData(
    data: Record<string, MotionCell> | undefined,
    width: number,
    height: number,
    displayWidth: number,
    displayHeight: number,
    fromProgress: number,
    toProgress: number,
    fallProgress: number
): string {
    const targetRows = scaledMotionRows(buildMotionRows({ data }, width, height), displayWidth, displayHeight);
    const rows = targetRows.map((row) =>
        row.map((cell) => ({
            char: cell.char,
            color: '#FFFFFF',
            bgColor: 'transparent'
        }))
    );
    const previousColumns = Math.floor(clamp(fromProgress) * displayWidth + 0.0001);
    const nextColumns = Math.floor(clamp(toProgress) * displayWidth + 0.0001);
    const settledColumns = Math.min(previousColumns, nextColumns);
    const finalColumns = Math.max(previousColumns, nextColumns);
    const t = smoothstep(fallProgress);
    const writeColoredProgressCell = (x: number, y: number, cell: Required<MotionCell>): void => {
        writeProgressCell(rows, x, y, {
            ...cell,
            bgColor: 'transparent'
        });
    };

    for (let y = 0; y < displayHeight; y++) {
        for (let x = 0; x < settledColumns; x++) {
            writeColoredProgressCell(x, y, targetRows[y][x]);
        }
    }

    if (fallProgress >= 1) {
        for (let y = 0; y < displayHeight; y++) {
            for (let x = settledColumns; x < finalColumns; x++) {
                writeColoredProgressCell(x, y, targetRows[y][x]);
            }
        }

        return renderMotionRows(rows);
    }

    const activeColumnCount = Math.max(1, finalColumns - settledColumns);

    for (let y = 0; y < displayHeight; y++) {
        for (let x = settledColumns; x < finalColumns; x++) {
            const cell = targetRows[y][x];
            if (!cell.char.trim()) continue;

            const columnOrder = x - settledColumns;
            const columnDelay = (columnOrder / activeColumnCount) * 0.32;
            const jitter = hash01(`${x},${y}`, 17) * 0.12;
            const local = clamp((t - columnDelay - jitter) / Math.max(0.18, 1 - columnDelay - jitter));
            if (local <= 0) continue;

            const eased = smoothstep(local);
            const startX = Math.min(
                displayWidth - 1,
                finalColumns + Math.round(displayWidth * (0.16 + hash01(`${x},${y}`, 23) * 0.12))
            );
            const verticalDrift = Math.round((hash01(`${x},${y}`, 31) - 0.5) * 2 * (1 - eased));
            const drawX = Math.max(x, Math.min(displayWidth - 1, Math.round(startX + (x - startX) * eased)));
            const drawY = Math.max(0, Math.min(displayHeight - 1, y + verticalDrift));

            writeColoredProgressCell(drawX, drawY, cell);
        }
    }

    return renderMotionRows(rows);
}

function loadRuntimeDeployLogoFrames(
    source: DeployLogoKeyframeFile,
    terminalColumns: number,
    terminalRows: number,
    maxLogoHeight?: number
): DeployLogoPlayback {
    const width = source.canvas?.width ?? 80;
    const height = source.canvas?.height ?? 24;
    const frameRate = source.runtime?.frameRate ?? 60;
    const transitionFrames = source.runtime?.transitionFrames ?? 60;
    const holdSeconds = deployLogoKeyframeHoldSeconds;
    const looping = source.runtime?.looping ?? true;
    const baseWidth = logoBaseDisplayWidth(source, width);
    const displayWidth = logoDisplayWidth(source, width, terminalColumns);
    const displayHeight = logoDisplayHeight(height, displayWidth, baseWidth, terminalRows, maxLogoHeight);
    const sourceFrames = (source.frames ?? []).slice(0, 3);

    if (sourceFrames.length < 3) {
        throw new Error('Deploy logo keyframe source must contain at least 3 frames.');
    }

    const transitionPairs = looping ? 3 : 2;
    const segmentFrames = transitionFrames + 1;
    const frameCount = transitionPairs * segmentFrames;
    const frameCache: Array<DeployLogoFrame | undefined> = [];

    return {
        height: displayHeight,
        looping,
        frameCount,
        frameAt(index) {
            const normalizedIndex = ((index % frameCount) + frameCount) % frameCount;
            const cached = frameCache[normalizedIndex];
            if (cached) return cached;

            const pairIndex = Math.floor(normalizedIndex / segmentFrames);
            const offset = normalizedIndex % segmentFrames;
            const fromIndex = pairIndex % sourceFrames.length;
            const toIndex = (pairIndex + 1) % sourceFrames.length;
            const fromFrame = sourceFrames[fromIndex];
            const toFrame = sourceFrames[toIndex];

            if (offset === 0) {
                const frame: DeployLogoFrame = {
                    duration: holdSeconds * 1000,
                    text: renderRuntimeLogoData(fromFrame.data, width, height, displayWidth, displayHeight)
                };
                frameCache[normalizedIndex] = frame;
                return frame;
            }

            const frame: DeployLogoFrame = {
                duration: 1000 / frameRate,
                text: renderRuntimeLogoData(
                    runtimeTransitionDataForPair(
                        fromFrame,
                        toFrame,
                        offset,
                        transitionFrames,
                        width,
                        height,
                        pairIndex
                    ),
                    width,
                    height,
                    displayWidth,
                    displayHeight
                )
            };
            frameCache[normalizedIndex] = frame;
            return frame;
        }
    };
}

async function resolveDeployHeaderLogoPath(): Promise<string | null> {
    return (await fs.pathExists(deployHeaderLogoPath)) ? deployHeaderLogoPath : null;
}

async function loadDeployLogoFrames(
    logoPath: string,
    terminalColumns: number,
    terminalRows: number,
    maxLogoHeight?: number
): Promise<DeployLogoPlayback> {
    const logoSource = await fs.readJson(logoPath);
    if (!isDeployLogoKeyframeFile(logoSource)) {
        throw new Error('部署头图必须使用 shiro-nya-cli-logo-keyframes 格式');
    }

    return loadRuntimeDeployLogoFrames(logoSource, terminalColumns, terminalRows, maxLogoHeight);
}

async function loadDeployProgressLogo(
    logoPath: string,
    terminalColumns: number,
    terminalRows: number,
    maxLogoHeight?: number
): Promise<DeployProgressLogo> {
    const source = await fs.readJson(logoPath);
    if (!isDeployLogoKeyframeFile(source)) {
        throw new Error('部署头图必须使用 shiro-nya-cli-logo-keyframes 格式');
    }

    const sourceFrame = source.frames?.[1];
    if (!sourceFrame) {
        throw new Error('部署头图没有可用于进度显示的第二帧');
    }

    const width = source.canvas?.width ?? 80;
    const height = source.canvas?.height ?? 24;
    const baseWidth = logoBaseDisplayWidth(source, width);
    const displayWidth = logoDisplayWidth(source, width, terminalColumns);
    const displayHeight = logoDisplayHeight(height, displayWidth, baseWidth, terminalRows, maxLogoHeight);

    return {
        height: displayHeight,
        textAt(fromProgress, toProgress, fallProgress) {
            return renderHorizontalProgressLogoData(
                sourceFrame.data,
                width,
                height,
                displayWidth,
                displayHeight,
                fromProgress,
                toProgress,
                fallProgress
            );
        }
    };
}

function startDeployLogoFramePrewarm(playback: DeployLogoPlayback, shouldStop: () => boolean): () => void {
    let index = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = (): void => {
        if (cancelled || shouldStop()) return;

        const startedAt = Date.now();
        while (index < playback.frameCount && Date.now() - startedAt < 10) {
            playback.frameAt(index);
            index++;
        }

        if (index < playback.frameCount && !cancelled && !shouldStop()) {
            timer = setTimeout(run, 0);
        }
    };

    timer = setTimeout(run, 0);

    return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
    };
}

function deployReservedLogoRows(state: DeployAppState): number {
    return state.showLogo ? state.logoHeight + deployLogoHeaderGapRows : 0;
}

function deployInkRows(state: DeployAppState, terminalRows = process.stdout.rows ?? 40): number {
    return Math.max(deployHeaderRows + 1, terminalRows - deployReservedLogoRows(state) - deployInkBottomSafeRows);
}

function deployContentRows(state: DeployAppState, terminalRows = process.stdout.rows ?? 40): number {
    return Math.max(1, deployInkRows(state, terminalRows) - deployHeaderRows);
}

function noopDeployHeaderLogoController(): DeployHeaderLogoController {
    return {
        getFlowTop() {
            return 1;
        },
        getFlowRows() {
            return Math.max(1, process.stdout.rows ?? 40);
        },
        setFlowInsetRows() {
            return undefined;
        },
        setHeaderStep() {
            return undefined;
        },
        setProgress() {
            return undefined;
        },
        startProgress() {
            return undefined;
        },
        stop() {
            return undefined;
        }
    };
}

export async function startDeployHeaderLogo(): Promise<DeployHeaderLogoController> {
    if (!process.stdout.isTTY || process.env.CI === 'true') return noopDeployHeaderLogoController();

    const logoPath = shouldShowLogo() ? await resolveDeployHeaderLogoPath() : null;
    let terminalRows = process.stdout.rows ?? 40;
    let terminalColumns = process.stdout.columns ?? 120;
    const inkStdout = createSafeInkStdout(
        process.stdout,
        () => terminalColumns,
        () => terminalRows
    );
    let logo: DeployLogoPlayback | undefined;
    let progressLogo: DeployProgressLogo | undefined;
    let frameIndex = 0;
    let progressFrom = 0;
    let progressTarget = 0;
    let progressStartedAt = 0;
    let mode: 'animation' | 'progress' = 'animation';
    let stopped = false;
    let renderTimer: ReturnType<typeof setTimeout> | undefined;
    let logoTimer: ReturnType<typeof setTimeout> | undefined;
    let logoGlitchTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let promptKey = 0;
    let currentLogoText = '';
    let renderedLogoLines: string[] = [];
    let cancelLogoPrewarm: () => void = () => undefined;
    const state: DeployAppState = {
        logoHeight: 0,
        showLogo: Boolean(logoPath)
    };

    const refreshTerminalSize = (): void => {
        terminalRows = process.stdout.rows ?? terminalRows;
        terminalColumns = process.stdout.columns ?? terminalColumns;
    };

    const logoRows = (): number => (state.showLogo ? state.logoHeight : 0);

    const inkTop = (): number => Math.min(terminalRows, deployReservedLogoRows(state) + 1);

    const writeInkRegion = (cursor: 'top' | 'bottom' = 'top'): void => {
        const cursorRow = cursor === 'bottom' ? terminalRows : inkTop();
        writeLogoOutput(`${scrollRegion(inkTop(), terminalRows)}${cursorTo(cursorRow, 1)}`);
    };

    const clearInkRegion = (): void => {
        let output = ansiSaveCursor;

        for (let row = inkTop(); row <= terminalRows; row++) {
            output += `${cursorTo(row, 1)}${ansiClearLine}`;
        }

        writeLogoOutput(`${output}${ansiRestoreCursor}`);
    };

    const renderLogoGlitchLine = (
        line: string,
        rowIndex: number,
        frameIndex: number
    ): { column: number; line: string } => {
        const frame = deployLogoGlitchFrames[frameIndex];
        if (!frame) return { column: 1, line };

        if (frame.blankModulo && (rowIndex + frameIndex) % frame.blankModulo === 0) {
            return { column: 1, line: '' };
        }

        const diagonalPhase = (rowIndex + frameIndex) % frame.diagonalModulo;
        const offset = diagonalPhase === 0 ? frame.diagonalOffset : Math.max(0, frame.diagonalOffset - 1);
        const column = Math.min(5, Math.max(1, 1 + offset));
        const safeWidth = Math.max(1, terminalColumns - column - 1);

        return { column, line: truncateVisibleTerminal(line, safeWidth) };
    };

    const drawLogoText = (text: string, glitchFrameIndex?: number): void => {
        currentLogoText = text;
        if (!state.showLogo || state.logoHeight <= 0) return;

        const lines = text.split('\n').slice(0, state.logoHeight);
        let output = ansiSaveCursor;
        let changed = false;

        for (let index = 0; index < state.logoHeight; index++) {
            const glitchFrame = glitchFrameIndex === undefined ? undefined : deployLogoGlitchFrames[glitchFrameIndex];
            const sourceIndex =
                glitchFrame === undefined
                    ? index
                    : Math.min(state.logoHeight - 1, Math.max(0, index + glitchFrame.verticalOffset));
            const renderedLine = renderDeployLogoLine(lines[sourceIndex] ?? '', terminalColumns);
            const glitchLine =
                glitchFrameIndex === undefined
                    ? { column: 1, line: renderedLine }
                    : renderLogoGlitchLine(renderedLine, index, glitchFrameIndex);
            const cacheKey = `${glitchLine.column}:${glitchLine.line}`;
            if (renderedLogoLines[index] === cacheKey) continue;
            renderedLogoLines[index] = cacheKey;
            changed = true;
            output += `${cursorTo(index + 1, 1)}${ansiClearLine}${cursorTo(index + 1, glitchLine.column)}${glitchLine.line}`;
        }

        if (renderedLogoLines.length > state.logoHeight) {
            renderedLogoLines.length = state.logoHeight;
        }

        if (changed) {
            output += `${ansiReset}${ansiRestoreCursor}`;
            writeLogoOutput(output);
        }
    };

    const redrawShell = (): void => {
        renderedLogoLines = [];
        writeLogoOutput(`${ansiReset}${resetScrollRegion()}${ansiClearScreen}${ansiHome}`);
        if (currentLogoText) {
            drawLogoText(currentLogoText);
        }
        if (state.showLogo) {
            for (let index = 0; index < deployLogoHeaderGapRows; index++) {
                writeLogoOutput(`${cursorTo(logoRows() + index + 1, 1)}${ansiClearLine}`);
            }
        }
        writeInkRegion();
    };

    const reloadLogo = async (): Promise<void> => {
        refreshTerminalSize();
        if (!logoPath) return;

        const rawLogo = await loadDeployLogoFrames(logoPath, deployHeaderInnerColumns(terminalColumns), terminalRows);
        const logoLines = Math.min(rawLogo.height, Math.max(1, terminalRows - 8 - deployLogoHeaderGapRows));

        logo = await loadDeployLogoFrames(logoPath, deployHeaderInnerColumns(terminalColumns), terminalRows, logoLines);
        cancelLogoPrewarm();
        const playback = logo;
        cancelLogoPrewarm = startDeployLogoFramePrewarm(playback, () => stopped || logo !== playback);
        progressLogo = await loadDeployProgressLogo(
            logoPath,
            deployHeaderInnerColumns(terminalColumns),
            terminalRows,
            logoLines
        );
        state.logoHeight = logo.height;
        state.showLogo = true;
    };

    await reloadLogo();
    if (logo) {
        currentLogoText = logo.frameAt(0).text;
    }

    const element = (): ReturnType<typeof createElement> =>
        createElement(DeployInkRoot, {
            columns: safeInkColumns(terminalColumns),
            rows: deployInkRows(state, terminalRows),
            state: cloneDeployAppState(state)
        });
    redrawShell();
    const instance: Instance = render(element(), {
        exitOnCtrlC: false,
        patchConsole: false,
        stdout: inkStdout
    });

    const rerenderNow = (cursor: 'top' | 'bottom' = 'top'): void => {
        if (stopped) return;
        if (renderTimer) {
            clearTimeout(renderTimer);
            renderTimer = undefined;
        }
        if (cursor === 'top') {
            clearInkRegion();
        }
        writeInkRegion(cursor);
        instance.rerender(element());
    };

    const scheduleRender = (delay = 32): void => {
        if (stopped || renderTimer) return;
        renderTimer = setTimeout(() => {
            renderTimer = undefined;
            rerenderNow(state.deploy ? 'bottom' : 'top');
        }, delay);
    };

    const progressFallAmount = (): number => {
        if (!progressStartedAt) return 1;
        return clamp((Date.now() - progressStartedAt) / progressFallDurationMs);
    };

    const renderProgressLogo = (fallAmount = progressFallAmount()): void => {
        if (!progressLogo) return;
        drawLogoText(progressLogo.textAt(progressFrom, progressTarget, fallAmount));
    };

    const scheduleLogoTick = (delay: number): void => {
        if (!logo || stopped) return;
        logoTimer = setTimeout(() => {
            void tickLogo();
        }, delay);
    };

    const tickLogo = async (): Promise<void> => {
        logoTimer = undefined;
        if (stopped || mode !== 'animation' || !logo) return;
        const frame = logo.frameAt(frameIndex);
        const frameStride = 1;
        const nextDelay = Math.max(deployManualLogoMinFrameMs, frame.duration);
        drawLogoText(frame.text);

        if (frameIndex + frameStride < logo.frameCount) {
            frameIndex += frameStride;
            scheduleLogoTick(nextDelay);
            return;
        }

        if (logo.looping) {
            frameIndex = 0;
            scheduleLogoTick(nextDelay);
        }
    };

    const startInitialLogoGlitch = (): void => {
        if (!logo || stopped || !state.showLogo) {
            if (logo) void tickLogo();
            return;
        }

        let glitchFrameIndex = 0;

        const tickGlitch = (): void => {
            logoGlitchTimer = undefined;

            if (stopped || mode !== 'animation') return;

            const glitchFrame = deployLogoGlitchFrames[glitchFrameIndex];
            if (!glitchFrame) {
                renderedLogoLines = [];
                drawLogoText(currentLogoText);
                void tickLogo();
                return;
            }

            drawLogoText(currentLogoText, glitchFrameIndex);
            glitchFrameIndex++;
            logoGlitchTimer = setTimeout(tickGlitch, glitchFrame.duration);
        };

        renderedLogoLines = [];
        drawLogoText(currentLogoText);
        logoGlitchTimer = setTimeout(tickGlitch, deployLogoInitialGlitchHoldMs);
    };

    const scheduleProgressTick = (delay = progressFallFrameMs): void => {
        if (stopped) return;
        logoTimer = setTimeout(() => {
            void progressTick();
        }, delay);
    };

    const progressTick = async (): Promise<void> => {
        logoTimer = undefined;
        if (stopped || mode !== 'progress') return;
        const fallAmount = progressFallAmount();
        renderProgressLogo(fallAmount);

        if (fallAmount < 1) {
            scheduleProgressTick();
            return;
        }

        progressFrom = progressTarget;
        progressStartedAt = 0;
    };

    const handleResize = (): void => {
        if (stopped) return;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            void (async () => {
                await reloadLogo();
                if (mode === 'progress') {
                    renderProgressLogo(progressFallAmount());
                } else if (logo) {
                    currentLogoText = logo.frameAt(frameIndex).text;
                }
                redrawShell();
                rerenderNow('top');
            })();
        }, 80);
    };

    const appendDeployLog = (text: string): void => {
        if (!state.deploy) return;
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const endedWithNewline = normalized.endsWith('\n');
        const parts = normalized.split('\n');
        const tail = endedWithNewline ? '' : (parts.pop() ?? '');

        if (endedWithNewline) {
            parts.pop();
        }

        for (const part of parts) {
            const line = `${state.deploy.pendingLogLine}${part}`;
            state.deploy.pendingLogLine = '';
            if (!line) continue;
            state.deploy.logs.push(line);
        }
        state.deploy.pendingLogLine += tail;
        if (state.deploy.logs.length > 240) {
            state.deploy.logs.splice(0, state.deploy.logs.length - 240);
        }
        scheduleRender(50);
    };

    const startDeployProgress = (steps: DeployStep[]): DeployProgressUiController => {
        state.prompt = undefined;
        state.deployCompleted = false;
        state.deploy = createDeployProgressState(steps);
        rerenderNow('top');

        return {
            writeLog(text) {
                appendDeployLog(text);
            },
            setProgress(currentStep, progress) {
                const step = state.deploy?.steps[currentStep];
                if (!step) return;
                step.progress = Math.min(1, Math.max(0, progress));
                scheduleRender(50);
            },
            startStep(currentStep) {
                const step = state.deploy?.steps[currentStep];
                if (!step) return;
                step.status = 'running';
                step.progress = Math.max(step.progress, 0.02);
                rerenderNow('bottom');
            },
            completeStep(currentStep, durationMs) {
                const step = state.deploy?.steps[currentStep];
                if (!step) return;
                step.status = 'done';
                step.progress = 1;
                step.durationMs = durationMs;
                rerenderNow('bottom');
            },
            failStep(currentStep, durationMs) {
                const step = state.deploy?.steps[currentStep];
                if (!step) return;
                step.status = 'failed';
                step.durationMs = durationMs;
                rerenderNow('bottom');
            },
            stop() {
                if (!state.deploy && !state.headerStep) return;
                state.deploy = undefined;
                state.headerStep = undefined;
                state.deployCompleted = true;
                rerenderNow('top');
            }
        };
    };

    const stop = (): void => {
        if (stopped) return;
        stopped = true;
        if (renderTimer) clearTimeout(renderTimer);
        if (logoTimer) clearTimeout(logoTimer);
        if (logoGlitchTimer) clearTimeout(logoGlitchTimer);
        if (resizeTimer) clearTimeout(resizeTimer);
        cancelLogoPrewarm();
        process.stdout.off('resize', handleResize);
        instance.clear();
        instance.unmount();
        writeLogoOutput(`${ansiReset}${resetScrollRegion()}${ansiClearScreen}${ansiHome}`);
    };

    process.stdout.on('resize', handleResize);
    if (logo) {
        startInitialLogoGlitch();
    }
    process.once('exit', stop);

    return {
        getFlowTop() {
            return deployReservedLogoRows(state) + deployHeaderRows + 1;
        },
        getFlowRows() {
            return deployContentRows(state, process.stdout.rows ?? terminalRows);
        },
        runPrompt(props) {
            return new Promise<string>((resolve, reject) => {
                state.prompt = {
                    ...props,
                    onResult(result) {
                        state.prompt = undefined;
                        rerenderNow('top');

                        if (!stopped && mode === 'animation' && logo && !logoTimer) {
                            scheduleLogoTick(deployManualLogoMinFrameMs);
                        }

                        if (result.type === 'submit') {
                            resolve(result.value);
                            return;
                        }

                        if (result.type === 'back') {
                            reject(new PromptBackRequested());
                            return;
                        }

                        reject(new PromptCancelled());
                    },
                    promptKey: ++promptKey
                };
                rerenderNow('top');
            });
        },
        setFlowInsetRows() {
            return undefined;
        },
        setHeaderStep(currentStep, totalSteps) {
            const safeTotal = Math.max(1, Math.floor(totalSteps));
            state.headerStep = {
                currentStep: Math.min(safeTotal, Math.max(1, Math.floor(currentStep))),
                totalSteps: safeTotal
            };
            scheduleRender();
        },
        setProgress(progress) {
            if (!progressLogo) return;
            const nextProgress = clamp(progress);
            if (mode !== 'progress') {
                mode = 'progress';
                if (logoTimer) {
                    clearTimeout(logoTimer);
                    logoTimer = undefined;
                }
            }
            if (logoTimer) {
                clearTimeout(logoTimer);
                logoTimer = undefined;
            }
            progressFrom = progressTarget;
            progressTarget = Math.max(progressFrom, nextProgress);
            progressStartedAt = Date.now();
            void progressTick();
        },
        startDeployProgress,
        startProgress() {
            if (!progressLogo) return;
            progressFrom = 0;
            progressTarget = 0;
            progressStartedAt = 0;
            mode = 'progress';
            if (logoTimer) {
                clearTimeout(logoTimer);
                logoTimer = undefined;
            }
            renderProgressLogo(1);
            rerenderNow('top');
        },
        stop() {
            stop();
            process.off('exit', stop);
        }
    };
}
