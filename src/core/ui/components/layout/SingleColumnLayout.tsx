import React from 'react';
import { cn } from '@/core/ui/utils/classNames';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

export interface SingleColumnLayoutProps {
    /** Content for the single column */
    children: React.ReactNode;
    /** Maximum width of column (default: '960px', the canonical --content-width) - supports Spectrum tokens */
    maxWidth?: DimensionValue;
    /**
     * Column padding (default: `'24px'`) — supports Spectrum tokens.
     *
     * Pass `null` to write NO padding at all and let a stylesheet own it. That is
     * not the same as `'0px'`: `'0px'` still DECLARES padding — with zero — and a
     * stylesheet then has to outrank that declaration. `null` instead stamps
     * `data-padding="none"`, and the `.single-column-layout` padding rule is
     * written `:not([data-padding='none'])`, so it does not apply at all. A caller
     * wanting per-side padding (which one `DimensionValue` cannot express) needs
     * the property ABSENT, not zeroed. Before this existed,
     * `.brand-gallery-column` could only win with `!important`.
     */
    padding?: DimensionValue | null;
    /** Column margin (default: '0') - supports Spectrum tokens */
    margin?: DimensionValue;
    /** Additional className for container */
    className?: string;
}

/**
 * Template Component: SingleColumnLayout
 *
 * Provides a consistent single-column layout pattern with Spectrum design token support.
 * Column is constrained to configurable max width for readability.
 *
 * Used in:
 * - AdobeAuthStep (authentication flow)
 * - ProjectCreationStep (project creation progress)
 *
 * @example
 * ```tsx
 * // Using Spectrum tokens (recommended)
 * <SingleColumnLayout
 *   padding="size-400"
 *   maxWidth="size-6000"
 * >
 *   <Heading>My Content</Heading>
 *   <Text>Details here</Text>
 * </SingleColumnLayout>
 *
 * // Backward compatible with pixel values
 * <SingleColumnLayout padding="24px" maxWidth="800px">
 *   <MyComponent />
 * </SingleColumnLayout>
 * ```
 */
export function SingleColumnLayout({
    children,
    // 960 mirrors the canonical CSS --content-width (DimensionValue can't take a var()).
    maxWidth = '960px' as DimensionValue,
    padding = '24px' as DimensionValue | null,
    margin = '0' as DimensionValue,
    className,
}: SingleColumnLayoutProps) {
    // The box is `.single-column-layout` in index.css; only the three PARAMETERS
    // cross over, as custom properties. `padding={null}` is the one that cannot be
    // a property — absent is not a value — so it stamps a data attribute the CSS
    // rule excludes itself on.
    const parameters = {
        '--single-column-max-width': translateSpectrumToken(maxWidth),
        '--single-column-margin': translateSpectrumToken(margin),
        ...(padding === null
            ? {}
            : { '--single-column-padding': translateSpectrumToken(padding) }),
    } as React.CSSProperties;

    return (
        <div
            className={cn('single-column-layout', className)}
            data-padding={padding === null ? 'none' : undefined}
            style={parameters}
        >
            {children}
        </div>
    );
}
