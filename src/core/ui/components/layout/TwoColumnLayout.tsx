import React from 'react';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

export interface TwoColumnLayoutProps {
    /** Content for the left column (main content area) */
    leftContent: React.ReactNode;
    /** Content for the right column (sidebar/summary) */
    rightContent: React.ReactNode;
    /** Maximum width of left column (default: '800px') - supports Spectrum tokens. */
    leftMaxWidth?: DimensionValue;
    /** Maximum width of the whole column pair (default: '1200px') - supports
     *  Spectrum tokens. Caps the left+right pair and centers it (`margin: 0 auto`)
     *  so the summary gets enough room without dominating and the pair does not
     *  stretch edge-to-edge on a fullscreen monitor. Pass `'none'` to opt out
     *  (full-width) for consumers that genuinely need it. */
    maxWidth?: DimensionValue;
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
    /** Minimum width for the right column (default: '300px') - supports Spectrum tokens.
     *  Floors the summary panel so it stays legible while the left column gives up
     *  space first (max-width: 800px). At narrow viewports the responsive CSS in
     *  custom-spectrum.css overrides this to 0 and stacks the columns vertically
     *  instead of letting the right column squeeze past readability. */
    rightMinWidth?: DimensionValue;
    /** Additional className for container */
    className?: string;
}

/**
 * Template Component: TwoColumnLayout
 *
 * Provides a consistent two-column layout pattern with Spectrum design token support.
 * Left column is constrained to configurable max width for readability,
 * right column is flexible. The whole pair is capped at `maxWidth` and centered.
 *
 * Used in:
 * - AdobeProjectStep (selection + summary)
 * - AdobeWorkspaceStep (selection + summary)
 * - ConfigureScreen (form + summary)
 * - ComponentConfigStep
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
 *
 * // Opt out of the centered cap (full-width)
 * <TwoColumnLayout
 *   maxWidth="none"
 *   leftContent={<List />}
 *   rightContent={<Summary />}
 * />
 * ```
 */
export const TwoColumnLayout: React.FC<TwoColumnLayoutProps> = ({
    leftContent,
    rightContent,
    leftMaxWidth = '800px' as DimensionValue,
    maxWidth = '1200px' as DimensionValue,
    leftPadding = '24px' as DimensionValue,
    rightPadding = '24px' as DimensionValue,
    rightBackgroundColor = 'var(--spectrum-global-color-gray-75)',
    showBorder = true,
    gap = '0' as DimensionValue,
    rightMinWidth = '300px' as DimensionValue,
    className,
}) => {
    // SOP §11: Static styles use utility classes, dynamic styles stay inline.
    // The `two-column-layout*` classes are the targets for the responsive
    // stacking media query in custom-spectrum.css — at narrow viewports the
    // CSS swaps flex-direction to column and clears the left max-width / right
    // min-width / left border so the summary slides under the active column
    // instead of being squeezed.
    const containerClasses = ['flex', 'h-full', 'w-full', 'flex-1', 'min-h-0', 'items-stretch', 'two-column-layout', className].filter(Boolean).join(' ');
    const leftColumnClasses = 'flex flex-column w-full min-w-0 overflow-hidden two-column-layout-left';
    const rightColumnClasses = 'flex-1 flex flex-column overflow-hidden two-column-layout-right';

    // Capped-primary left column: flex grow + maxWidth for readability. The right
    // column stays flexible (floored by rightMinWidth) but is bounded by the
    // container cap so the summary gets enough room without dominating. Dynamic
    // styles stay inline per SOP §11.
    const leftColumnStyle: React.CSSProperties = {
        maxWidth: translateSpectrumToken(leftMaxWidth),
        padding: translateSpectrumToken(leftPadding),
    };

    return (
        <div
            className={containerClasses}
            style={{
                gap: translateSpectrumToken(gap),
                // Cap + center the pair so it never stretches edge-to-edge on a
                // fullscreen monitor. The responsive stack query keeps working
                // (it only swaps flex-direction + releases the column widths).
                maxWidth: translateSpectrumToken(maxWidth),
                margin: '0 auto',
            }}
        >
            {/* Left Column: Main Content (constrained width) */}
            <div
                className={leftColumnClasses}
                style={leftColumnStyle}
            >
                {leftContent}
            </div>

            {/* Right Column: Sidebar/Summary (flexible width, floored by rightMinWidth) */}
            <div
                className={rightColumnClasses}
                style={{
                    padding: translateSpectrumToken(rightPadding),
                    backgroundColor: rightBackgroundColor,
                    borderLeft: showBorder
                        ? '1px solid var(--spectrum-global-color-gray-200)'
                        : undefined,
                    minWidth: translateSpectrumToken(rightMinWidth),
                }}
            >
                {rightContent}
            </div>
        </div>
    );
};
