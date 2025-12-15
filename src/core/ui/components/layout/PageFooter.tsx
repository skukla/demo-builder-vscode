/**
 * PageFooter Component
 *
 * Provides a consistent page footer pattern with left/center/right content composition.
 * Uses the same composition pattern as TwoColumnLayout (leftContent/rightContent).
 *
 * Used in:
 * - WizardContainer (Cancel | Logs | Back + Continue buttons)
 * - ConfigureScreen (Close | Save Changes buttons)
 * - Page-level screens requiring consistent footer styling
 *
 * @example
 * ```tsx
 * // Wizard footer pattern with center content
 * <PageFooter
 *   leftContent={<Button variant="secondary" isQuiet>Cancel</Button>}
 *   centerContent={<ActionButton isQuiet><ViewList /><Text>Logs</Text></ActionButton>}
 *   rightContent={
 *     <Flex gap="size-100">
 *       <Button variant="secondary" isQuiet>Back</Button>
 *       <Button variant="accent">Continue</Button>
 *     </Flex>
 *   }
 *   constrainWidth={true}
 * />
 *
 * // Configure screen pattern (no center content)
 * <PageFooter
 *   leftContent={<Button variant="secondary" isQuiet>Close</Button>}
 *   rightContent={<Button variant="accent">Save Changes</Button>}
 * />
 * ```
 */

import { View, Flex } from '@adobe/react-spectrum';
import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface PageFooterProps {
    /** Content for the left side of the footer (typically Cancel/Close button) */
    leftContent?: React.ReactNode;
    /** Content for the center of the footer (typically utility buttons like Logs) */
    centerContent?: React.ReactNode;
    /** Content for the right side of the footer (typically action buttons) */
    rightContent?: React.ReactNode;
    /** Whether to constrain content to max-w-800 (default: true) */
    constrainWidth?: boolean;
    /** Additional className for the outer container */
    className?: string;
}

/**
 * PageFooter - Consistent page footer layout component
 *
 * Follows the design pattern established in WizardContainer and ConfigureScreen:
 * - Fixed footer with bg-gray-75 and border-t
 * - Padding via Spectrum size-400
 * - Flex layout with space-between for left/right content
 * - Optional width constraint for centered content
 */
export const PageFooter: React.FC<PageFooterProps> = ({
    leftContent,
    centerContent,
    rightContent,
    constrainWidth = true,
    className,
}) => {
    const footerContent = (
        <Flex justifyContent="space-between" alignItems="center" width="100%">
            <View>{leftContent}</View>
            {centerContent && <View>{centerContent}</View>}
            <View>{rightContent}</View>
        </Flex>
    );

    return (
        <View
            padding="size-400"
            UNSAFE_className={cn('border-t', 'bg-gray-75', className)}
        >
            {constrainWidth ? (
                <div className="max-w-800 w-full">
                    {footerContent}
                </div>
            ) : (
                footerContent
            )}
        </View>
    );
};
