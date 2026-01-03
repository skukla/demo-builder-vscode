/**
 * CenteredFeedbackContainer Component Tests
 *
 * Tests the CenteredFeedbackContainer component that centers feedback content
 * (loading spinners, success messages, error states) within a fixed-height container.
 *
 * Used in: Loading states, feedback displays, centered content patterns throughout the wizard.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CenteredFeedbackContainer } from '@/core/ui/components/layout/CenteredFeedbackContainer';
import { Button, ProgressCircle } from '@/core/ui/components/aria';

// Simple render helper (no Provider needed - React Aria components work standalone)
const renderWithProvider = (ui: React.ReactElement) => render(ui);

// Helper to find the CenteredFeedbackContainer (by its flex centering styles)
const findContainerElement = (container: HTMLElement): HTMLElement | null => {
    // Look for element with both justifyContent: center and alignItems: center
    return container.querySelector('[style*="justify-content: center"][style*="align-items: center"]');
};

describe('CenteredFeedbackContainer', () => {
    describe('children rendering', () => {
        it('should render children content', () => {
            // Given: CenteredFeedbackContainer with simple children
            // When: Component renders
            renderWithProvider(
                <CenteredFeedbackContainer>
                    <p>Loading message goes here</p>
                </CenteredFeedbackContainer>
            );

            // Then: Children visible in container
            expect(screen.getByText('Loading message goes here')).toBeInTheDocument();
        });

        it('should render complex children content (nested elements)', () => {
            // Given: CenteredFeedbackContainer with complex nested children
            renderWithProvider(
                <CenteredFeedbackContainer>
                    <div data-testid="feedback-wrapper">
                        <ProgressCircle aria-label="Loading" isIndeterminate />
                        <h2>Loading</h2>
                        <p>Please wait while we process your request</p>
                    </div>
                </CenteredFeedbackContainer>
            );

            // Then: All nested children elements visible
            expect(screen.getByTestId('feedback-wrapper')).toBeInTheDocument();
            expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Loading');
            expect(screen.getByText('Please wait while we process your request')).toBeInTheDocument();
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('should render multiple children', () => {
            // Given: CenteredFeedbackContainer with multiple children
            renderWithProvider(
                <CenteredFeedbackContainer>
                    <span data-testid="child-1">First child</span>
                    <span data-testid="child-2">Second child</span>
                    <span data-testid="child-3">Third child</span>
                </CenteredFeedbackContainer>
            );

            // Then: All children rendered
            expect(screen.getByTestId('child-1')).toBeInTheDocument();
            expect(screen.getByTestId('child-2')).toBeInTheDocument();
            expect(screen.getByTestId('child-3')).toBeInTheDocument();
        });
    });

    describe('height prop', () => {
        it('should apply default height of 350px when not specified', () => {
            // Given: CenteredFeedbackContainer without height prop
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer>
                    <p>Content</p>
                </CenteredFeedbackContainer>
            );

            // Then: Container has default 350px height
            const feedbackContainer = findContainerElement(container);
            expect(feedbackContainer).toBeInTheDocument();
            expect(feedbackContainer?.style.height).toBe('350px');
        });

        it('should apply custom height when specified', () => {
            // Given: CenteredFeedbackContainer with custom height
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer height="500px">
                    <p>Content</p>
                </CenteredFeedbackContainer>
            );

            // Then: Container has custom height
            const feedbackContainer = findContainerElement(container);
            expect(feedbackContainer).toBeInTheDocument();
            expect(feedbackContainer?.style.height).toBe('500px');
        });

        it('should support Spectrum design tokens for height', () => {
            // Given: CenteredFeedbackContainer with Spectrum token height
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer height="size-6000">
                    <p>Content</p>
                </CenteredFeedbackContainer>
            );

            // Then: Token translated to pixel value (size-6000 = 480px)
            const feedbackContainer = findContainerElement(container);
            expect(feedbackContainer).toBeInTheDocument();
            expect(feedbackContainer?.style.height).toBe('480px');
        });
    });

    describe('maxWidth prop', () => {
        it('should not apply maxWidth when not specified', () => {
            // Given: CenteredFeedbackContainer without maxWidth prop
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer>
                    <p>Content</p>
                </CenteredFeedbackContainer>
            );

            // Then: No maxWidth style applied
            const feedbackContainer = findContainerElement(container);
            expect(feedbackContainer).toBeInTheDocument();
            expect(feedbackContainer?.style.maxWidth).toBe('');
        });

        it('should apply maxWidth when specified', () => {
            // Given: CenteredFeedbackContainer with maxWidth
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer maxWidth="600px">
                    <p>Content</p>
                </CenteredFeedbackContainer>
            );

            // Then: Container has maxWidth
            const feedbackContainer = findContainerElement(container);
            expect(feedbackContainer).toBeInTheDocument();
            expect(feedbackContainer?.style.maxWidth).toBe('600px');
        });

        it('should support Spectrum design tokens for maxWidth', () => {
            // Given: CenteredFeedbackContainer with Spectrum token maxWidth
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer maxWidth="size-6000">
                    <p>Content</p>
                </CenteredFeedbackContainer>
            );

            // Then: Token translated to pixel value (size-6000 = 480px)
            const feedbackContainer = findContainerElement(container);
            expect(feedbackContainer).toBeInTheDocument();
            expect(feedbackContainer?.style.maxWidth).toBe('480px');
        });
    });

    describe('centering behavior', () => {
        it('should center content horizontally (alignItems="center")', () => {
            // Given: CenteredFeedbackContainer with content
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer>
                    <p>Centered content</p>
                </CenteredFeedbackContainer>
            );

            // Then: Container has alignItems: center for horizontal centering
            const feedbackContainer = findContainerElement(container);
            expect(feedbackContainer).toBeInTheDocument();
            expect(feedbackContainer?.style.alignItems).toBe('center');
        });

        it('should center content vertically (justifyContent="center")', () => {
            // Given: CenteredFeedbackContainer with content
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer>
                    <p>Centered content</p>
                </CenteredFeedbackContainer>
            );

            // Then: Container has justifyContent: center for vertical centering
            const feedbackContainer = findContainerElement(container);
            expect(feedbackContainer).toBeInTheDocument();
            expect(feedbackContainer?.style.justifyContent).toBe('center');
        });

        it('should use column direction layout (direction="column")', () => {
            // Given: CenteredFeedbackContainer with content
            const { container } = renderWithProvider(
                <CenteredFeedbackContainer>
                    <p>Centered content</p>
                </CenteredFeedbackContainer>
            );

            // Then: Container uses flex-direction: column
            const feedbackContainer = findContainerElement(container);
            expect(feedbackContainer).toBeInTheDocument();
            expect(feedbackContainer?.style.flexDirection).toBe('column');
        });
    });

    describe('accessibility', () => {
        it('should preserve semantic structure of children', () => {
            // Given: CenteredFeedbackContainer with semantic content
            renderWithProvider(
                <CenteredFeedbackContainer>
                    <main role="main">
                        <h1>Status</h1>
                        <p>Operation complete</p>
                    </main>
                </CenteredFeedbackContainer>
            );

            // Then: Semantic roles preserved
            expect(screen.getByRole('main')).toBeInTheDocument();
            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Status');
        });

        it('should allow keyboard-focusable content', () => {
            // Given: CenteredFeedbackContainer with focusable elements
            renderWithProvider(
                <CenteredFeedbackContainer>
                    <Button data-testid="action-btn">Retry</Button>
                </CenteredFeedbackContainer>
            );

            // Then: Button is accessible and not hidden
            const button = screen.getByRole('button', { name: 'Retry' });
            expect(button).toBeInTheDocument();
            expect(button).not.toHaveAttribute('aria-hidden', 'true');
        });
    });
});
