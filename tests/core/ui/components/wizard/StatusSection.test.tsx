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
import { StatusSection } from '@/core/ui/components/wizard/StatusSection';

// Helper to render with Spectrum Provider
const renderWithProvider = (ui: React.ReactElement) => {
    return render(<Provider theme={defaultTheme}>{ui}</Provider>);
};

describe('StatusSection', () => {
    describe('label rendering', () => {
        it('renders the label text', () => {
            renderWithProvider(
                <StatusSection label="Test Label" value="Test Value" status="completed" />
            );

            expect(screen.getByText('Test Label')).toBeInTheDocument();
        });

        it('applies uppercase styling to label', () => {
            renderWithProvider(
                <StatusSection label="Test Label" value="Test Value" status="completed" />
            );

            const labelElement = screen.getByText('Test Label');
            expect(labelElement).toHaveClass('text-uppercase');
        });
    });

    describe('completed status', () => {
        it('renders value text when completed, in the neutral (non-error) style', () => {
            renderWithProvider(
                <StatusSection label="Organization" value="Adobe Inc" status="completed" />
            );

            // The red styling is reserved for status="error". Every other status
            // reads neutral, so the value must NOT carry the error colour.
            const value = screen.getByText('Adobe Inc');
            expect(value).toHaveClass('text-sm');
            expect(value).not.toHaveClass('text-red-600');
        });

        it('renders the checkmark icon, not the clock or the alert, when completed', () => {
            const { container } = renderWithProvider(
                <StatusSection label="Organization" value="Adobe Inc" status="completed" />
            );

            // WHICH icon, not merely that one rendered: the three icons differ only
            // by their colour class in the DOM, and asserting "an svg exists" let a
            // completed row render the pending clock with nothing failing.
            expect(container.querySelector('svg')).toHaveClass('text-green-600');
        });

        it('renders description in its own small muted line beneath the value', () => {
            renderWithProvider(
                <StatusSection
                    label="Project"
                    value="My Project"
                    description="A test project"
                    status="completed"
                />
            );

            expect(screen.getByText('My Project')).toBeInTheDocument();
            // The styled element is what proves the guarded <Text> rendered it —
            // a bare string in the same place still reads as present.
            expect(screen.getByText('A test project')).toHaveClass('text-xs', 'text-gray-600');
        });
    });

    describe('empty status', () => {
        it('renders default empty text when no value', () => {
            renderWithProvider(<StatusSection label="Organization" status="empty" />);

            expect(screen.getByText('Not selected')).toBeInTheDocument();
        });

        it('renders custom empty text when provided', () => {
            renderWithProvider(
                <StatusSection label="Organization" status="empty" emptyText="Not authenticated" />
            );

            expect(screen.getByText('Not authenticated')).toBeInTheDocument();
        });

        it('does not render icon when empty', () => {
            const { container } = renderWithProvider(
                <StatusSection label="Organization" status="empty" />
            );

            // No icon should be present
            const svg = container.querySelector('svg');
            expect(svg).not.toBeInTheDocument();
        });

        it('does not render value when empty', () => {
            renderWithProvider(
                <StatusSection label="Organization" value="Should not appear" status="empty" />
            );

            expect(screen.queryByText('Should not appear')).not.toBeInTheDocument();
        });
    });

    describe('checking status', () => {
        it('renders default checking text', () => {
            renderWithProvider(<StatusSection label="Organization" status="checking" />);

            expect(screen.getByText('Checking...')).toBeInTheDocument();
        });

        it('renders custom status text when provided', () => {
            renderWithProvider(
                <StatusSection label="Organization" status="checking" statusText="Switching..." />
            );

            expect(screen.getByText('Switching...')).toBeInTheDocument();
        });

        it('renders the clock icon when checking', () => {
            const { container } = renderWithProvider(
                <StatusSection label="Organization" status="checking" />
            );

            expect(container.querySelector('svg')).toHaveClass('text-blue-600');
        });
    });

    describe('pending status', () => {
        it('renders the clock icon when pending — the same one checking shows', () => {
            const { container } = renderWithProvider(
                <StatusSection label="Project" value="Pending Project" status="pending" />
            );

            // pending shares the checking case's clock. If that shared return goes
            // missing, both fall through to the error alert and read red.
            expect(container.querySelector('svg')).toHaveClass('text-blue-600');
        });

        it('renders value when pending', () => {
            renderWithProvider(
                <StatusSection label="Project" value="Pending Project" status="pending" />
            );

            expect(screen.getByText('Pending Project')).toBeInTheDocument();
        });
    });

    describe('error status', () => {
        it('renders the alert icon when error', () => {
            const { container } = renderWithProvider(
                <StatusSection label="Connection" value="Failed to connect" status="error" />
            );

            expect(container.querySelector('svg')).toHaveClass('text-red-600');
        });

        it('renders status text when provided', () => {
            renderWithProvider(
                <StatusSection label="Connection" status="error" statusText="Connection failed" />
            );

            expect(screen.getByText('Connection failed')).toBeInTheDocument();
        });

        it('applies error text styling', () => {
            renderWithProvider(
                <StatusSection label="Connection" value="Error message" status="error" />
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
                <StatusSection label="Organization" value="Adobe Inc" status="completed" />
            );

            // Should render both label and value text accessibly
            expect(screen.getByText('Organization')).toBeInTheDocument();
            expect(screen.getByText('Adobe Inc')).toBeInTheDocument();
        });
    });

    describe('edge cases', () => {
        it('handles empty string value', () => {
            renderWithProvider(<StatusSection label="Organization" value="" status="completed" />);

            // Should render the empty string (not fall back to empty state)
            const label = screen.getByText('Organization');
            expect(label).toBeInTheDocument();
        });

        it('handles undefined value with non-empty status', () => {
            renderWithProvider(<StatusSection label="Organization" status="completed" />);

            // Should not crash, should render something
            expect(screen.getByText('Organization')).toBeInTheDocument();
        });

        it('handles long values gracefully', () => {
            const longValue = 'A'.repeat(200);
            renderWithProvider(
                <StatusSection label="Organization" value={longValue} status="completed" />
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
