import React from 'react';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

export interface SingleColumnLayoutProps {
    /** Content for the single column */
    children: React.ReactNode;
    /** Maximum width of column (default: '800px') - supports Spectrum tokens */
    maxWidth?: DimensionValue;
    /** Column padding (default: '24px') - supports Spectrum tokens */
    padding?: DimensionValue;
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
export const SingleColumnLayout: React.FC<SingleColumnLayoutProps> = ({
    children,
    maxWidth = '800px' as DimensionValue,
    padding = '24px' as DimensionValue,
    margin = '0' as DimensionValue,
    className
}) => {
    return (
        <div
            style={{
                maxWidth: translateSpectrumToken(maxWidth),
                width: '100%',
                margin: translateSpectrumToken(margin),
                padding: translateSpectrumToken(padding)
            }}
            className={className}
        >
            {children}
        </div>
    );
};
