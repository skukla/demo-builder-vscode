import React from 'react';
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
     * not the same as `'0px'`: this component writes an INLINE style, and inline
     * beats every cascade layer, so `padding="0px"` still overrules a stylesheet —
     * it just overrules it with zero. A caller that wants per-side padding (which
     * a single `DimensionValue` cannot express) needs the property ABSENT, not
     * zeroed. Before this existed, `.brand-gallery-column` could only win with
     * `!important`, and one element's padding was owned half by a prop and half by
     * a stylesheet.
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
    // Built here rather than inline, so `padding` can be OMITTED rather than set
    // to something. A conditional spread inside `style={{ ... }}` would do the
    // same job and read worse to the inline-style scan, which counts patterns
    // per object: this element already had a function call in it, so the spread
    // added a second match for one unchanged style object.
    const style: React.CSSProperties = {
        maxWidth: translateSpectrumToken(maxWidth),
        width: '100%',
        // Keep padding inside the 100% width. Without this the default
        // content-box adds the padding outside, so the column overflows its
        // parent by 2x padding and clips content at narrow/zoomed viewports.
        boxSizing: 'border-box',
        margin: translateSpectrumToken(margin),
    };
    if (padding !== null) {
        style.padding = translateSpectrumToken(padding);
    }

    return (
        <div
            style={style}
            className={className}
        >
            {children}
        </div>
    );
}
