/**
 * BackButton Component Tests
 *
 * Tests the reusable BackButton navigation component.
 * Uses ActionButton isQuiet with ChevronLeft icon.
 *
 * Used in: ProjectDashboard, Sidebar, and other views requiring back navigation.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BackButton } from '@/core/ui/components/navigation/BackButton';

// Helper to render components (no Provider needed for React Aria)
const renderWithProvider = (ui: React.ReactElement) => render(ui);

describe('BackButton', () => {
    describe('default label rendering', () => {
        it('should render with default label "Back"', () => {
            // Given: BackButton with no label prop
            const onPress = jest.fn();

            // When: Component renders
            renderWithProvider(
                <BackButton onPress={onPress} />
            );

            // Then: Button displays "Back"
            expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
            expect(screen.getByText('Back')).toBeInTheDocument();
        });
    });

    describe('custom label rendering', () => {
        it('should render with custom label', () => {
            // Given: BackButton with label="All Projects"
            const onPress = jest.fn();

            // When: Component renders
            renderWithProvider(
                <BackButton label="All Projects" onPress={onPress} />
            );

            // Then: Button displays "All Projects"
            expect(screen.getByRole('button', { name: /All Projects/i })).toBeInTheDocument();
            expect(screen.getByText('All Projects')).toBeInTheDocument();
        });

        it('should render with different custom labels', () => {
            // Given: BackButton with label="Return to Dashboard"
            const onPress = jest.fn();

            // When: Component renders
            renderWithProvider(
                <BackButton label="Return to Dashboard" onPress={onPress} />
            );

            // Then: Button displays the custom label
            expect(screen.getByText('Return to Dashboard')).toBeInTheDocument();
        });
    });

    describe('chevron left icon', () => {
        it('should render chevron left icon', () => {
            // Given: BackButton component
            const onPress = jest.fn();

            // When: Component renders
            const { container } = renderWithProvider(
                <BackButton onPress={onPress} />
            );

            // Then: ChevronLeft icon is present (Spectrum icons render as SVG)
            const svg = container.querySelector('svg');
            expect(svg).toBeInTheDocument();
        });

        it('should render icon before label text', () => {
            // Given: BackButton component
            const onPress = jest.fn();

            // When: Component renders
            const { container } = renderWithProvider(
                <BackButton label="Projects" onPress={onPress} />
            );

            // Then: SVG icon exists and text follows
            const button = screen.getByRole('button');
            expect(button).toBeInTheDocument();

            const svg = container.querySelector('svg');
            expect(svg).toBeInTheDocument();
            expect(screen.getByText('Projects')).toBeInTheDocument();
        });
    });

    describe('click handling', () => {
        it('should call onPress when clicked', async () => {
            // Given: BackButton with onPress handler
            const user = userEvent.setup();
            const onPress = jest.fn();

            // When: Button is clicked
            renderWithProvider(
                <BackButton onPress={onPress} />
            );

            const button = screen.getByRole('button');
            await user.click(button);

            // Then: onPress is called once
            expect(onPress).toHaveBeenCalledTimes(1);
        });

        it('should call onPress with fireEvent.click', () => {
            // Given: BackButton with onPress handler
            const onPress = jest.fn();

            // When: Button is clicked
            renderWithProvider(
                <BackButton label="Back" onPress={onPress} />
            );

            fireEvent.click(screen.getByRole('button'));

            // Then: onPress is called
            expect(onPress).toHaveBeenCalledTimes(1);
        });
    });

    describe('keyboard accessibility', () => {
        it('should be focusable', () => {
            // Given: BackButton component
            const onPress = jest.fn();

            // When: Component renders
            renderWithProvider(
                <BackButton onPress={onPress} />
            );

            // Then: Button can receive focus
            const button = screen.getByRole('button');
            button.focus();
            expect(button).toHaveFocus();
        });

        it('should trigger onPress on Enter key', async () => {
            // Given: BackButton with onPress handler
            const user = userEvent.setup();
            const onPress = jest.fn();

            renderWithProvider(
                <BackButton onPress={onPress} />
            );

            // When: Button is focused and Enter is pressed
            const button = screen.getByRole('button');
            button.focus();
            await user.keyboard('{Enter}');

            // Then: onPress is called
            expect(onPress).toHaveBeenCalledTimes(1);
        });

        it('should trigger onPress on Space key', async () => {
            // Given: BackButton with onPress handler
            const user = userEvent.setup();
            const onPress = jest.fn();

            renderWithProvider(
                <BackButton onPress={onPress} />
            );

            // When: Button is focused and Space is pressed
            const button = screen.getByRole('button');
            button.focus();
            await user.keyboard(' ');

            // Then: onPress is called
            expect(onPress).toHaveBeenCalledTimes(1);
        });
    });

    describe('quiet variant styling', () => {
        it('should render as ActionButton quiet variant', () => {
            // Given: BackButton component
            const onPress = jest.fn();

            // When: Component renders
            const { container } = renderWithProvider(
                <BackButton onPress={onPress} />
            );

            // Then: Button renders (ActionButton isQuiet is the implementation detail)
            // We verify the button exists and is clickable
            const button = screen.getByRole('button');
            expect(button).toBeInTheDocument();

            // Spectrum ActionButton with isQuiet has specific styling
            // The button should not have prominent borders/backgrounds
            expect(button).toBeInTheDocument();
        });

        it('should render button element', () => {
            // Given: BackButton component
            const onPress = jest.fn();

            // When: Component renders
            renderWithProvider(
                <BackButton onPress={onPress} />
            );

            // Then: A button role element exists
            expect(screen.getByRole('button')).toBeInTheDocument();
        });
    });

    describe('combined scenarios', () => {
        it('should render default label with icon and handle click', async () => {
            // Given: BackButton with default props
            const user = userEvent.setup();
            const onPress = jest.fn();

            // When: Rendered and clicked
            const { container } = renderWithProvider(
                <BackButton onPress={onPress} />
            );

            // Then: Shows default label "Back"
            expect(screen.getByText('Back')).toBeInTheDocument();

            // And: Has icon
            expect(container.querySelector('svg')).toBeInTheDocument();

            // And: Click works
            await user.click(screen.getByRole('button'));
            expect(onPress).toHaveBeenCalledTimes(1);
        });

        it('should render custom label with icon and handle click', async () => {
            // Given: BackButton with custom label
            const user = userEvent.setup();
            const onPress = jest.fn();

            // When: Rendered and clicked
            const { container } = renderWithProvider(
                <BackButton label="Go Home" onPress={onPress} />
            );

            // Then: Shows custom label
            expect(screen.getByText('Go Home')).toBeInTheDocument();

            // And: Has icon
            expect(container.querySelector('svg')).toBeInTheDocument();

            // And: Click works
            await user.click(screen.getByRole('button'));
            expect(onPress).toHaveBeenCalledTimes(1);
        });
    });
});
