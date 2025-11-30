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
export const GridLayout: React.FC<GridLayoutProps> = ({
    children,
    columns = 2,
    gap = 'size-300',
    maxWidth,
    padding,
    className
}) => {
    // SOP §11: Static styles use utility classes, dynamic styles stay inline
    const containerClasses = ['grid', 'w-full', className].filter(Boolean).join(' ');

    return (
        <div
            className={containerClasses}
            style={{
                gridTemplateColumns: `repeat(${columns}, 1fr)`,
                gap: translateSpectrumToken(gap),
                maxWidth: translateSpectrumToken(maxWidth),
                padding: translateSpectrumToken(padding),
            }}
        >
            {children}
        </div>
    );
};
