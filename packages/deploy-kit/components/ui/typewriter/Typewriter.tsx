import { Text } from 'ink';
import React, { useEffect, useRef, useState } from 'react';

import { darkTheme } from '../_core.js';
import type { InkUITheme } from '../_core.js';

export interface TypewriterProps {
    text: string;
    speed?: number;
    delay?: number;
    cursor?: boolean;
    cursorChar?: string;
    onComplete?: () => void;
    playing?: boolean;
    step?: number;
    theme?: InkUITheme;
}

export const Typewriter: React.FC<TypewriterProps> = ({
    text,
    speed = 30,
    delay = 0,
    cursor = true,
    cursorChar = '▌',
    onComplete,
    playing = true,
    step = 1,
    theme = darkTheme
}) => {
    const [visibleLength, setVisibleLength] = useState(playing ? 0 : text.length);
    const [started, setStarted] = useState(delay === 0 && playing);
    const prevText = useRef(text);
    const completedRef = useRef(false);

    useEffect(() => {
        if (!playing) {
            setVisibleLength(text.length);
            return;
        }

        if (prevText.current !== text) {
            prevText.current = text;
            setVisibleLength(0);
            setStarted(delay === 0);
            completedRef.current = false;
        }
    }, [delay, playing, text]);

    useEffect(() => {
        if (!playing || started) return;
        if (delay === 0) {
            setStarted(true);
            return;
        }

        const timer = setTimeout(() => setStarted(true), delay);
        return () => clearTimeout(timer);
    }, [delay, playing, started]);

    useEffect(() => {
        if (!started || !playing) return;
        if (visibleLength >= text.length) {
            if (!completedRef.current) {
                completedRef.current = true;
                onComplete?.();
            }
            return;
        }

        const interval = Math.max(16, Math.round(1000 / Math.max(1, speed)));
        const safeStep = Math.max(1, Math.floor(step));
        const timer = setTimeout(() => {
            setVisibleLength((prev) => Math.min(text.length, prev + safeStep));
        }, interval);

        return () => clearTimeout(timer);
    }, [onComplete, playing, speed, started, step, text.length, visibleLength]);

    const done = visibleLength >= text.length;

    return (
        <Text color={theme.colors.text}>
            {text.slice(0, visibleLength)}
            {cursor && !done ? <Text color={theme.colors.primary}>{cursorChar}</Text> : ''}
        </Text>
    );
};
