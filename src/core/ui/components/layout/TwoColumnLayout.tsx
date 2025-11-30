import React from 'react';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

export interface TwoColumnLayoutProps {
    /** Content for the left column (main content area) */
    leftContent: React.ReactNode;
    /** Content for the right column (sidebar/summary) */
    rightContent: React.ReactNode;
    /** Maximum width of left column (default: '800px') - supports Spectrum tokens */
    leftMaxWidth?: DimensionValue;
    /** Left column padding (default: '24px') - supports Spectrum tokens */
    leftPadding?: DimensionValue;
    /** Right column padding (default: '24px') - supports Spectrum tokens */
    rightPadding?: DimensionValue;
    /** Right column background color (default: spectrum gray-75) */
    rightBackgroundColor?: string;
    /** Whether to show border between columns (default: true) */
    showBorder?: boolean;
    /** Gap between columns (default: '0') - supports Spectrum tokens */
    gap?: DimensionValue;
    /** Additional className for container */
    className?: string;
}

/**
 * Template Component: TwoColumnLayout
 *
 * Provides a consistent two-column layout pattern with Spectrum design token support.
 * Left column is constrained to configurable max width for readability,
 * right column is flexible.
 *
 * Used in:
 * - AdobeProjectStep (selection + summary)
 * - AdobeWorkspaceStep (selection + summary)
 * - ConfigureScreen (form + summary)
 *
 * @example
 * ```tsx
 * // Using Spectrum tokens (recommended)
 * <TwoColumnLayout
 *   gap="size-300"
 *   leftPadding="size-400"
 *   leftMaxWidth="size-6000"
 *   leftContent={<ProjectList />}
 *   rightContent={<ConfigurationSummary />}
 * />
 *
 * // Backward compatible with pixel values
 * <TwoColumnLayout
 *   gap="24px"
 *   leftContent={<ProjectList />}
 *   rightContent={<ConfigurationSummary />}
 * />
 * ```
 */
export const TwoColumnLayout: React.FC<TwoColumnLayoutProps> = ({
    leftContent,
    rightContent,
    leftMaxWidth = '800px' as DimensionValue,
    leftPadding = '24px' as DimensionValue,
    rightPadding = '24px' as DimensionValue,
    rightBackgroundColor = 'var(--spectrum-global-color-gray-75)',
    showBorder = true,
    gap = '0' as DimensionValue,
    className
}) => {
    // SOP §11: Static styles use utility classes, dynamic styles stay inline
    const containerClasses = ['flex', 'h-full', 'w-full', 'flex-1', 'min-h-0', 'items-stretch', className].filter(Boolean).join(' ');
    const leftColumnClasses = 'flex flex-column w-full min-w-0 overflow-hidden';
    const rightColumnClasses = 'flex-1 flex flex-column overflow-hidden';

    return (
        <div
            className={containerClasses}
            style={{ gap: translateSpectrumToken(gap) }}
        >
            {/* Left Column: Main Content (constrained width) */}
            <div
                className={leftColumnClasses}
                style={{
                    maxWidth: translateSpectrumToken(leftMaxWidth),
                    padding: translateSpectrumToken(leftPadding),
                }}
            >
                {leftContent}
            </div>

            {/* Right Column: Sidebar/Summary (flexible width) */}
            <div
                className={rightColumnClasses}
                style={{
                    padding: translateSpectrumToken(rightPadding),
                    backgroundColor: rightBackgroundColor,
                    borderLeft: showBorder
                        ? '1px solid var(--spectrum-global-color-gray-200)'
                        : undefined,
                }}
            >
                {rightContent}
            </div>
        </div>
    );
};
