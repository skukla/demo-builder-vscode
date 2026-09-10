import React from 'react';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

export interface TwoColumnLayoutProps {
    /** Content for the left column (main content area) */
    leftContent: React.ReactNode;
    /** Content for the right column (sidebar/summary) */
    rightContent: React.ReactNode;
    /** Maximum width of left column (default: '960px', the canonical --content-width) - supports Spectrum tokens. */
    leftMaxWidth?: DimensionValue;
    /** Maximum width of the whole column pair (default: '1200px') - supports
     *  Spectrum tokens. Caps the left+right pair and centers it (`margin: 0 auto`)
     *  so the summary gets enough room without dominating and the pair does not
     *  stretch edge-to-edge on a fullscreen monitor. Pass `'none'` to opt out
     *  (full-width) for consumers that genuinely need it. */
    maxWidth?: DimensionValue | 'none';
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
     *  space first (max-width: 960px). At narrow viewports the responsive CSS in
     *  utilities.css overrides this to 0 and stacks the columns vertically
     *  instead of letting the right column squeeze past readability. */
    rightMinWidth?: DimensionValue;
    /** Fixed width for the right column (default: unset) - supports Spectrum tokens.
     *  When set, the right column becomes a fixed-width sidebar (`flex: 0 0 <rightWidth>`
     *  + `width: <rightWidth>`, no flex-grow) and the LEFT column becomes the flexible
     *  majority (`flex: 1 1 0` + `min-width: 0`), with the left `leftMaxWidth` cap
     *  dropped so the content fills all remaining space between the columns. Used by the
     *  full-width Commerce step to pin a modest summary sidebar to the right edge while
     *  the nav+content take the bulk of the width. When UNSET, the layout keeps its
     *  default behavior: left capped by `leftMaxWidth`, right `flex-1` floored by
     *  `rightMinWidth`. */
    rightWidth?: DimensionValue;
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
 *
 * // Opt out of the centered cap (full-width)
 * <TwoColumnLayout
 *   maxWidth="none"
 *   leftContent={<List />}
 *   rightContent={<Summary />}
 * />
 * ```
 */
export function TwoColumnLayout({
    leftContent,
    rightContent,
    // 960 mirrors the canonical CSS --content-width (DimensionValue can't take a var()).
    leftMaxWidth = '960px' as DimensionValue,
    maxWidth = '1200px' as DimensionValue,
    leftPadding = '24px' as DimensionValue,
    rightPadding = '24px' as DimensionValue,
    rightBackgroundColor = 'var(--spectrum-global-color-gray-75)',
    showBorder = true,
    gap = '0' as DimensionValue,
    rightMinWidth = '300px' as DimensionValue,
    rightWidth,
    className,
}: TwoColumnLayoutProps) {
    // SOP §11: Static styles use utility classes, dynamic styles stay inline.
    // The `two-column-layout*` classes are the targets for the responsive
    // stacking media query in utilities.css — at narrow viewports the
    // CSS swaps flex-direction to column and clears the left max-width / right
    // min-width / left border so the summary slides under the active column
    // instead of being squeezed.
    // Fixed-width right column mode: the summary becomes a fixed sidebar (no
    // flex-grow) and the left column becomes the flexible majority. In this mode
    // the right column drops its `flex-1` grow class and the left column drops its
    // readability cap so the content fills all remaining space.
    const fixedRight = rightWidth !== undefined;
    const translatedRightWidth = fixedRight ? translateSpectrumToken(rightWidth) : undefined;

    const containerClasses = [
        'flex',
        'h-full',
        'w-full',
        'flex-1',
        'min-h-0',
        'items-stretch',
        'two-column-layout',
        className,
    ]
        .filter(Boolean)
        .join(' ');
    const leftColumnClasses =
        'flex flex-column w-full min-w-0 overflow-hidden two-column-layout-left';
    const rightColumnClasses = [
        fixedRight ? null : 'flex-1',
        'flex',
        'flex-column',
        'overflow-hidden',
        'two-column-layout-right',
    ]
        .filter(Boolean)
        .join(' ');

    // The two modes are a DATA ATTRIBUTE, not two style objects.
    //
    // Left column. Default: capped-primary (flex grow + max-width for
    // readability). Fixed-right mode: flexible majority (flex: 1 1 0 +
    // min-width: 0) with the cap dropped, so the content fills the space the
    // fixed sidebar leaves. `box-sizing: border-box` keeps padding inside the
    // column width, so a padded 100%/fixed-width column never overflows its
    // parent and clips content at narrow or zoomed viewports.
    //
    // All of that is in `.two-column-layout-*` (two-column-layout.css) now. The
    // values that VARY arrive as custom properties; the declarations stay in the
    // cascade, where a consumer can still reach them. A style object cannot be
    // reached by any stylesheet at any specificity.

    return (
        <div
            className={containerClasses}
            data-fixed-right={fixedRight ? 'true' : undefined}
            style={
                {
                    '--two-col-gap': translateSpectrumToken(gap),
                    // Cap + centre the pair so it never stretches edge-to-edge on a
                    // fullscreen monitor. The responsive stack query keeps working
                    // — it only swaps flex-direction and releases the column widths.
                    '--two-col-max-width':
                        maxWidth === 'none' ? 'none' : translateSpectrumToken(maxWidth),
                    '--two-col-left-max-width': translateSpectrumToken(leftMaxWidth),
                    '--two-col-left-padding': translateSpectrumToken(leftPadding),
                    '--two-col-right-padding': translateSpectrumToken(rightPadding),
                    '--two-col-right-background': rightBackgroundColor,
                    '--two-col-right-width': translatedRightWidth,
                    '--two-col-right-min-width': translateSpectrumToken(rightMinWidth),
                } as React.CSSProperties
            }
        >
            {/* Left Column: Main Content (constrained width) */}
            <div className={leftColumnClasses}>
                {leftContent}
            </div>

            {/* Right Column: Sidebar/Summary. Default: flexible (flex-1), floored by
                rightMinWidth. Fixed-width mode (rightWidth set): a pinned sidebar
                (flex: 0 0 <rightWidth> + width: <rightWidth>, no grow). */}
            <div className={rightColumnClasses} data-show-border={showBorder ? 'true' : undefined}>
                {rightContent}
            </div>
        </div>
    );
}
