/**
 * StatusSection Component Tests
 *
 * Tests the shared status display section component used across wizard steps
 * for consistent configuration summary display.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import { StatusSection } from '@/core/ui/components/wizard';

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(
        <Provider theme={defaultTheme}>
            {ui}
        </Provider>
    );
};

describe('StatusSection', () => {
    describe('label rendering', () => {
        it('renders the label text', () => {
            renderWithProvider(
                <StatusSection
                    label="Test Label"
                    value="Test Value"
                    status="completed"
                />
            );

            expect(screen.getByText('Test Label')).toBeInTheDocument();
        });

        it('applies uppercase styling to label', () => {
            const { container } = renderWithProvider(
                <StatusSection
                    label="Test Label"
                    value="Test Value"
                    status="completed"
                />
            );

            const labelElement = screen.getByText('Test Label');
            expect(labelElement).toHaveClass('text-uppercase');
        });
    });

    describe('completed status', () => {
        it('renders value text when completed', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    value="Adobe Inc"
                    status="completed"
                />
            );

            expect(screen.getByText('Adobe Inc')).toBeInTheDocument();
        });

        it('renders checkmark icon when completed', () => {
            const { container } = renderWithProvider(
                <StatusSection
                    label="Organization"
                    value="Adobe Inc"
                    status="completed"
                />
            );

            // CheckmarkCircle icon should be present
            const svg = container.querySelector('svg');
            expect(svg).toBeInTheDocument();
        });

        it('renders description when provided', () => {
            renderWithProvider(
                <StatusSection
                    label="Project"
                    value="My Project"
                    description="A test project"
                    status="completed"
                />
            );

            expect(screen.getByText('My Project')).toBeInTheDocument();
            expect(screen.getByText('A test project')).toBeInTheDocument();
        });
    });

    describe('empty status', () => {
        it('renders default empty text when no value', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    status="empty"
                />
            );

            expect(screen.getByText('Not selected')).toBeInTheDocument();
        });

        it('renders custom empty text when provided', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    status="empty"
                    emptyText="Not authenticated"
                />
            );

            expect(screen.getByText('Not authenticated')).toBeInTheDocument();
        });

        it('does not render icon when empty', () => {
            const { container } = renderWithProvider(
                <StatusSection
                    label="Organization"
                    status="empty"
                />
            );

            // No icon should be present
            const svg = container.querySelector('svg');
            expect(svg).not.toBeInTheDocument();
        });

        it('does not render value when empty', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    value="Should not appear"
                    status="empty"
                />
            );

            expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
        });
    });

    describe('checking status', () => {
        it('renders default checking text', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    status="checking"
                />
            );

            expect(screen.getByText('Checking...')).toBeInTheDocument();
        });

        it('renders custom status text when provided', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    status="checking"
                    statusText="Switching..."
                />
            );

            expect(screen.getByText('Switching...')).toBeInTheDocument();
        });

        it('renders clock icon when checking', () => {
            const { container } = renderWithProvider(
                <StatusSection
                    label="Organization"
                    status="checking"
                />
            );

            // Clock icon should be present
            const svg = container.querySelector('svg');
            expect(svg).toBeInTheDocument();
        });
    });

    describe('pending status', () => {
        it('renders clock icon when pending', () => {
            const { container } = renderWithProvider(
                <StatusSection
                    label="Project"
                    value="Pending Project"
                    status="pending"
                />
            );

            // Clock icon should be present
            const svg = container.querySelector('svg');
            expect(svg).toBeInTheDocument();
        });

        it('renders value when pending', () => {
            renderWithProvider(
                <StatusSection
                    label="Project"
                    value="Pending Project"
                    status="pending"
                />
            );

            expect(screen.getByText('Pending Project')).toBeInTheDocument();
        });
    });

    describe('error status', () => {
        it('renders alert icon when error', () => {
            const { container } = renderWithProvider(
                <StatusSection
                    label="Connection"
                    value="Failed to connect"
                    status="error"
                />
            );

            // AlertCircle icon should be present
            const svg = container.querySelector('svg');
            expect(svg).toBeInTheDocument();
        });

        it('renders status text when provided', () => {
            renderWithProvider(
                <StatusSection
                    label="Connection"
                    status="error"
                    statusText="Connection failed"
                />
            );

            expect(screen.getByText('Connection failed')).toBeInTheDocument();
        });

        it('applies error text styling', () => {
            renderWithProvider(
                <StatusSection
                    label="Connection"
                    value="Error message"
                    status="error"
                />
            );

            const errorText = screen.getByText('Error message');
            expect(errorText).toHaveClass('text-red-600');
        });
    });

    describe('statusText override', () => {
        it('uses statusText instead of value when provided for completed status', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    value="Original Value"
                    statusText="Custom Text"
                    status="completed"
                />
            );

            expect(screen.getByText('Custom Text')).toBeInTheDocument();
            expect(screen.queryByText('Original Value')).not.toBeInTheDocument();
        });

        it('uses statusText for pending status', () => {
            renderWithProvider(
                <StatusSection
                    label="Project"
                    value="Original Value"
                    statusText="Processing..."
                    status="pending"
                />
            );

            expect(screen.getByText('Processing...')).toBeInTheDocument();
            expect(screen.queryByText('Original Value')).not.toBeInTheDocument();
        });
    });

    describe('accessibility', () => {
        it('renders semantic HTML structure with text content', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    value="Adobe Inc"
                    status="completed"
                />
            );

            // Should render both label and value text accessibly
            expect(screen.getByText('Organization')).toBeInTheDocument();
            expect(screen.getByText('Adobe Inc')).toBeInTheDocument();
        });
    });

    describe('edge cases', () => {
        it('handles empty string value', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    value=""
                    status="completed"
                />
            );

            // Should render the empty string (not fall back to empty state)
            const label = screen.getByText('Organization');
            expect(label).toBeInTheDocument();
        });

        it('handles undefined value with non-empty status', () => {
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    status="completed"
                />
            );

            // Should not crash, should render something
            expect(screen.getByText('Organization')).toBeInTheDocument();
        });

        it('handles long values gracefully', () => {
            const longValue = 'A'.repeat(200);
            renderWithProvider(
                <StatusSection
                    label="Organization"
                    value={longValue}
                    status="completed"
                />
            );

            expect(screen.getByText(longValue)).toBeInTheDocument();
        });

        it('handles long descriptions gracefully', () => {
            const longDescription = 'B'.repeat(300);
            renderWithProvider(
                <StatusSection
                    label="Project"
                    value="Short Value"
                    description={longDescription}
                    status="completed"
                />
            );

            expect(screen.getByText(longDescription)).toBeInTheDocument();
        });
    });
});
