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

import { View } from '@adobe/react-spectrum';
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
    /**
     * Build Your Project variant. Aligns the action buttons to the CENTER content
     * column by MIRRORING the page's [nav | step-view | summary] layout — a nav-width
     * spacer + a flex actions zone + a flex-grow summary spacer — using the shared
     * `--commerce-*` CSS vars (defined on `.wizard-main-content`). `leftContent` lands
     * at the content's left edge and `rightContent` at its right, with no buttons under
     * the flex-grow summary panel. Because it uses the same flex rules as the content
     * (not fixed-px math), the alignment holds as the columns flex. `centerContent` and
     * `constrainWidth` are ignored in this variant.
     */
    commerceColumns?: boolean;
}

/**
 * PageFooter - Consistent page footer layout component
 *
 * Follows the design pattern established in WizardContainer and ConfigureScreen:
 * - Fixed footer with bg-gray-75 and border-t
 * - Padding via Spectrum size-400
 * - CSS Grid with 3 equal columns for stable positioning
 * - Optional width constraint for centered content
 *
 * Uses CSS Grid instead of Flexbox space-between to ensure columns maintain
 * their position regardless of content presence (no placeholder divs needed).
 */
export const PageFooter: React.FC<PageFooterProps> = ({
    leftContent,
    centerContent,
    rightContent,
    constrainWidth = true,
    className,
    commerceColumns = false,
}) => {
    const gridContent = (
        <div className="footer-grid">
            <div className="grid-align-start">{leftContent}</div>
            <div className="grid-align-center">{centerContent}</div>
            <div className="grid-align-end">{rightContent}</div>
        </div>
    );

    // commerceColumns mirrors the [nav | step-view | summary] content layout so the
    // actions align to the center column structurally; otherwise the standard grid.
    let inner: React.ReactNode;
    if (commerceColumns) {
        inner = (
            <div className="footer-cols">
                <div className="footer-cols-zone">
                    <div className="footer-cols-navspacer" aria-hidden="true" />
                    <div className="footer-cols-actions">
                        {leftContent}
                        {rightContent}
                    </div>
                </div>
                <div className="footer-cols-spacer" aria-hidden="true" />
            </div>
        );
    } else if (constrainWidth) {
        inner = <div className="footer-content-container">{gridContent}</div>;
    } else {
        inner = gridContent;
    }

    return (
        <View
            paddingY="size-400"
            // Build variant bleeds to the edges (paddingX 0) so the footer columns line
            // up with the content's edge-bleeding nav + full-width summary panel.
            paddingX={commerceColumns ? 0 : 'size-400'}
            UNSAFE_className={cn('border-t', 'bg-gray-75', className)}
        >
            {inner}
        </View>
    );
};
