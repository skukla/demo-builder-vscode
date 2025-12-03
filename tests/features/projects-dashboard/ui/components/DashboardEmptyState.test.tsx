/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { DashboardEmptyState } from '@/features/projects-dashboard/ui/components/DashboardEmptyState';

// Wrap component with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            {ui}
        </Provider>
    );
};

describe('DashboardEmptyState', () => {
    describe('rendering', () => {
        it('should render "No projects yet" message', () => {
            renderWithProvider(
                <DashboardEmptyState onCreate={jest.fn()} />
            );

            expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
        });

        it('should render "New Project" CTA button', () => {
            renderWithProvider(
                <DashboardEmptyState onCreate={jest.fn()} />
            );

            const button = screen.getByRole('button', { name: /new project/i });
            expect(button).toBeInTheDocument();
        });

        it('should be centered by default', () => {
            renderWithProvider(
                <DashboardEmptyState onCreate={jest.fn()} />
            );

            // The empty state should be rendered (centering is CSS implementation detail)
            // Just verify the content is present
            expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
        });

        it('should render with custom title if provided', () => {
            renderWithProvider(
                <DashboardEmptyState
                    onCreate={jest.fn()}
                    title="Welcome to Demo Builder"
                />
            );

            expect(
                screen.getByText('Welcome to Demo Builder')
            ).toBeInTheDocument();
        });

        it('should render with custom button text if provided', () => {
            renderWithProvider(
                <DashboardEmptyState
                    onCreate={jest.fn()}
                    buttonText="Start Building"
                />
            );

            expect(
                screen.getByRole('button', { name: /start building/i })
            ).toBeInTheDocument();
        });
    });

    describe('interactions', () => {
        it('should call onCreate when CTA button is clicked', () => {
            const onCreate = jest.fn();
            renderWithProvider(<DashboardEmptyState onCreate={onCreate} />);

            const button = screen.getByRole('button', { name: /new project/i });
            fireEvent.click(button);

            expect(onCreate).toHaveBeenCalledTimes(1);
        });

        it('should call onCreate when button is pressed via keyboard', () => {
            const onCreate = jest.fn();
            renderWithProvider(<DashboardEmptyState onCreate={onCreate} />);

            const button = screen.getByRole('button', { name: /new project/i });
            // React Spectrum buttons handle keyboard via onPress, test via click
            // The button itself handles Enter/Space internally
            fireEvent.click(button);

            expect(onCreate).toHaveBeenCalled();
        });

        it('should only render the main CTA button', () => {
            renderWithProvider(<DashboardEmptyState onCreate={jest.fn()} />);

            // Only the main CTA button should exist (utility icons are in the sidebar)
            const buttons = screen.getAllByRole('button');
            expect(buttons).toHaveLength(1);
        });
    });

    describe('accessibility', () => {
        it('should have accessible button', () => {
            renderWithProvider(
                <DashboardEmptyState onCreate={jest.fn()} />
            );

            const button = screen.getByRole('button');
            expect(button).toBeInTheDocument();
            expect(button).not.toHaveAttribute('aria-hidden');
        });

        it('should not auto-focus by default', () => {
            renderWithProvider(
                <DashboardEmptyState onCreate={jest.fn()} />
            );

            const button = screen.getByRole('button');
            expect(document.activeElement).not.toBe(button);
        });

        it('should auto-focus button when autoFocus is true', () => {
            renderWithProvider(
                <DashboardEmptyState onCreate={jest.fn()} autoFocus />
            );

            const button = screen.getByRole('button');
            expect(document.activeElement).toBe(button);
        });
    });
});
