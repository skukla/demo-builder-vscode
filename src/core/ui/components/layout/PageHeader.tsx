/**
 * PageHeader Component
 *
 * Provides a consistent page header pattern with title, subtitle,
 * optional action buttons, and back navigation.
 *
 * Used in:
 * - ProjectsDashboard (title + action button)
 * - Dashboard views (title + back button)
 * - Page-level screens requiring consistent header styling
 *
 * @example
 * ```tsx
 * // Simple header
 * <PageHeader title="Your Projects" />
 *
 * // Full-featured header
 * <PageHeader
 *   title="Your Projects"
 *   subtitle="Select a project to manage or create a new one"
 *   backButton={{ label: "Back", onPress: handleBack }}
 *   action={<Button variant="accent">New</Button>}
 *   constrainWidth={true}
 * />
 * ```
 */

import React from 'react';
import { View, Flex, Heading, Button } from '@adobe/react-spectrum';
import { cn } from '@/core/ui/utils/classNames';

export interface BackButtonConfig {
    /** Button label text */
    label: string;
    /** Callback fired when button is pressed */
    onPress: () => void;
}

export interface PageHeaderProps {
    /** Main title displayed as H1 */
    title: string;
    /** Optional subtitle displayed as H3 with gray styling */
    subtitle?: string;
    /** Optional action element (typically a Button) displayed right-aligned */
    action?: React.ReactNode;
    /** Optional back button configuration */
    backButton?: BackButtonConfig;
    /** Whether to constrain content to max-w-800 with auto margins (default: false) */
    constrainWidth?: boolean;
    /** Additional className for the outer container */
    className?: string;
}

/**
 * PageHeader - Consistent page header layout component
 *
 * Follows the design pattern established in ProjectsDashboard:
 * - Fixed header with bg-gray-75 and border-b
 * - Padding via Spectrum size-400
 * - Flex layout with title/subtitle on left, action on right
 * - Optional width constraint for centered content
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
    title,
    subtitle,
    action,
    backButton,
    constrainWidth = false,
    className,
}) => {
    const headerContent = (
        <Flex justifyContent="space-between" alignItems="center">
            <View>
                {backButton && (
                    <Button
                        variant="secondary"
                        onPress={backButton.onPress}
                        marginBottom="size-100"
                    >
                        {backButton.label}
                    </Button>
                )}
                <Heading level={1} marginBottom={subtitle ? 'size-100' : undefined}>
                    {title}
                </Heading>
                {subtitle && (
                    <Heading level={3} UNSAFE_className={cn('font-normal', 'text-gray-600')}>
                        {subtitle}
                    </Heading>
                )}
            </View>
            {action}
        </Flex>
    );

    return (
        <View
            padding="size-400"
            UNSAFE_className={cn('border-b', 'bg-gray-75', className)}
        >
            {constrainWidth ? (
                <div className="max-w-800 mx-auto">
                    {headerContent}
                </div>
            ) : (
                headerContent
            )}
        </View>
    );
};
