/**
 * StatusDisplay - Reusable status display component
 *
 * Renders a centered status display with icon, title, message, and optional actions.
 * Used for error states, success states, and other status messages.
 *
 * @example
 * ```tsx
 * <StatusDisplay
 *   variant="error"
 *   title="Authentication Failed"
 *   message={errorMessage}
 *   actions={[
 *     { label: 'Retry', variant: 'accent', onPress: handleRetry },
 *     { label: 'Back', variant: 'secondary', onPress: handleBack },
 *   ]}
 * />
 * ```
 */
import React from 'react';
import { Flex, Text, Button } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import { FadeTransition } from '@/core/ui/components/ui/FadeTransition';

export type StatusVariant = 'error' | 'success' | 'warning' | 'info' | 'pending';

interface StatusAction {
    label: string;
    variant?: 'accent' | 'primary' | 'secondary' | 'negative';
    onPress: () => void;
}

export interface StatusDisplayProps {
    /** Visual variant determining icon and color */
    variant: StatusVariant;
    /** Main title text */
    title: string;
    /** Description or error message */
    message?: string;
    /** Additional detail lines */
    details?: string[];
    /** Action buttons */
    actions?: StatusAction[];
    /** Optional additional content between message and actions */
    children?: React.ReactNode;
    /** Height of the container (default: 350px) */
    height?: string;
    /** Max width of the content (default: 600px) */
    maxWidth?: string;
}

const variantConfig: Record<StatusVariant, { icon: React.ReactNode; colorClass: string }> = {
    error: {
        icon: <AlertCircle size="L" UNSAFE_className="text-red-600" />,
        colorClass: 'text-red-600',
    },
    success: {
        icon: <CheckmarkCircle size="L" UNSAFE_className="text-green-600" />,
        colorClass: 'text-green-600',
    },
    warning: {
        icon: <AlertCircle size="L" UNSAFE_className="text-orange-600" />,
        colorClass: 'text-orange-600',
    },
    info: {
        icon: <InfoOutline size="L" UNSAFE_className="text-blue-600" />,
        colorClass: 'text-blue-600',
    },
    pending: {
        icon: <Clock size="L" UNSAFE_className="text-blue-600" />,
        colorClass: 'text-blue-600',
    },
};

export function StatusDisplay({
    variant,
    title,
    message,
    details,
    actions,
    children,
    height = '350px',
    maxWidth = '600px',
}: StatusDisplayProps) {
    const { icon } = variantConfig[variant];

    return (
        <FadeTransition show={true}>
            <Flex
                direction="column"
                justifyContent="center"
                alignItems="center"
                UNSAFE_style={{ height }}
            >
                <Flex
                    direction="column"
                    gap="size-200"
                    alignItems="center"
                    UNSAFE_style={{ maxWidth }}
                >
                    {icon}

                    <Flex direction="column" gap="size-100" alignItems="center">
                        <Text UNSAFE_className="text-xl font-medium">{title}</Text>
                        {message && (
                            <Text UNSAFE_className="text-sm text-gray-600">{message}</Text>
                        )}
                        {details?.map((detail, index) => (
                            <Text key={index} UNSAFE_className="text-sm text-gray-600">
                                {detail}
                            </Text>
                        ))}
                    </Flex>

                    {children}

                    {actions && actions.length > 0 && (
                        <Flex gap="size-150" marginTop="size-300">
                            {actions.map((action, index) => (
                                <Button
                                    key={index}
                                    variant={action.variant || 'secondary'}
                                    onPress={action.onPress}
                                >
                                    {action.label}
                                </Button>
                            ))}
                        </Flex>
                    )}
                </Flex>
            </Flex>
        </FadeTransition>
    );
}
