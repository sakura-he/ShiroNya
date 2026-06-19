import React from 'react';
import { Text, Box, useStdout } from 'ink';
import stringWidth from 'string-width';
import { darkTheme } from '../_core.js';
import type { InkUITheme } from '../_core.js';
import { Typewriter } from '../typewriter/index.js';

export type HeaderStyle = 'box' | 'line' | 'filled';

export interface HeaderProps {
    title: string;
    version?: string;
    subtitle?: string;
    style?: HeaderStyle;
    align?: 'left' | 'center';
    theme?: InkUITheme;
    typewriter?: boolean;
    typewriterSpeed?: number;
    width?: number;
}

export const Header: React.FC<HeaderProps> = ({
    title,
    version,
    subtitle,
    style = 'box',
    align = 'left',
    theme = darkTheme,
    typewriter = false,
    typewriterSpeed = 12,
    width
}) => {
    const { stdout } = useStdout();
    const w = Math.max(24, Math.floor(width ?? stdout?.columns ?? 80));
    const fullTitle = version ? `${title} v${version}` : title;
    const fit = (text: string, maxWidth: number): string => {
        let output = '';
        let used = 0;

        for (const char of text) {
            const charWidth = stringWidth(char);
            if (used + charWidth > maxWidth) break;
            output += char;
            used += charWidth;
        }

        return output;
    };
    const padEnd = (text: string, targetWidth: number): string =>
        `${text}${' '.repeat(Math.max(0, targetWidth - stringWidth(text)))}`;
    const renderTitle = (text: string): React.ReactNode =>
        typewriter ? (
            <Box
                flexShrink={0}
                width={Math.max(1, stringWidth(text))}
            >
                <Typewriter
                    cursor
                    cursorChar="▌"
                    speed={typewriterSpeed}
                    text={text}
                    theme={theme}
                />
            </Box>
        ) : (
            <Text color={theme.colors.text}>{text}</Text>
        );

    if (style === 'box') {
        // ┌─── MyApp v1.0 ──────────────────┐
        const inner = w - 2; // exclude ┌ and ┐
        const titleText = fit(fullTitle, Math.max(0, inner - 5));
        const labelWidth = stringWidth(titleText) + 2;
        const left = align === 'center' ? Math.max(0, Math.floor((inner - labelWidth) / 2)) : 3;
        const right = Math.max(0, inner - left - labelWidth);
        const bot = '└' + '─'.repeat(inner) + '┘';
        const subtitleWidth = Math.max(0, inner - 2);
        const subtitleText = subtitle ? padEnd(fit(subtitle, subtitleWidth), subtitleWidth) : '';

        return (
            <Box flexDirection="column">
                <Box>
                    <Text color={theme.colors.primary}>{`┌${'─'.repeat(left)} `}</Text>
                    {renderTitle(titleText)}
                    <Text color={theme.colors.primary}>{` ${'─'.repeat(right)}┐`}</Text>
                </Box>
                {subtitle && (
                    <Text color={theme.colors.primary}>
                        {'│'} <Text color={theme.colors.muted}>{subtitleText}</Text> {'│'}
                    </Text>
                )}
                <Text color={theme.colors.primary}>{bot}</Text>
            </Box>
        );
    }

    if (style === 'line') {
        // ══ MyApp v1.0 ════════════════════
        const pre = '══';
        const titleText = fit(fullTitle, Math.max(0, w - stringWidth(pre) - 2));
        const remaining = Math.max(0, w - stringWidth(pre) - stringWidth(titleText) - 2);

        return (
            <Box flexDirection="column">
                <Box>
                    <Text color={theme.colors.primary}>{`${pre} `}</Text>
                    {renderTitle(titleText)}
                    <Text color={theme.colors.primary}>{` ${'═'.repeat(remaining)}`}</Text>
                </Box>
                {subtitle && <Text color={theme.colors.muted}> {subtitle}</Text>}
            </Box>
        );
    }

    // filled: ███ MyApp v1.0 ████████████
    const pre = '██ ';
    const titleText = fit(fullTitle, Math.max(0, w - stringWidth(pre) - 2));
    const remaining = Math.max(0, w - stringWidth(pre) - stringWidth(titleText) - 2);

    return (
        <Box flexDirection="column">
            <Box>
                <Text color={theme.colors.primary}>{`${pre} `}</Text>
                {renderTitle(titleText)}
                <Text color={theme.colors.primary}>{` ${'█'.repeat(remaining)}`}</Text>
            </Box>
            {subtitle && <Text color={theme.colors.muted}> {subtitle}</Text>}
        </Box>
    );
};
