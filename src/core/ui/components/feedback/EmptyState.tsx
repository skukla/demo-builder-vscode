import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import React from 'react';
import { Flex, Text, View } from '@/core/ui/components/aria';

export interface EmptyStateProps {
    /** Icon to display (defaults to AlertCircle) */
    icon?: React.ReactNode;
    /** Title text */
    title: string;
    /** Description text */
    description: string;
    /** Icon color class (default: 'text-yellow-600') */
    iconColor?: string;
    /** Whether to center the display (default: true) */
    centered?: boolean;
    /** Optional action buttons or additional content */
    children?: React.ReactNode;
}

/**
 * Molecular Component: EmptyState
 *
 * Displays an empty state message when no data is available.
 * Used for "No projects found", "No workspaces found", etc.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   title="No Projects Found"
 *   description="No projects found in organization. Please create a project in Adobe Console first."
 * />
 * ```
 */
export const EmptyState = React.memo<EmptyStateProps>(({
    icon,
    title,
    description,
    iconColor = 'text-yellow-600',
    centered = true,
    children,
}) => {
    const content = (
        <Flex direction="column" gap="size-300" alignItems="center">
            {/* Well replacement: View with bg-gray-75 and padding for the well effect */}
            <View padding="size-200" className="bg-gray-75 rounded">
                <Flex gap="size-200" alignItems="center">
                    {icon || <span className={iconColor}><AlertCircle /></span>}
                    <Flex direction="column" gap="size-50">
                        <Text>
                            <strong>{title}</strong>
                        </Text>
                        <Text className="text-sm">{description}</Text>
                    </Flex>
                </Flex>
            </View>
            {children}
        </Flex>
    );

    if (centered) {
        return (
            <Flex justifyContent="center" alignItems="center" style={{ height: '350px' }}>
                {content}
            </Flex>
        );
    }

    return content;
});
