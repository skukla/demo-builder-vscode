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
    return (
        <div
            style={{
                display: 'flex',
                height: '100%',
                width: '100%',
                flex: '1',      // Take remaining space when in flex parent
                minHeight: 0,   // Allow shrinking below content size for proper scrolling
                gap: translateSpectrumToken(gap),
                alignItems: 'stretch' // Ensure both columns stretch to full height
            }}
            className={className}
        >
            {/* Left Column: Main Content (constrained width) */}
            <div
                style={{
                    maxWidth: translateSpectrumToken(leftMaxWidth),
                    width: '100%',
                    padding: translateSpectrumToken(leftPadding),
                    minWidth: 0, // Prevent flex shrinking issues
                    // Enable scrolling for children with flex: 1 + overflowY: auto
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                {leftContent}
            </div>

            {/* Right Column: Sidebar/Summary (flexible width) */}
            <div
                style={{
                    flex: '1',
                    padding: translateSpectrumToken(rightPadding),
                    backgroundColor: rightBackgroundColor,
                    borderLeft: showBorder
                        ? '1px solid var(--spectrum-global-color-gray-200)'
                        : undefined,
                    // Enable scrolling for children with flex: 1 + overflowY: auto
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}
            >
                {rightContent}
            </div>
        </div>
    );
};
