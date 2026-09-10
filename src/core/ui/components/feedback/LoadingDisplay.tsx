import { Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
import React from 'react';

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
}

/**
 * Reusable loading display component that provides consistent loading states
 * across all webviews with support for main and sub-messages.
 *
 * THE THREE-ROW CONTRACT (settled with the user, 2026-08-22 loading audit):
 * - `message` (row 1): what the step is doing — and the COUNT, when there is
 *   one ("Copying content (10/61)"). Counts live here, not below.
 * - `subMessage` (row 2): the moving detail — the thing being counted (a file
 *   path, a repo, a site). Fill it whenever a truthful value exists; the row
 *   reserves its space when empty so the title never jumps.
 * - `helperText` (row 3): a STATIC expectation — how long this usually takes,
 *   or what it is waiting on. Never a phase description; that is row 1's job,
 *   and a description here reads as a second, slower status.
 */
export function LoadingDisplay({
    size = 'L',
    message,
    subMessage,
    helperText,
    progress,
    className,
}: LoadingDisplayProps) {
    // Center display for large size, left-align for smaller sizes
    const shouldCenter = size === 'L';
    const hasDeterminateProgress = progress !== undefined && progress >= 0;

    // Text size and color classes based on progress circle size
    const textSizeMap = { L: 'text-lg', M: 'text-base', S: '' };
    const mainTextClass = `${textSizeMap[size]} font-medium`.trim();
    const subTextClass = 'text-sm text-gray-600';
    const helperTextClass = 'text-xs text-gray-500 italic';

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
                <Text UNSAFE_className={mainTextClass}>{message}</Text>
            </Flex>
        );
    }

    // For larger sizes or when sub-message exists, use vertical layout
    return (
        <div role="status" aria-live="polite" aria-atomic="true">
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
                >
                    <Text UNSAFE_className={mainTextClass}>{message}</Text>
                    {/* Always render sub-message row to prevent layout shift */}
                    <Text UNSAFE_className={subTextClass} minHeight="size-200">
                        {subMessage || '\u00A0'}
                    </Text>
                    {helperText && (
                        <Text UNSAFE_className={helperTextClass} marginTop="size-100">
                            {helperText}
                        </Text>
                    )}
                </Flex>
            </Flex>
        </div>
    );
}
