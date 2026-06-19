import React, { useEffect, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { darkTheme } from '../_core.js';
import type { InkUITheme } from '../_core.js';

export interface TextInputProps {
    /** Controlled value */
    value: string;
    /** Called on every keystroke with the new value */
    onChange: (value: string) => void;
    /** Called when Enter is pressed */
    onSubmit?: (value: string) => void;
    /** Shown when value is empty */
    placeholder?: string;
    /** Mask input characters as * */
    password?: boolean;
    /** Whether this input captures keyboard input */
    focus?: boolean;
    /** Optional label rendered to the left */
    label?: string;
    /** Theme override — defaults to darkTheme */
    theme?: InkUITheme;
}

// ─── shared display ──────────────────────────────────────────────────────────

interface DisplayProps {
    value: string;
    placeholder: string;
    password: boolean;
    isFocused: boolean;
    cursor: number;
    theme: InkUITheme;
}

const InputDisplay: React.FC<DisplayProps> = ({ value, placeholder, password, isFocused, cursor, theme }) => {
    const valueChars = [...value];
    const displayChars = password ? valueChars.map(() => '*') : valueChars;
    const display = displayChars.join('');
    const isEmpty = valueChars.length === 0;
    const safeCursor = Math.min(Math.max(0, cursor), displayChars.length);

    const cursorBlock = (char: string) => (
        <Text
            key="cursor"
            color={theme.colors.focus}
            inverse
        >
            {char}
        </Text>
    );

    if (!isFocused) {
        return isEmpty ? <Text color={theme.colors.muted}>{placeholder}</Text> : <Text>{display}</Text>;
    }

    if (isEmpty) {
        return (
            <Box>
                {cursorBlock(' ')}
                {placeholder.length > 0 ? (
                    <Text
                        key="placeholder"
                        color={theme.colors.muted}
                    >
                        {placeholder}
                    </Text>
                ) : null}
            </Box>
        );
    }

    const before = displayChars.slice(0, safeCursor).join('');
    const after = displayChars.slice(safeCursor).join('');

    return (
        <Box>
            {before ? <Text key="before">{before}</Text> : null}
            {cursorBlock(' ')}
            {after ? <Text key="after">{after}</Text> : null}
        </Box>
    );
};

// ─── focused inner (mounts only when raw mode is available) ──────────────────

interface FocusedInputProps extends TextInputProps {
    theme: InkUITheme;
}

const FocusedInput: React.FC<FocusedInputProps> = ({
    value,
    onChange,
    onSubmit,
    placeholder = '',
    password = false,
    theme
}) => {
    const [cursor, setCursor] = useState([...value].length);

    useEffect(() => {
        setCursor((current) => Math.min(current, [...value].length));
    }, [value]);

    useInput((input, key) => {
        if (key.ctrl && input === 'c') {
            return;
        }

        const valueChars = [...value];

        if (key.leftArrow) {
            setCursor((c) => Math.max(0, c - 1));
            return;
        }
        if (key.rightArrow) {
            setCursor((c) => Math.min(valueChars.length, c + 1));
            return;
        }

        if (key.backspace || key.delete) {
            if (cursor === 0) return;
            valueChars.splice(cursor - 1, 1);
            onChange(valueChars.join(''));
            setCursor((c) => c - 1);
            return;
        }

        if (key.return) {
            onSubmit?.(value);
            return;
        }
        if (key.ctrl || key.meta || key.escape) return;

        const inputChars = [...input];
        valueChars.splice(cursor, 0, ...inputChars);
        onChange(valueChars.join(''));
        setCursor((c) => c + inputChars.length);
    });

    return (
        <InputDisplay
            value={value}
            placeholder={placeholder}
            password={password}
            isFocused
            cursor={cursor}
            theme={theme}
        />
    );
};

// ─── public component ─────────────────────────────────────────────────────────

export const TextInput: React.FC<TextInputProps> = ({
    value,
    onChange,
    onSubmit,
    placeholder = '',
    password = false,
    focus = true,
    label,
    theme = darkTheme
}) => {
    const { isRawModeSupported } = useStdin();
    const canFocus = focus && isRawModeSupported;

    return (
        <Box>
            {label ? <Text color={theme.colors.muted}>{label} </Text> : null}
            <Text color={theme.colors.border}>{'❯ '}</Text>
            {canFocus ? (
                <FocusedInput
                    value={value}
                    onChange={onChange}
                    onSubmit={onSubmit}
                    placeholder={placeholder}
                    password={password}
                    focus={focus}
                    theme={theme}
                />
            ) : (
                <InputDisplay
                    value={value}
                    placeholder={placeholder}
                    password={password}
                    isFocused={false}
                    cursor={[...value].length}
                    theme={theme}
                />
            )}
        </Box>
    );
};
