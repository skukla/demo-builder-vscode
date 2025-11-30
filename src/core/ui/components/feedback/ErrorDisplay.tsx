import React from 'react';
import { Flex, Text, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import Refresh from '@spectrum-icons/workflow/Refresh';

export interface ErrorDisplayProps {
    /** Error title */
    title?: string;
    /** Error message */
    message: string;
    /** Optional retry handler */
    onRetry?: () => void;
    /** Retry button label (default: "Try Again") */
    retryLabel?: string;
    /** Icon size */
    iconSize?: 'S' | 'M' | 'L' | 'XL';
    /** Whether to center the display (default: true) */
    centered?: boolean;
    /** Maximum width of error text */
    maxWidth?: string;
    /** Error severity (affects icon color) */
    severity?: 'error' | 'warning';
}

/**
 * Molecular Component: ErrorDisplay
 *
 * Displays an error message with optional retry functionality.
 * Provides consistent error UI across all webviews.
 *
 * @example
 * ```tsx
 * <ErrorDisplay
 *   title="Error Loading Projects"
 *   message="Failed to fetch projects from Adobe I/O"
 *   onRetry={loadProjects}
 * />
 * ```
 */
export const ErrorDisplay = React.memo<ErrorDisplayProps>(({
    title = 'Error',
    message,
    onRetry,
    retryLabel = 'Try Again',
    iconSize = 'L',
    centered = true,
    maxWidth = '450px',
    severity = 'error'
}) => {
    const iconColor = severity === 'error' ? 'text-red-600' : 'text-yellow-600';

    const content = (
        <Flex direction="column" gap="size-200" alignItems="center">
            <AlertCircle UNSAFE_className={iconColor} size={iconSize} />
            <Flex direction="column" gap="size-100" alignItems="center">
                <Text UNSAFE_className="text-xl font-medium">
                    {title}
                </Text>
                <Text
                    UNSAFE_className="text-sm text-gray-600 text-center"
                    UNSAFE_style={{ maxWidth }}
                >
                    {message}
                </Text>
            </Flex>
            {onRetry && (
                <Button variant="accent" onPress={onRetry} marginTop="size-300">
                    <Refresh size="S" marginEnd="size-100" />
                    {retryLabel}
                </Button>
            )}
        </Flex>
    );

    if (centered) {
        return (
            <Flex
                direction="column"
                justifyContent="center"
                alignItems="center"
                height="350px"
            >
                {content}
            </Flex>
        );
    }

    return content;
});
