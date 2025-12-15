/**
 * PageLayout Component
 *
 * Composite layout component combining header, scrollable content, and footer
 * slots into a full-viewport structure.
 *
 * Used in:
 * - WizardContainer (header + step content + footer buttons)
 * - ConfigureScreen (header + form + footer buttons)
 * - ProjectsDashboard (header + card grid)
 * - Page-level screens requiring consistent full-viewport layout
 *
 * @example
 * ```tsx
 * // Simple layout with content only
 * <PageLayout>
 *   <p>Main content here</p>
 * </PageLayout>
 *
 * // Full-featured layout
 * <PageLayout
 *   header={<PageHeader title="Projects" />}
 *   footer={<PageFooter leftContent={<Button>Cancel</Button>} rightContent={<Button>Save</Button>} />}
 *   backgroundColor="var(--spectrum-global-color-gray-50)"
 *   className="wizard-layout"
 * >
 *   <WizardStepContent />
 * </PageLayout>
 * ```
 */

import React from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface PageLayoutProps {
    /** Optional header slot - fixed at viewport top (no shrink) */
    header?: React.ReactNode;
    /** Optional footer slot - fixed at viewport bottom (no shrink) */
    footer?: React.ReactNode;
    /** Main content - rendered in scrollable middle section */
    children: React.ReactNode;
    /** Background color for the container */
    backgroundColor?: string;
    /** Additional className for the outer container */
    className?: string;
}

/**
 * PageLayout - Full-viewport composite layout component
 *
 * Provides a consistent page structure pattern:
 * - Header slot: Fixed at top, no shrink
 * - Content area: Scrollable, flex-grow (takes remaining space)
 * - Footer slot: Fixed at bottom, no shrink
 *
 * Structure follows the pattern established in WizardContainer, ConfigureScreen,
 * and ProjectsDashboard for consistent full-page layouts.
 */
export const PageLayout: React.FC<PageLayoutProps> = ({
    header,
    footer,
    children,
    backgroundColor,
    className,
}) => {
    return (
        <div
            className={cn('page-layout-container', className)}
            style={backgroundColor ? { backgroundColor } : undefined}
        >
            {/* Header slot - fixed, no shrink */}
            {header}

            {/* Content area - scrollable, flex-grow */}
            <div className="page-layout-content">
                {children}
            </div>

            {/* Footer slot - fixed, no shrink */}
            {footer}
        </div>
    );
};
