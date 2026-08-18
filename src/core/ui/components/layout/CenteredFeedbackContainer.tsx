import { Flex } from '@adobe/react-spectrum';
import React, { memo } from 'react';
import { translateSpectrumToken, DimensionValue } from '@/core/ui/utils/spectrumTokens';

/**
 * Props for CenteredFeedbackContainer component
 */
export interface CenteredFeedbackContainerProps {
    /** Content to center within the container */
    children: React.ReactNode;
    /**
     * Space to RESERVE, so a state change does not jolt the layout. Supports
     * Spectrum tokens (default: '350px').
     *
     * Applied as a minimum, never a cap — see the component docstring.
     */
    height?: DimensionValue;
    /** Maximum width constraint - supports Spectrum tokens (optional) */
    maxWidth?: DimensionValue;
    /**
     * Take the parent's full height, so the content centres in the PANE rather
     * than in a box the size of itself.
     *
     * Without it the container is exactly as tall as `height` reserves or its
     * content needs — whichever is larger — which leaves a short state pinned to
     * the top of a tall area with dead space beneath it. Still a minimum, so
     * content taller than the parent grows and scrolls as usual.
     *
     * Takes precedence over `height`: "fill the parent" and "reserve N pixels"
     * are answers to the same question.
     *
     * The parent has to have a resolvable height for this to do anything — a
     * percentage measures against the nearest definite ancestor.
     */
    fill?: boolean;
}

/**
 * CenteredFeedbackContainer Component
 *
 * Centers feedback content (loading spinners, success messages, error states)
 * both horizontally and vertically. Supports Adobe Spectrum design tokens for
 * the height and maxWidth props.
 *
 * `height` reserves space; it does not cap it. It was a fixed `height`, which
 * silently clipped anything larger — and centered, so half the excess went UP
 * and out of view. The AEM Code Sync install view (a heading, four numbered
 * steps, two buttons) lost its title above the top of the pane while empty space
 * sat below it. As a minimum, the prop still does the job it exists for — a
 * resolving fetch does not jolt the layout, because the box was already that
 * tall — and taller content is simply as tall as it is.
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
    fill = false,
}) => {
    return (
        <Flex
            direction="column"
            justifyContent="center"
            alignItems="center"
            minHeight={fill ? '100%' : translateSpectrumToken(height)}
            maxWidth={maxWidth ? translateSpectrumToken(maxWidth) : undefined}
        >
            {children}
        </Flex>
    );
};

CenteredFeedbackContainerComponent.displayName = 'CenteredFeedbackContainer';

export const CenteredFeedbackContainer = memo(CenteredFeedbackContainerComponent);
