import React from 'react';
import { Flex, ProgressCircle, Text } from '@adobe/react-spectrum';
import { FadeTransition } from './FadeTransition';

export interface LoadingDisplayProps {
    /** Size of the progress circle */
    size?: 'S' | 'M' | 'L';
    /** Main loading message */
    message: string;
    /** Optional sub-message for additional context (dynamic, can change during operation) */
    subMessage?: string;
    /** Optional static helper text (e.g., time expectations) - stays visible */
    helperText?: string;
    /** Whether the progress is indeterminate (default: true) */
    isIndeterminate?: boolean;
    /** Progress value for determinate progress (0-100) */
    progress?: number;
    /** Whether to center the display (default: true for size L, false otherwise) */
    centered?: boolean;
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
    isIndeterminate = true,
    progress,
    centered,
    className
}) => {
    // Default centering based on size if not explicitly set
    const shouldCenter = centered !== undefined ? centered : size === 'L';
    
    // Text size and color classes based on progress circle size
    const mainTextClass = size === 'L' ? 'text-lg font-medium' : size === 'M' ? 'text-base font-medium' : 'font-medium';
    const subTextClass = 'text-sm text-gray-600';
    const helperTextClass = 'text-xs text-gray-500 italic';
    
    // Container props based on centering
    const containerProps = shouldCenter ? {
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        height: '100%'
    } : {
        alignItems: 'center' as const
    };
    
    // For small size with no sub-message, use horizontal layout
    if (size === 'S' && !subMessage) {
        return (
            <Flex gap="size-200" alignItems="center" UNSAFE_className={className}>
                <ProgressCircle 
                    size={size} 
                    isIndeterminate={isIndeterminate}
                    value={!isIndeterminate ? progress : undefined}
                />
                <Text UNSAFE_className={mainTextClass}>{message}</Text>
            </Flex>
        );
    }
    
    // For larger sizes or when sub-message exists, use vertical layout
    return (
        <Flex 
            direction="column" 
            gap="size-200" 
            {...containerProps}
            UNSAFE_className={className}
        >
            <ProgressCircle 
                size={size} 
                isIndeterminate={isIndeterminate}
                value={!isIndeterminate ? progress : undefined}
            />
            <Flex direction="column" gap="size-50" alignItems={shouldCenter ? 'center' : 'flex-start'}>
                <FadeTransition show={true} duration={150} key={message}>
                    <Text UNSAFE_className={mainTextClass}>
                        {message}
                    </Text>
                </FadeTransition>
                {subMessage && (
                    <FadeTransition show={true} duration={150} key={subMessage}>
                        <Text UNSAFE_className={subTextClass}>
                            {subMessage}
                        </Text>
                    </FadeTransition>
                )}
                {helperText && (
                    <Text UNSAFE_className={helperTextClass} marginTop="size-100">
                        {helperText}
                    </Text>
                )}
            </Flex>
        </Flex>
    );
};

// Export convenience presets for common use cases
export const LoadingDisplayPresets = {
    /** Standard full-page loading */
    fullPage: (message: string, subMessage?: string) => (
        <LoadingDisplay size="L" message={message} subMessage={subMessage} centered />
    ),
    
    /** Inline loading for smaller areas */
    inline: (message: string) => (
        <LoadingDisplay size="S" message={message} centered={false} />
    ),
    
    /** Section loading with medium prominence */
    section: (message: string, subMessage?: string) => (
        <LoadingDisplay size="M" message={message} subMessage={subMessage} />
    )
};