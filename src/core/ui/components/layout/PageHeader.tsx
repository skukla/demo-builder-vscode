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

import { View, Flex, Heading, Text, Button } from '@adobe/react-spectrum';
import React from 'react';
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
    /** Optional subtitle displayed as H3 with gray styling (typically step name) */
    subtitle?: string;
    /** Optional description text displayed below subtitle (typically step description) */
    description?: string;
    /** Optional dynamic status text displayed below description (for showing current operation) */
    statusText?: string;
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
    description,
    statusText,
    action,
    backButton,
    constrainWidth = false,
    className,
}) => {
    // One tight single row: [back?] title · subtitle crumb … [action]. A description or
    // status renders as an optional secondary line only when supplied. This reclaimed
    // density is the canonical header for every screen — the page context (a left rail
    // on the wizard, the grid on a dashboard) carries the wayfinding, so the header
    // stays short rather than restating it.
    const headerContent = (
        <div className="page-header-inner">
            <Flex alignItems="center" gap="size-200" wrap>
                {backButton && (
                    <Button variant="secondary" isQuiet onPress={backButton.onPress}>
                        {backButton.label}
                    </Button>
                )}
                <Flex alignItems="baseline" gap="size-150" wrap>
                    <Heading level={1} margin={0} UNSAFE_className="page-header-title">
                        {title}
                    </Heading>
                    {subtitle && (
                        <Text UNSAFE_className={cn('text-gray-600', 'page-header-subtitle')}>
                            {subtitle}
                        </Text>
                    )}
                </Flex>
                {action ? <View marginStart="auto">{action}</View> : null}
            </Flex>
            {description && (
                <div className="page-header-secondary">
                    <Text UNSAFE_className={cn('text-gray-500', 'text-sm')}>{description}</Text>
                </div>
            )}
            {statusText && (
                <div className="page-header-secondary">
                    <Text UNSAFE_className={cn('text-gray-600', 'text-sm', 'font-medium')}>
                        {statusText}
                    </Text>
                </div>
            )}
        </div>
    );

    return (
        <View
            paddingX="size-400"
            paddingY="size-200"
            UNSAFE_className={cn('border-b', 'bg-gray-75', 'page-header', className)}
        >
            {constrainWidth ? (
                <div className="page-container">{headerContent}</div>
            ) : (
                headerContent
            )}
        </View>
    );
};
