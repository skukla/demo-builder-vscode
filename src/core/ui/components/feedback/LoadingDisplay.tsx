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
 * across all webviews with support for main and sub-messages
 */
export const LoadingDisplay: React.FC<LoadingDisplayProps> = ({
    size = 'L',
    message,
    subMessage,
    helperText,
    progress,
    className,
}) => {
    // Center display for large size, left-align for smaller sizes
    const shouldCenter = size === 'L';
    const hasDeterminateProgress = progress !== undefined && progress >= 0;

    // Text size and color classes based on progress circle size
    const textSizeMap = { L: 'text-lg', M: 'text-base', S: '' };
    const mainTextClass = `${textSizeMap[size]} font-medium`.trim();
    const subTextClass = 'text-sm text-gray-600';
    const helperTextClass = 'text-xs text-gray-500 italic';

    // Container props based on centering
    const containerProps = shouldCenter ? {
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        height: '100%',
    } : {
        alignItems: 'center' as const,
    };

    // For small size with no sub-message, use horizontal layout
    if (size === 'S' && !subMessage) {
        return (
            <Flex gap="size-200" alignItems="center" UNSAFE_className={className}>
                <ProgressCircle
                    size={size}
                    isIndeterminate={true}
                    aria-label={message}
                />
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
            <Flex direction="column" gap="size-50" alignItems={shouldCenter ? 'center' : 'start'}>
                <Text UNSAFE_className={mainTextClass}>
                    {message}
                </Text>
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
};