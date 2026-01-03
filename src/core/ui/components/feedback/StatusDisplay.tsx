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
 *   icon={<Key size="L" className="text-gray-500" />}
 *   title="Sign in to Adobe"
 *   message="Connect your Adobe account"
 *   actions={[
 *     { label: 'Sign In', icon: <Login size="S" />, variant: 'accent', onPress: handleLogin },
 *   ]}
 * />
 * ```
 */
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import InfoOutline from '@spectrum-icons/workflow/InfoOutline';
import React from 'react';
import { Flex, Text, Button } from '@/core/ui/components/aria';
import { FadeTransition } from '@/core/ui/components/ui/FadeTransition';

export type StatusVariant = 'error' | 'success' | 'warning' | 'info' | 'pending';

export interface StatusAction {
    /** Button label text */
    label: string;
    /** Optional icon to display before the label */
    icon?: React.ReactNode;
    /** Button variant - 'primary' is mapped to 'accent' for React Aria compatibility */
    variant?: 'accent' | 'primary' | 'secondary' | 'negative';
    /** Click handler */
    onPress: () => void;
}

export interface StatusDisplayProps {
    /** Visual variant determining icon and color */
    variant: StatusVariant;
    /** Custom icon to override the default variant icon */
    icon?: React.ReactNode;
    /** Main title text (optional if using children for custom content) */
    title?: string;
    /** Description or error message */
    message?: string;
    /** Additional detail lines */
    details?: string[];
    /** Action buttons */
    actions?: StatusAction[];
    /** Optional additional content - can replace title/message for custom layouts */
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
        icon: <span className="text-red-600"><AlertCircle size="L" /></span>,
        colorClass: 'text-red-600',
    },
    success: {
        icon: <span className="text-green-600"><CheckmarkCircle size="L" /></span>,
        colorClass: 'text-green-600',
    },
    warning: {
        icon: <span className="text-orange-600"><AlertCircle size="L" /></span>,
        colorClass: 'text-orange-600',
    },
    info: {
        icon: <span className="text-blue-600"><InfoOutline size="L" /></span>,
        colorClass: 'text-blue-600',
    },
    pending: {
        icon: <span className="text-blue-600"><Clock size="L" /></span>,
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
                style={{ height }}
            >
                <Flex
                    direction="column"
                    gap="size-200"
                    alignItems="center"
                    style={{ maxWidth }}
                >
                    {displayIcon}

                    {/* Title/message section - only render if title provided */}
                    {title && (
                        <Flex direction="column" gap="size-100" alignItems="center">
                            <Text className="text-xl font-medium">{title}</Text>
                            {message && (
                                <Text className={messageClassName}>{message}</Text>
                            )}
                            {details?.map((detail, index) => (
                                <Text key={index} className={messageClassName}>
                                    {detail}
                                </Text>
                            ))}
                        </Flex>
                    )}

                    {children}

                    {actions && actions.length > 0 && (
                        <Flex gap="size-150" marginTop="size-300">
                            {actions.map((action, index) => {
                                // Map 'primary' to 'accent' for React Aria compatibility
                                const variant = action.variant === 'primary' ? 'accent' : (action.variant || 'secondary');
                                return (
                                <Button
                                    key={index}
                                    variant={variant}
                                    onPress={action.onPress}
                                >
                                    {action.icon && (
                                        <span className="button-icon-wrapper">
                                            {action.icon}
                                        </span>
                                    )}
                                    {action.label}
                                </Button>
                                );
                            })}
                        </Flex>
                    )}
                </Flex>
            </Flex>
        </FadeTransition>
    );
}
