import React, { memo } from 'react';
import { Flex } from '@/core/ui/components/aria';
import { DimensionValue } from '@/core/ui/utils/spectrumTokens';

/**
 * Props for CenteredFeedbackContainer component
 */
export interface CenteredFeedbackContainerProps {
    /** Content to center within the container */
    children: React.ReactNode;
    /** Container height - supports Spectrum tokens (default: '350px') */
    height?: DimensionValue;
    /** Maximum width constraint - supports Spectrum tokens (optional) */
    maxWidth?: DimensionValue;
}

/**
 * CenteredFeedbackContainer Component
 *
 * Centers feedback content (loading spinners, success messages, error states)
 * both horizontally and vertically within a fixed-height container.
 * Supports Adobe Spectrum design tokens for height and maxWidth props.
 *
 * Used in: Loading states, feedback displays, centered content patterns
 * throughout the wizard and dashboard.
 *
 * @example
 * ```tsx
 * // Basic usage with loading spinner
 * <CenteredFeedbackContainer>
 *   <ProgressCircle aria-label="Loading" isIndeterminate />
 *   <Text>Loading...</Text>
 * </CenteredFeedbackContainer>
 *
 * // Custom height with Spectrum token
 * <CenteredFeedbackContainer height="size-6000">
 *   <StatusMessage variant="success">Operation complete!</StatusMessage>
 * </CenteredFeedbackContainer>
 *
 * // With maxWidth constraint
 * <CenteredFeedbackContainer height="500px" maxWidth="600px">
 *   <ErrorMessage>Something went wrong</ErrorMessage>
 * </CenteredFeedbackContainer>
 * ```
 */
const CenteredFeedbackContainerComponent: React.FC<CenteredFeedbackContainerProps> = ({
    children,
    height = '350px',
    maxWidth,
}) => {
    return (
        <Flex
            direction="column"
            justifyContent="center"
            alignItems="center"
            height={height}
            maxWidth={maxWidth}
        >
            {children}
        </Flex>
    );
};

CenteredFeedbackContainerComponent.displayName = 'CenteredFeedbackContainer';

export const CenteredFeedbackContainer = memo(CenteredFeedbackContainerComponent);
