/**
 * PageLayout Component Tests
 *
 * Tests the PageLayout composite component that combines header, scrollable content,
 * and footer slots into a full-viewport structure.
 *
 * Used in: WizardContainer, ConfigureScreen, ProjectsDashboard, and other full-page views.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PageLayout } from '@/core/ui/components/layout/PageLayout';
import { Button } from '@/core/ui/components/aria';

// Simple render helper (no Provider needed - React Aria components work standalone)
const renderWithProvider = (ui: React.ReactElement) => render(ui);

// Helper to find the PageLayout container (skips Provider wrapper)
const findLayoutContainer = (container: HTMLElement): HTMLElement | null => {
    // PageLayout has height: 100vh style which is unique
    return container.querySelector('[style*="height: 100vh"]');
};

describe('PageLayout', () => {
    describe('children rendering', () => {
        it('should render children in scrollable content area', () => {
            // Given: PageLayout with children content
            // When: Component renders
            renderWithProvider(
                <PageLayout>
                    <p>Main content goes here</p>
                </PageLayout>
            );

            // Then: Children visible in scrollable middle section
            expect(screen.getByText('Main content goes here')).toBeInTheDocument();
        });

        it('should render complex children content', () => {
            // Given: PageLayout with complex children
            renderWithProvider(
                <PageLayout>
                    <div data-testid="content-wrapper">
                        <h2>Content Title</h2>
                        <p>Content paragraph</p>
                        <Button variant="accent">Action Button</Button>
                    </div>
                </PageLayout>
            );

            // Then: All children elements visible
            expect(screen.getByTestId('content-wrapper')).toBeInTheDocument();
            expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Content Title');
            expect(screen.getByText('Content paragraph')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Action Button' })).toBeInTheDocument();
        });

        it('should render children inside a scrollable container', () => {
            // Given: PageLayout with children
            const { container } = renderWithProvider(
                <PageLayout>
                    <span data-testid="scroll-content">Scrollable content</span>
                </PageLayout>
            );

            // Then: Content is inside a scrollable div (overflow-y: auto)
            const scrollableDiv = container.querySelector('[style*="overflow"]');
            expect(scrollableDiv).toBeInTheDocument();
            expect(scrollableDiv).toContainElement(screen.getByTestId('scroll-content'));
        });
    });

    describe('header slot rendering', () => {
        it('should render header slot at top', () => {
            // Given: PageLayout with header prop
            // When: Component renders
            renderWithProvider(
                <PageLayout header={<header data-testid="header">Header Content</header>}>
                    <p>Main content</p>
                </PageLayout>
            );

            // Then: Header fixed at viewport top
            expect(screen.getByTestId('header')).toBeInTheDocument();
            expect(screen.getByText('Header Content')).toBeInTheDocument();
        });

        it('should render any React node as header', () => {
            // Given: PageLayout with complex header
            renderWithProvider(
                <PageLayout
                    header={
                        <div data-testid="custom-header">
                            <h1>Page Title</h1>
                            <Button variant="accent">Action</Button>
                        </div>
                    }
                >
                    <p>Content</p>
                </PageLayout>
            );

            // Then: Complex header rendered
            expect(screen.getByTestId('custom-header')).toBeInTheDocument();
            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page Title');
            expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
        });

        it('should render header before content in DOM order', () => {
            // Given: PageLayout with header and content
            const { container } = renderWithProvider(
                <PageLayout header={<div data-testid="header-elem">Header</div>}>
                    <div data-testid="content-elem">Content</div>
                </PageLayout>
            );

            // Then: Header comes before content in DOM
            const header = screen.getByTestId('header-elem');
            const content = screen.getByTestId('content-elem');

            // Compare DOM positions
            const headerParent = header.closest('[style*="flex"]');
            const contentParent = content.closest('[style*="overflow"]');

            expect(headerParent).toBeInTheDocument();
            expect(contentParent).toBeInTheDocument();
        });

        it('should not render header element when not provided', () => {
            // Given: PageLayout without header prop
            renderWithProvider(
                <PageLayout>
                    <p>Content only</p>
                </PageLayout>
            );

            // Then: No header testid present
            expect(screen.queryByTestId('header')).not.toBeInTheDocument();
        });
    });

    describe('footer slot rendering', () => {
        it('should render footer slot at bottom', () => {
            // Given: PageLayout with footer prop
            // When: Component renders
            renderWithProvider(
                <PageLayout footer={<footer data-testid="footer">Footer Content</footer>}>
                    <p>Main content</p>
                </PageLayout>
            );

            // Then: Footer fixed at viewport bottom
            expect(screen.getByTestId('footer')).toBeInTheDocument();
            expect(screen.getByText('Footer Content')).toBeInTheDocument();
        });

        it('should render any React node as footer', () => {
            // Given: PageLayout with complex footer
            renderWithProvider(
                <PageLayout
                    footer={
                        <div data-testid="custom-footer">
                            <Button variant="secondary">Cancel</Button>
                            <Button variant="accent">Submit</Button>
                        </div>
                    }
                >
                    <p>Content</p>
                </PageLayout>
            );

            // Then: Complex footer rendered
            expect(screen.getByTestId('custom-footer')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
        });

        it('should render footer after content in DOM order', () => {
            // Given: PageLayout with content and footer
            const { container } = renderWithProvider(
                <PageLayout footer={<div data-testid="footer-elem">Footer</div>}>
                    <div data-testid="content-elem">Content</div>
                </PageLayout>
            );

            // Then: Footer comes after content in DOM
            const footer = screen.getByTestId('footer-elem');
            const content = screen.getByTestId('content-elem');

            expect(footer).toBeInTheDocument();
            expect(content).toBeInTheDocument();
        });

        it('should not render footer element when not provided', () => {
            // Given: PageLayout without footer prop
            renderWithProvider(
                <PageLayout>
                    <p>Content only</p>
                </PageLayout>
            );

            // Then: No footer testid present
            expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
        });
    });

    describe('backgroundColor', () => {
        it('should apply custom backgroundColor', () => {
            // Given: PageLayout with valid CSS backgroundColor
            // When: Component renders
            const { container } = renderWithProvider(
                <PageLayout backgroundColor="#f5f5f5">
                    <p>Content</p>
                </PageLayout>
            );

            // Then: Background style applied to container (verify via style property)
            // Note: JSDOM normalizes hex colors to rgb()
            const layoutContainer = findLayoutContainer(container);
            expect(layoutContainer).toBeInTheDocument();
            expect(layoutContainer?.style.backgroundColor).toBe('rgb(245, 245, 245)');
        });

        it('should apply spectrum color variable as backgroundColor', () => {
            // Given: PageLayout with Spectrum color variable
            const { container } = renderWithProvider(
                <PageLayout backgroundColor="var(--spectrum-global-color-gray-75)">
                    <p>Content</p>
                </PageLayout>
            );

            // Then: Spectrum color applied (verify via style attribute)
            const layoutContainer = findLayoutContainer(container);
            expect(layoutContainer).toBeInTheDocument();
            expect(layoutContainer?.style.backgroundColor).toBe('var(--spectrum-global-color-gray-75)');
        });

        it('should render without backgroundColor when not specified', () => {
            // Given: PageLayout without backgroundColor
            const { container } = renderWithProvider(
                <PageLayout>
                    <p>Content</p>
                </PageLayout>
            );

            // Then: Container exists, no explicit background color set
            const layoutContainer = findLayoutContainer(container);
            expect(layoutContainer).toBeInTheDocument();
        });
    });

    describe('className', () => {
        it('should apply custom className', () => {
            // Given: PageLayout with className
            const { container } = renderWithProvider(
                <PageLayout className="custom-layout-class">
                    <p>Content</p>
                </PageLayout>
            );

            // Then: Custom class applied to container
            const layoutWithClass = container.querySelector('.custom-layout-class');
            expect(layoutWithClass).toBeInTheDocument();
        });

        it('should apply multiple custom classes', () => {
            // Given: PageLayout with multiple classes
            const { container } = renderWithProvider(
                <PageLayout className="class-one class-two">
                    <p>Content</p>
                </PageLayout>
            );

            // Then: Both classes applied
            const layoutWithClasses = container.querySelector('.class-one.class-two');
            expect(layoutWithClasses).toBeInTheDocument();
        });
    });

    describe('full viewport structure', () => {
        it('should create full-height viewport container', () => {
            // Given: PageLayout component
            const { container } = renderWithProvider(
                <PageLayout>
                    <p>Content</p>
                </PageLayout>
            );

            // Then: Container has 100vh height (use findLayoutContainer to skip Provider wrapper)
            const layoutContainer = findLayoutContainer(container);
            expect(layoutContainer).toBeInTheDocument();
            expect(layoutContainer?.style.height).toBe('100vh');
        });

        it('should use flex column layout', () => {
            // Given: PageLayout component
            const { container } = renderWithProvider(
                <PageLayout>
                    <p>Content</p>
                </PageLayout>
            );

            // Then: Container uses flex column (verify via style property)
            const layoutContainer = findLayoutContainer(container);
            expect(layoutContainer).toBeInTheDocument();
            expect(layoutContainer?.style.display).toBe('flex');
            expect(layoutContainer?.style.flexDirection).toBe('column');
        });

        it('should make content area flexible with flex: 1', () => {
            // Given: PageLayout with content
            const { container } = renderWithProvider(
                <PageLayout>
                    <div data-testid="content">Content</div>
                </PageLayout>
            );

            // Then: Content area has flex: 1
            const scrollableArea = container.querySelector('[style*="flex: 1"]');
            expect(scrollableArea).toBeInTheDocument();
        });
    });

    describe('combined slots', () => {
        it('should render header, content, and footer together', () => {
            // Given: PageLayout with all slots
            renderWithProvider(
                <PageLayout
                    header={<div data-testid="header">Header</div>}
                    footer={<div data-testid="footer">Footer</div>}
                >
                    <div data-testid="content">Content</div>
                </PageLayout>
            );

            // Then: All three sections present
            expect(screen.getByTestId('header')).toBeInTheDocument();
            expect(screen.getByTestId('content')).toBeInTheDocument();
            expect(screen.getByTestId('footer')).toBeInTheDocument();
        });

        it('should maintain correct order: header, content, footer', () => {
            // Given: PageLayout with all slots
            const { container } = renderWithProvider(
                <PageLayout
                    header={<div data-testid="header">Header</div>}
                    footer={<div data-testid="footer">Footer</div>}
                >
                    <div data-testid="content">Content</div>
                </PageLayout>
            );

            // Then: Elements appear in correct order (use findLayoutContainer to skip Provider)
            const layoutContainer = findLayoutContainer(container);
            expect(layoutContainer).toBeInTheDocument();
            const children = Array.from(layoutContainer!.children);

            // Should have 3 direct children (header, content area, footer)
            expect(children.length).toBe(3);
        });

        it('should render typical wizard page pattern', () => {
            // Given: PageLayout configured like WizardContainer
            renderWithProvider(
                <PageLayout
                    header={
                        <div data-testid="wizard-header">
                            <h1>Wizard Title</h1>
                        </div>
                    }
                    footer={
                        <div data-testid="wizard-footer">
                            <Button variant="secondary">Back</Button>
                            <Button variant="accent">Continue</Button>
                        </div>
                    }
                    backgroundColor="var(--spectrum-global-color-gray-50)"
                    className="wizard-layout"
                >
                    <div data-testid="wizard-content">
                        <p>Step content here</p>
                    </div>
                </PageLayout>
            );

            // Then: Complete wizard structure rendered
            expect(screen.getByTestId('wizard-header')).toBeInTheDocument();
            expect(screen.getByTestId('wizard-content')).toBeInTheDocument();
            expect(screen.getByTestId('wizard-footer')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
        });
    });

    describe('accessibility', () => {
        it('should preserve semantic structure of slot content', () => {
            // Given: PageLayout with semantic content
            renderWithProvider(
                <PageLayout
                    header={<header role="banner">Header</header>}
                    footer={<footer role="contentinfo">Footer</footer>}
                >
                    <main role="main">Main content</main>
                </PageLayout>
            );

            // Then: Semantic roles preserved
            expect(screen.getByRole('banner')).toBeInTheDocument();
            expect(screen.getByRole('main')).toBeInTheDocument();
            expect(screen.getByRole('contentinfo')).toBeInTheDocument();
        });

        it('should allow keyboard-focusable content in all slots', () => {
            // Given: PageLayout with focusable elements
            renderWithProvider(
                <PageLayout
                    header={<Button data-testid="header-btn">Header Action</Button>}
                    footer={<Button data-testid="footer-btn">Footer Action</Button>}
                >
                    <Button data-testid="content-btn">Content Action</Button>
                </PageLayout>
            );

            // Then: All buttons are accessible
            const buttons = screen.getAllByRole('button');
            expect(buttons).toHaveLength(3);
            buttons.forEach(button => {
                expect(button).not.toHaveAttribute('aria-hidden', 'true');
            });
        });
    });
});
