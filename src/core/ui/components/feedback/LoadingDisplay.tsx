import { Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface LoadingDisplayProps {
    /** Size of the progress circle */
    size?: 'S' | 'M' | 'L';
    /** Main loading message */
    message: string;
    /** Optional sub-message for additional context (dynamic, can change during operation) */
    subMessage?: string;
    /** Optional static helper text (e.g., time expectations) - stays visible */
    helperText?: string;
    /** Optional progress percentage (0-100). When provided, shows determinate progress circle */
    progress?: number;
    /** Additional CSS class for the container */
    className?: string;
    /**
     * Hold each of the three rows to exactly one line, so nothing moves as the
     * lines change: text that does not fit ends in an ellipsis (the full text is
     * on hover), and row 3 is always there, empty or not. For progress displays,
     * whose lines change every few seconds.
     */
    steady?: boolean;
}

/**
 * A row's text. Steady, it carries its full text as a hover title, on a plain span
 * because Spectrum's `Text` drops a `title` prop. Otherwise just the text.
 */
function rowText(text: string, steady: boolean): React.ReactNode {
    return steady ? <span title={text}>{text}</span> : text;
}

/**
 * Reusable loading display component that provides consistent loading states
 * across all webviews with support for main and sub-messages.
 *
 * THE THREE-ROW CONTRACT (progress vocabulary, owner 2026-10-16; the handbook's
 * progress convention, `stageLine.ts`):
 * - `message` (row 1): the stage — what the run is doing, with its place in the
 *   run when the steps are known ("Copying the content (4 of 9)"). Never a count
 *   of items.
 * - `subMessage` (row 2): what the stage is doing now, and the COUNT when there is
 *   one ("40 of 103 files"). Counts live here, not on row 1. It reads as a phrase
 *   on its own, because the stage's name is not repeated in front of it. The row
 *   reserves its space when empty so the title never jumps.
 * - `helperText` (row 3): a STATIC expectation — how long this usually takes,
 *   or what it is waiting on — with the run's clock. Never a phase description;
 *   that is row 1's job, and a description here reads as a second, slower status.
 *
 * `steady` holds all three rows to one line each, and row 3 to its height when
 * empty, so a long or missing line cannot move the spinner: the display is centred
 * vertically, so ANY change in its height moves everything in it. Each row then ends
 * in an ellipsis rather than wrapping (`.loading-display-row`), with the full text on
 * hover, and the display is bounded to its container's width (`w-full`) so a
 * centred parent cannot size it to its longest line instead. The ellipsis is a
 * backstop for names we do not write (a repository, an ERP, a project): the lines we
 * write are short by design (line 1 and line 3's expectation 25 characters, line 2 40;
 * the handbook's progress convention).
 */
export function LoadingDisplay({
    size = 'L',
    message,
    subMessage,
    helperText,
    progress,
    className,
    steady = false,
}: LoadingDisplayProps) {
    // Center display for large size, left-align for smaller sizes
    const shouldCenter = size === 'L';
    const hasDeterminateProgress = progress !== undefined && progress >= 0;

    // Text size by circle size. Written as literals AT each use below rather
    // than assigned here: a className the bundle scan cannot read is a class it
    // cannot check a stylesheet for (ADR-017 §6).
    const textSizeClass = { L: 'text-lg', M: 'text-base', S: '' }[size];

    // Container props based on centering
    const containerProps = shouldCenter
        ? {
              alignItems: 'center' as const,
              justifyContent: 'center' as const,
              height: '100%',
          }
        : {
              alignItems: 'center' as const,
          };

    // For small size with no sub-message, use horizontal layout
    if (size === 'S' && !subMessage) {
        return (
            <Flex gap="size-200" alignItems="center" UNSAFE_className={className}>
                <ProgressCircle size={size} isIndeterminate={true} aria-label={message} />
                <Text UNSAFE_className={cn(textSizeClass, 'font-medium')}>{message}</Text>
            </Flex>
        );
    }

    // For larger sizes or when sub-message exists, use vertical layout
    return (
        <div role="status" aria-live="polite" aria-atomic="true" className={steady ? 'w-full' : undefined}>
            <Flex
                direction="column"
                gap="size-200"
                {...containerProps}
                UNSAFE_className={className}
            >
                <ProgressCircle
                    size={size}
                    value={hasDeterminateProgress ? progress : undefined}
                    isIndeterminate={!hasDeterminateProgress}
                    aria-label={message}
                />
                <Flex
                    direction="column"
                    gap="size-50"
                    alignItems={shouldCenter ? 'center' : 'start'}
                    UNSAFE_className={steady ? 'w-full' : undefined}
                >
                    <Text UNSAFE_className={cn(textSizeClass, 'font-medium', steady && 'loading-display-row')}>
                        {rowText(message, steady)}
                    </Text>
                    {/* Always render sub-message row to prevent layout shift */}
                    <Text
                        UNSAFE_className={cn('text-sm', 'text-gray-600', steady && 'loading-display-row')}
                        minHeight="size-200"
                    >
                        {subMessage ? rowText(subMessage, steady) : '\u00A0'}
                    </Text>
                    {(helperText || steady) && (
                        <Text
                            // No 'italic': that class is defined in no
                            // stylesheet, so this line has never rendered
                            // italic. Asking for it again would be a look
                            // nobody has reviewed — found when the class came
                            // out of a variable and the bundle scan could read
                            // it (2026-09-19).
                            UNSAFE_className={cn('text-xs', 'text-gray-500', steady && 'loading-display-row')}
                            marginTop="size-100"
                        >
                            {helperText ? rowText(helperText, steady) : '\u00A0'}
                        </Text>
                    )}
                </Flex>
            </Flex>
        </div>
    );
}
