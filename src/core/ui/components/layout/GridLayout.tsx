import React from 'react';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

export interface GridLayoutProps {
    /** Grid items */
    children: React.ReactNode;
    /** Number of columns (default: 2) */
    columns?: number;
    /** Gap between items (default: 'size-300' / 24px) - supports Spectrum tokens */
    gap?: DimensionValue;
    /** Maximum width of container - supports Spectrum tokens */
    maxWidth?: DimensionValue;
    /** Padding around container - supports Spectrum tokens */
    padding?: DimensionValue;
    /** Additional CSS class */
    className?: string;
}

/**
 * GridLayout Component
 *
 * Provides a responsive grid layout with Adobe Spectrum design token support.
 * Automatically translates Spectrum tokens to CSS pixel values while maintaining
 * backward compatibility with pixel strings and numeric values.
 *
 * Used in Welcome and Dashboard screens for tile and card layouts.
 *
 * @example
 * ```tsx
 * // Using Spectrum tokens (recommended)
 * <GridLayout columns={3} gap="size-300" padding="size-400">
 *   <TileCard />
 *   <TileCard />
 *   <TileCard />
 * </GridLayout>
 *
 * // Backward compatible with pixel values
 * <GridLayout columns={2} gap="16px" maxWidth="800px">
 *   <ActionCard />
 *   <ActionCard />
 * </GridLayout>
 *
 * // Mix tokens and pixel values
 * <GridLayout gap="size-300" padding="24px">
 *   <Widget />
 * </GridLayout>
 * ```
 */
export function GridLayout({
    children,
    columns = 2,
    gap = 'size-300',
    maxWidth,
    padding,
    className,
}: GridLayoutProps) {
    // The props arrive as CUSTOM PROPERTIES; the stylesheet owns the actual
    // declarations. Setting `grid-template-columns` inline would take it out of
    // the cascade for good — no layer can outrank an inline style, so any future
    // rule wanting to touch this grid could only win with `!important`. That is
    // exactly how two of the survivors in the 1,294 -> 0 sweep came about.
    // A variable set inline stays a parameter; the property stays styleable.
    //
    // An undefined prop writes nothing, so `.grid-layout`'s own fallback applies
    // — which is why the CSS carries the defaults rather than this file.
    const containerClasses = ['grid-layout', 'grid', 'w-full', className]
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className={containerClasses}
            style={
                {
                    '--grid-columns': columns,
                    '--grid-gap': translateSpectrumToken(gap),
                    '--grid-max-width': translateSpectrumToken(maxWidth),
                    '--grid-padding': translateSpectrumToken(padding),
                } as React.CSSProperties
            }
        >
            {children}
        </div>
    );
}
