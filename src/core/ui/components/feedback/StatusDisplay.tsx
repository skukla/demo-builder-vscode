/**
 * StatusDisplay - Reusable status display component
 *
 * Renders a centered status display with icon, title, message, and optional actions.
 * Used for error states, success states, and other status messages.
 *
 * @example
 * ```tsx
 * // Using default variant icon
 * <StatusDisplay
 *   variant="error"
 *   title="Authentication Failed"
 *   message={errorMessage}
 *   actions={[
 *     { label: 'Retry', variant: 'accent', onPress: handleRetry },
 *   ]}
 * />
 *
 * // Using custom icon and button icons
 * <StatusDisplay
 *   variant="info"
 *   icon={<Key size="L" UNSAFE_className="text-gray-500" />}
 *   title="Sign in to Adobe"
 *   message="Connect your Adobe account"
 *   actions={[
 *     { label: 'Sign In', icon: <Login size="S" />, variant: 'accent', onPress: handleLogin },
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

export interface StatusAction {
    /** Button label text */
    label: string;
    /** Optional icon to display before the label */
    icon?: React.ReactNode;
    /** Button variant */
    variant?: 'accent' | 'primary' | 'secondary' | 'negative';
    /** Click handler */
    onPress: () => void;
}

export interface StatusDisplayProps {
    /** Visual variant determining icon and color */
    variant: StatusVariant;
    /** Custom icon to override the default variant icon */
    icon?: React.ReactNode;
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
    /** Center the message text (default: false) */
    centerMessage?: boolean;
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
    icon: customIcon,
    title,
    message,
    details,
    actions,
    children,
    height = '350px',
    maxWidth = '600px',
    centerMessage = false,
}: StatusDisplayProps) {
    const { icon: defaultIcon } = variantConfig[variant];
    const displayIcon = customIcon ?? defaultIcon;

    const messageClassName = centerMessage
        ? 'text-sm text-gray-600 text-center'
        : 'text-sm text-gray-600';

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
                    {displayIcon}

                    <Flex direction="column" gap="size-100" alignItems="center">
                        <Text UNSAFE_className="text-xl font-medium">{title}</Text>
                        {message && (
                            <Text UNSAFE_className={messageClassName}>{message}</Text>
                        )}
                        {details?.map((detail, index) => (
                            <Text key={index} UNSAFE_className={messageClassName}>
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
                                    {action.icon && (
                                        <span style={{ marginRight: '8px', display: 'inline-flex', alignItems: 'center' }}>
                                            {action.icon}
                                        </span>
                                    )}
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
