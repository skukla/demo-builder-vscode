import { Flex, Text, Well } from '@adobe/react-spectrum';
import React from 'react';
import { StatusIcon } from '@/core/ui/components/feedback/StatusIcon';

export interface EmptyStateProps {
    /** Icon to display (defaults to AlertCircle) */
    icon?: React.ReactNode;
    /** Title text */
    title: string;
    /** Description text */
    description: string;
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
    centered = true,
    children,
}) => {
    const content = (
        <Flex direction="column" gap="size-300" alignItems="center">
            <Well>
                <Flex gap="size-200" alignItems="center">
                    {icon || <StatusIcon status="warning" size="M" />}
                    <Flex direction="column" gap="size-50">
                        <Text>
                            <strong>{title}</strong>
                        </Text>
                        <Text UNSAFE_className="text-sm">{description}</Text>
                    </Flex>
                </Flex>
            </Well>
            {children}
        </Flex>
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
