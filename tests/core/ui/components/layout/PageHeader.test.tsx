/**
 * PageHeader Component Tests
 *
 * Tests the PageHeader layout component that provides consistent page headers
 * with title, subtitle, optional action buttons, and back navigation.
 *
 * Used in: ProjectsDashboard, dashboard views, and other page-level screens.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme, Button } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('PageHeader', () => {
    describe('title rendering', () => {
        it('should render title correctly as H1 heading', () => {
            // Given: PageHeader with title="Test Title"
            // When: Component renders
            renderWithProvider(
                <PageHeader title="Test Title" />
            );

            // Then: H1 heading displays "Test Title"
            const heading = screen.getByRole('heading', { level: 1 });
            expect(heading).toHaveTextContent('Test Title');
        });

        it('should render different title values', () => {
            renderWithProvider(
                <PageHeader title="Your Projects" />
            );

            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your Projects');
        });
    });

    describe('subtitle rendering', () => {
        it('should render subtitle when provided', () => {
            // Given: PageHeader with subtitle="Subtitle text"
            // When: Component renders
            renderWithProvider(
                <PageHeader
                    title="Main Title"
                    subtitle="Select a project to manage or create a new one"
                />
            );

            // Then: Subtitle text is displayed
            expect(screen.getByText('Select a project to manage or create a new one')).toBeInTheDocument();
        });

        it('should render subtitle as H3 heading', () => {
            renderWithProvider(
                <PageHeader
                    title="Main Title"
                    subtitle="This is a subtitle"
                />
            );

            const subtitleHeading = screen.getByRole('heading', { level: 3 });
            expect(subtitleHeading).toHaveTextContent('This is a subtitle');
        });

        it('should not render subtitle element when not provided', () => {
            renderWithProvider(
                <PageHeader title="Title Only" />
            );

            // Only H1 should exist, no H3
            expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
            expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
        });
    });

    describe('action button rendering', () => {
        it('should render action button when provided', () => {
            // Given: PageHeader with action={<Button>Action</Button>}
            // When: Component renders
            renderWithProvider(
                <PageHeader
                    title="Page Title"
                    action={<Button variant="accent">New</Button>}
                />
            );

            // Then: Action button appears
            expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
        });

        it('should render any React node as action', () => {
            renderWithProvider(
                <PageHeader
                    title="Page Title"
                    action={<span data-testid="custom-action">Custom Action</span>}
                />
            );

            expect(screen.getByTestId('custom-action')).toBeInTheDocument();
        });

        it('should not render action area when action is not provided', () => {
            const { container } = renderWithProvider(
                <PageHeader title="Title Only" />
            );

            // Check that only the title area is rendered (no sibling for action)
            const buttons = container.querySelectorAll('button');
            expect(buttons).toHaveLength(0);
        });
    });

    describe('back button rendering', () => {
        it('should render back button when backButton prop is provided', () => {
            // Given: PageHeader with backButton={{ label: "Back", onPress: mockFn }}
            const mockOnPress = jest.fn();

            // When: Component renders
            renderWithProvider(
                <PageHeader
                    title="Page Title"
                    backButton={{ label: 'Back', onPress: mockOnPress }}
                />
            );

            // Then: Back button appears
            expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
        });

        it('should call onPress callback when back button is clicked', () => {
            // Given: PageHeader with backButton={{ label: "Back", onPress: mockFn }}
            const mockOnPress = jest.fn();

            renderWithProvider(
                <PageHeader
                    title="Page Title"
                    backButton={{ label: 'Go Back', onPress: mockOnPress }}
                />
            );

            // When: Back button clicked
            const backButton = screen.getByRole('button', { name: 'Go Back' });
            fireEvent.click(backButton);

            // Then: onPress callback fires
            expect(mockOnPress).toHaveBeenCalledTimes(1);
        });

        it('should render back button with custom label', () => {
            renderWithProvider(
                <PageHeader
                    title="Page Title"
                    backButton={{ label: 'Return to Projects', onPress: jest.fn() }}
                />
            );

            expect(screen.getByRole('button', { name: 'Return to Projects' })).toBeInTheDocument();
        });

        it('should not render back button when not provided', () => {
            renderWithProvider(
                <PageHeader title="Title Only" />
            );

            // No back button should be rendered
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });
    });

    describe('width constraint', () => {
        it('should constrain content width when constrainWidth is true', () => {
            // Given: PageHeader with constrainWidth={true}
            const { container } = renderWithProvider(
                <PageHeader
                    title="Page Title"
                    constrainWidth={true}
                />
            );

            // Then: Content wrapped in max-w-800 mx-auto div
            const constrainedDiv = container.querySelector('.max-w-800.mx-auto');
            expect(constrainedDiv).toBeInTheDocument();
        });

        it('should not constrain width when constrainWidth is false', () => {
            // Given: PageHeader with constrainWidth={false}
            const { container } = renderWithProvider(
                <PageHeader
                    title="Page Title"
                    constrainWidth={false}
                />
            );

            // Then: No max-w-800 mx-auto div
            const constrainedDiv = container.querySelector('.max-w-800.mx-auto');
            expect(constrainedDiv).not.toBeInTheDocument();
        });

        it('should not constrain width by default', () => {
            // Given: PageHeader without constrainWidth prop
            const { container } = renderWithProvider(
                <PageHeader title="Page Title" />
            );

            // Then: No max-w-800 mx-auto div (default is false)
            const constrainedDiv = container.querySelector('.max-w-800.mx-auto');
            expect(constrainedDiv).not.toBeInTheDocument();
        });
    });

    describe('styling', () => {
        it('should apply border-b and bg-gray-75 classes', () => {
            const { container } = renderWithProvider(
                <PageHeader title="Page Title" />
            );

            // The header wrapper should have the standard styling classes
            const headerWrapper = container.querySelector('.border-b.bg-gray-75');
            expect(headerWrapper).toBeInTheDocument();
        });

        it('should apply custom className when provided', () => {
            const { container } = renderWithProvider(
                <PageHeader
                    title="Page Title"
                    className="custom-class"
                />
            );

            const headerWithCustomClass = container.querySelector('.custom-class');
            expect(headerWithCustomClass).toBeInTheDocument();
        });
    });

    describe('combined features', () => {
        it('should render all features together', () => {
            const mockBack = jest.fn();
            const mockAction = jest.fn();

            renderWithProvider(
                <PageHeader
                    title="Your Projects"
                    subtitle="Select a project to manage"
                    backButton={{ label: 'Back', onPress: mockBack }}
                    action={<Button variant="accent" onPress={mockAction}>New</Button>}
                    constrainWidth={true}
                />
            );

            // Verify all elements present
            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your Projects');
            expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Select a project to manage');
            expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
        });

        it('should handle interactions correctly when all features present', () => {
            const mockBack = jest.fn();
            const mockAction = jest.fn();

            renderWithProvider(
                <PageHeader
                    title="Your Projects"
                    subtitle="Select a project"
                    backButton={{ label: 'Back', onPress: mockBack }}
                    action={<Button variant="accent" onPress={mockAction}>Create</Button>}
                />
            );

            // Click back button
            fireEvent.click(screen.getByRole('button', { name: 'Back' }));
            expect(mockBack).toHaveBeenCalledTimes(1);

            // Click action button
            fireEvent.click(screen.getByRole('button', { name: 'Create' }));
            expect(mockAction).toHaveBeenCalledTimes(1);
        });
    });

    describe('accessibility', () => {
        it('should have proper heading hierarchy', () => {
            renderWithProvider(
                <PageHeader
                    title="Main Title"
                    subtitle="Subtitle"
                />
            );

            // H1 should come before H3 in the DOM
            const headings = screen.getAllByRole('heading');
            expect(headings[0].tagName).toBe('H1');
            expect(headings[1].tagName).toBe('H3');
        });

        it('should have accessible buttons', () => {
            renderWithProvider(
                <PageHeader
                    title="Title"
                    backButton={{ label: 'Back', onPress: jest.fn() }}
                    action={<Button variant="accent">Action</Button>}
                />
            );

            const buttons = screen.getAllByRole('button');
            buttons.forEach(button => {
                expect(button).not.toHaveAttribute('aria-hidden', 'true');
            });
        });
    });
});
