import { Flex, Text, Well } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import React from 'react';

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
}) => {
    const content = (
        <Well>
            <Flex gap="size-200" alignItems="center">
                {icon || <AlertCircle UNSAFE_className={iconColor} />}
                <Flex direction="column" gap="size-50">
                    <Text>
                        <strong>{title}</strong>
                    </Text>
                    <Text UNSAFE_className="text-sm">{description}</Text>
                </Flex>
            </Flex>
        </Well>
    );

    if (centered) {
        return (
            <Flex justifyContent="center" alignItems="center" height="350px">
                {content}
            </Flex>
        );
    }

    return content;
});
