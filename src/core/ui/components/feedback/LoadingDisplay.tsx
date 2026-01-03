import React from 'react';
import { Flex, ProgressCircle, Text } from '@/core/ui/components/aria';

export interface LoadingDisplayProps {
    /** Size of the progress circle */
    size?: 'S' | 'M' | 'L';
    /** Main loading message */
    message: string;
    /** Optional sub-message for additional context (dynamic, can change during operation) */
    subMessage?: string;
    /** Optional static helper text (e.g., time expectations) - stays visible */
    helperText?: string;
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
    className,
}) => {
    // Center display for large size, left-align for smaller sizes
    const shouldCenter = size === 'L';

    // Text size and color classes based on progress circle size
    const textSizeMap = { L: 'text-lg', M: 'text-base', S: '' };
    const mainTextClass = `${textSizeMap[size]} font-medium`.trim();
    const subTextClass = 'text-sm text-gray-600';
    const helperTextClass = 'text-xs text-gray-500 italic';
    
    // Container props based on centering
    const containerProps = shouldCenter ? {
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        style: { height: '100%' },
    } : {
        alignItems: 'center' as const,
    };
    
    // For small size with no sub-message, use horizontal layout
    if (size === 'S' && !subMessage) {
        return (
            <Flex gap="size-200" alignItems="center" className={className}>
                <ProgressCircle
                    size={size}
                    isIndeterminate
                    aria-label={message}
                />
                <Text className={mainTextClass}>{message}</Text>
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
            className={className}
        >
            <ProgressCircle
                size={size}
                isIndeterminate
                aria-label={message}
            />
            <Flex direction="column" gap="size-50" alignItems={shouldCenter ? 'center' : 'start'}>
                <Text className={mainTextClass}>
                    {message}
                </Text>
                {subMessage && (
                    <Text className={subTextClass}>
                        {subMessage}
                    </Text>
                )}
                {helperText && (
                    <Text className={`${helperTextClass} mt-100`}>
                        {helperText}
                    </Text>
                )}
            </Flex>
        </Flex>
        </div>
    );
};