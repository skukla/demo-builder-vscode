import { View, Text, Flex } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import CheckmarkCircle from '@spectrum-icons/workflow/CheckmarkCircle';
import Clock from '@spectrum-icons/workflow/Clock';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

/**
 * StatusSection - Reusable status display section
 *
 * Displays a labeled section with icon indicating status (completed/pending/checking/error/empty)
 * Used across wizard steps for consistent configuration summary display.
 */
export interface StatusSectionProps {
    label: string;
    value?: string;
    description?: string;
    status: 'completed' | 'pending' | 'checking' | 'empty' | 'error';
    emptyText?: string;
    statusText?: string;
}

export function StatusSection({ 
    label, 
    value, 
    description, 
    status, 
    emptyText = 'Not selected', 
    statusText 
}: StatusSectionProps) {
    const renderIcon = () => {
        switch (status) {
            case 'completed':
                return <CheckmarkCircle size="S" UNSAFE_className="text-green-600" />;
            case 'checking':
            case 'pending':
                return <Clock size="S" UNSAFE_className="text-blue-600" />;
            case 'error':
                return <AlertCircle size="S" UNSAFE_className="text-red-600" />;
            default:
                return null;
        }
    };

    /**
     * Render status content based on current status
     */
    const renderStatusContent = (): React.ReactNode => {
        if (status === 'empty') {
            return <Text UNSAFE_className="text-sm text-gray-600">{emptyText}</Text>;
        }

        if (status === 'checking') {
            return (
                <Flex gap="size-100" alignItems="center">
                    {renderIcon()}
                    <Text UNSAFE_className="text-sm text-gray-600">{statusText || 'Checking...'}</Text>
                </Flex>
            );
        }

        return (
            <Flex gap="size-100" alignItems="center">
                {renderIcon()}
                <View>
                    <Text UNSAFE_className={status === 'error' ? 'text-sm text-red-600' : 'text-sm'}>
                        {statusText || value}
                    </Text>
                    {description && (
                        <Text UNSAFE_className="text-xs text-gray-600">{description}</Text>
                    )}
                </View>
            </Flex>
        );
    };

    return (
        <View marginTop="size-200" marginBottom="size-200">
            <Text UNSAFE_className={cn('text-xs', 'font-semibold', 'text-gray-700', 'text-uppercase', 'letter-spacing-05')}>
                {label}
            </Text>
            <View marginTop="size-100">
                {renderStatusContent()}
            </View>
        </View>
    );
}
