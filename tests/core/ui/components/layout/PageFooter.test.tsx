/**
 * PageFooter Component Tests
 *
 * Tests the PageFooter layout component that provides consistent page footers
 * with left/right content composition pattern (like TwoColumnLayout).
 *
 * Used in: WizardContainer, ConfigureScreen, and other page-level screens.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme, Button, Flex } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { PageFooter } from '@/core/ui/components/layout/PageFooter';

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('PageFooter', () => {
    describe('content rendering', () => {
        it('should render with both left and right content', () => {
            // Given: PageFooter with leftContent and rightContent provided
            // When: Component renders
            renderWithProvider(
                <PageFooter
                    leftContent={<Button variant="secondary">Cancel</Button>}
                    rightContent={<Button variant="accent">Continue</Button>}
                />
            );

            // Then: Both content sections visible
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
        });

        it('should render with only leftContent', () => {
            // Given: Only leftContent provided
            // When: Component renders
            renderWithProvider(
                <PageFooter
                    leftContent={<Button variant="secondary">Close</Button>}
                />
            );

            // Then: Left content visible, right section empty
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
        });

        it('should render with only rightContent', () => {
            // Given: Only rightContent provided
            // When: Component renders
            renderWithProvider(
                <PageFooter
                    rightContent={
                        <Flex gap="size-100">
                            <Button variant="secondary">Back</Button>
                            <Button variant="accent">Next</Button>
                        </Flex>
                    }
                />
            );

            // Then: Right content visible
            expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
        });

        it('should render any React node as content', () => {
            // Given: Custom React nodes as content
            renderWithProvider(
                <PageFooter
                    leftContent={<span data-testid="custom-left">Left Content</span>}
                    rightContent={<span data-testid="custom-right">Right Content</span>}
                />
            );

            // Then: Custom content is rendered
            expect(screen.getByTestId('custom-left')).toBeInTheDocument();
            expect(screen.getByTestId('custom-right')).toBeInTheDocument();
        });

        it('should render empty footer when no content provided', () => {
            // Given: PageFooter with no content
            const { container } = renderWithProvider(
                <PageFooter />
            );

            // Then: Footer renders but no buttons
            const buttons = container.querySelectorAll('button');
            expect(buttons).toHaveLength(0);
        });
    });

    describe('width constraint', () => {
        it('should apply width constraint when constrainWidth is true', () => {
            // Given: PageFooter with constrainWidth={true}
            const { container } = renderWithProvider(
                <PageFooter
                    leftContent={<Button>Cancel</Button>}
                    rightContent={<Button>Continue</Button>}
                    constrainWidth={true}
                />
            );

            // Then: Inner container has max-w-800 class
            const constrainedDiv = container.querySelector('.max-w-800');
            expect(constrainedDiv).toBeInTheDocument();
        });

        it('should apply width constraint by default', () => {
            // Given: PageFooter without constrainWidth prop (should default to true)
            const { container } = renderWithProvider(
                <PageFooter
                    leftContent={<Button>Cancel</Button>}
                />
            );

            // Then: max-w-800 class applied by default
            const constrainedDiv = container.querySelector('.max-w-800');
            expect(constrainedDiv).toBeInTheDocument();
        });

        it('should not apply width constraint when constrainWidth is false', () => {
            // Given: PageFooter with constrainWidth={false}
            const { container } = renderWithProvider(
                <PageFooter
                    leftContent={<Button>Cancel</Button>}
                    constrainWidth={false}
                />
            );

            // Then: No max-w-800 class applied
            const constrainedDiv = container.querySelector('.max-w-800');
            expect(constrainedDiv).not.toBeInTheDocument();
        });
    });

    describe('layout', () => {
        it('should use CSS Grid layout for left, center, and right content', () => {
            // Given: PageFooter with both left and right content
            const { container } = renderWithProvider(
                <PageFooter
                    leftContent={<Button>Cancel</Button>}
                    rightContent={<Button>Continue</Button>}
                />
            );

            // Then: Grid container with 3 columns exists
            // PageFooter uses CSS Grid (gridTemplateColumns: '1fr auto 1fr')
            const cancelButton = screen.getByRole('button', { name: 'Cancel' });
            const continueButton = screen.getByRole('button', { name: 'Continue' });

            // Both buttons should be in the DOM
            expect(cancelButton).toBeInTheDocument();
            expect(continueButton).toBeInTheDocument();

            // The grid container should exist (checking for display: grid in style)
            const gridContainer = container.querySelector('[style*="grid"]');
            expect(gridContainer).toBeInTheDocument();
        });
    });

    describe('styling', () => {
        it('should apply border-t and bg-gray-75 classes', () => {
            // Given: PageFooter with content
            const { container } = renderWithProvider(
                <PageFooter
                    leftContent={<Button>Cancel</Button>}
                />
            );

            // Then: Footer wrapper should have standard styling classes
            const footerWrapper = container.querySelector('.border-t.bg-gray-75');
            expect(footerWrapper).toBeInTheDocument();
        });

        it('should apply custom className when provided', () => {
            // Given: PageFooter with custom className
            const { container } = renderWithProvider(
                <PageFooter
                    leftContent={<Button>Cancel</Button>}
                    className="custom-footer-class"
                />
            );

            // Then: Custom class is applied
            const footerWithCustomClass = container.querySelector('.custom-footer-class');
            expect(footerWithCustomClass).toBeInTheDocument();
        });

        it('should combine default classes with custom className', () => {
            // Given: PageFooter with custom className
            const { container } = renderWithProvider(
                <PageFooter
                    leftContent={<Button>Cancel</Button>}
                    className="my-custom-class"
                />
            );

            // Then: Both default and custom classes applied
            const footer = container.querySelector('.border-t.bg-gray-75.my-custom-class');
            expect(footer).toBeInTheDocument();
        });
    });

    describe('center content', () => {
        it('should render centerContent when provided', () => {
            // Given: PageFooter with centerContent provided
            // When: Component renders
            renderWithProvider(
                <PageFooter
                    leftContent={<Button variant="secondary">Cancel</Button>}
                    centerContent={<Button variant="secondary" isQuiet>Logs</Button>}
                    rightContent={<Button variant="accent">Continue</Button>}
                />
            );

            // Then: Center content is visible alongside left and right
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Logs' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
        });

        it('should render centerContent without left or right content', () => {
            // Given: PageFooter with only centerContent
            renderWithProvider(
                <PageFooter
                    centerContent={<span data-testid="center-only">Center Only</span>}
                />
            );

            // Then: Center content is rendered
            expect(screen.getByTestId('center-only')).toBeInTheDocument();
        });

        it('should render any React node as center content', () => {
            // Given: Custom React node as centerContent
            renderWithProvider(
                <PageFooter
                    centerContent={
                        <Flex gap="size-100">
                            <Button isQuiet>Action 1</Button>
                            <Button isQuiet>Action 2</Button>
                        </Flex>
                    }
                />
            );

            // Then: Complex center content is rendered
            expect(screen.getByRole('button', { name: 'Action 1' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Action 2' })).toBeInTheDocument();
        });
    });

    describe('combined features', () => {
        it('should render typical wizard footer pattern', () => {
            // Given: PageFooter with typical wizard footer content
            renderWithProvider(
                <PageFooter
                    leftContent={
                        <Button variant="secondary" isQuiet>Cancel</Button>
                    }
                    rightContent={
                        <Flex gap="size-100">
                            <Button variant="secondary" isQuiet>Back</Button>
                            <Button variant="accent">Continue</Button>
                        </Flex>
                    }
                    constrainWidth={true}
                />
            );

            // Then: All elements present and functional
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
        });

        it('should render typical configure footer pattern', () => {
            // Given: PageFooter with configure screen pattern
            renderWithProvider(
                <PageFooter
                    leftContent={
                        <Button variant="secondary" isQuiet>Close</Button>
                    }
                    rightContent={
                        <Button variant="accent">Save Changes</Button>
                    }
                    constrainWidth={true}
                    className="configure-footer"
                />
            );

            // Then: All elements present
            expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
        });
    });

    describe('accessibility', () => {
        it('should have accessible buttons', () => {
            // Given: PageFooter with buttons
            renderWithProvider(
                <PageFooter
                    leftContent={<Button>Cancel</Button>}
                    rightContent={<Button>Submit</Button>}
                />
            );

            // Then: Buttons are accessible
            const buttons = screen.getAllByRole('button');
            buttons.forEach(button => {
                expect(button).not.toHaveAttribute('aria-hidden', 'true');
            });
        });

        it('should preserve semantic structure of child elements', () => {
            // Given: PageFooter with semantic content
            renderWithProvider(
                <PageFooter
                    leftContent={<nav aria-label="Footer navigation"><Button>Home</Button></nav>}
                />
            );

            // Then: Semantic structure preserved
            expect(screen.getByRole('navigation', { name: 'Footer navigation' })).toBeInTheDocument();
        });
    });
});
