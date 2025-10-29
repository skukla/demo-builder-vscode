import React from 'react';
export interface GridLayoutProps {
    /** Grid items */
    children: React.ReactNode;
    /** Number of columns (default: 2) */
    columns?: number;
    /** Gap between items (default: '24px') */
    gap?: string;
    /** Maximum width of container */
    maxWidth?: string;
    /** Padding around container */
    padding?: string;
    /** Additional CSS class */
    className?: string;
}
/**
 * Template Component: GridLayout
 *
 * Provides a responsive grid layout for dashboard tiles, cards, etc.
 * Used in Welcome and Dashboard screens.
 *
 * @example
 * ```tsx
 * <GridLayout columns={3} gap="16px">
 *   <TileCard />
 *   <TileCard />
 *   <TileCard />
 * </GridLayout>
 * ```
 */
export declare const GridLayout: React.FC<GridLayoutProps>;
//# sourceMappingURL=GridLayout.d.ts.map