import React from 'react';
import { renderWithProviders, screen, createMockIcon } from '../../../utils/react-test-utils';
import { EmptyState } from '@/webview-ui/shared/components/feedback/EmptyState';

const MockCustomIcon = createMockIcon('Custom');

describe('EmptyState', () => {
    describe('Rendering', () => {
        it('renders with required title and description', () => {
            renderWithProviders(
                <EmptyState
                    title="No Projects Found"
                    description="Create a project to get started"
                />
            );
            expect(screen.getByText('No Projects Found')).toBeInTheDocument();
            expect(screen.getByText('Create a project to get started')).toBeInTheDocument();
        });

        it('renders default AlertCircle icon', () => {
            const { container } = renderWithProviders(
                <EmptyState title="Empty" description="No data" />
            );
            expect(container.querySelector('svg')).toBeInTheDocument();
        });

        it('renders custom icon when provided', () => {
            renderWithProviders(
                <EmptyState
                    title="Empty"
                    description="No data"
                    icon={<MockCustomIcon />}
                />
            );
            expect(screen.getByTestId('icon-Custom')).toBeInTheDocument();
        });
    });

    describe('Icon Color', () => {
        it('uses default yellow color', () => {
            const { container } = renderWithProviders(
                <EmptyState title="Empty" description="No data" />
            );
            const icon = container.querySelector('.text-yellow-600');
            expect(icon).toBeInTheDocument();
        });

        it('applies custom icon color', () => {
            const { container } = renderWithProviders(
                <EmptyState
                    title="Empty"
                    description="No data"
                    iconColor="text-blue-600"
                />
            );
            const icon = container.querySelector('.text-blue-600');
            expect(icon).toBeInTheDocument();
        });
    });

    describe('Layout', () => {
        it('centers content by default', () => {
            const { container } = renderWithProviders(
                <EmptyState title="Empty" description="No data" />
            );
            // Check for centered container
            const flexContainer = container.querySelector('[style*="justify-content"]');
            expect(flexContainer).toBeInTheDocument();
        });

        it('does not center when centered is false', () => {
            renderWithProviders(
                <EmptyState
                    title="Empty"
                    description="No data"
                    centered={false}
                />
            );
            expect(screen.getByText('Empty')).toBeInTheDocument();
        });
    });

    describe('Text Content', () => {
        it('renders title in strong tag', () => {
            renderWithProviders(
                <EmptyState title="No Data" description="Description" />
            );
            const title = screen.getByText('No Data');
            expect(title.tagName).toBe('STRONG');
        });

        it('renders description in small text', () => {
            const { container } = renderWithProviders(
                <EmptyState title="Title" description="Description text" />
            );
            const description = screen.getByText('Description text');
            expect(description).toHaveClass('text-sm');
        });

        it('handles long descriptions', () => {
            const longDescription = 'This is a very long description that explains the empty state in great detail and provides helpful guidance to the user about what they should do next.';
            renderWithProviders(
                <EmptyState title="Empty" description={longDescription} />
            );
            expect(screen.getByText(longDescription)).toBeInTheDocument();
        });
    });

    describe('Well Container', () => {
        it('renders content inside Well component', () => {
            const { container } = renderWithProviders(
                <EmptyState title="Empty" description="No data" />
            );
            // Well component should be present (Spectrum component)
            expect(container.firstChild).toBeInTheDocument();
        });
    });

    describe('Common Use Cases', () => {
        it('renders "No Projects Found" state', () => {
            renderWithProviders(
                <EmptyState
                    title="No Projects Found"
                    description="No projects found in organization. Please create a project in Adobe Console first."
                />
            );
            expect(screen.getByText('No Projects Found')).toBeInTheDocument();
            expect(screen.getByText(/Please create a project/)).toBeInTheDocument();
        });

        it('renders "No Workspaces" state', () => {
            renderWithProviders(
                <EmptyState
                    title="No Workspaces"
                    description="This project has no workspaces. Create one in Adobe Console."
                />
            );
            expect(screen.getByText('No Workspaces')).toBeInTheDocument();
        });

        it('renders "No Results" state', () => {
            renderWithProviders(
                <EmptyState
                    title="No Results"
                    description="Try adjusting your search criteria"
                />
            );
            expect(screen.getByText('No Results')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has proper text hierarchy', () => {
            renderWithProviders(
                <EmptyState
                    title="Empty State"
                    description="Description text"
                />
            );
            const title = screen.getByText('Empty State');
            const description = screen.getByText('Description text');
            expect(title.tagName).toBe('STRONG');
            expect(description).toBeInTheDocument();
        });

        it('icon has proper structure', () => {
            const { container } = renderWithProviders(
                <EmptyState title="Empty" description="No data" />
            );
            const icon = container.querySelector('svg');
            expect(icon).toBeInTheDocument();
        });
    });

    describe('Complex Scenarios', () => {
        it('renders with all custom options', () => {
            renderWithProviders(
                <EmptyState
                    title="Custom Empty State"
                    description="This is a custom empty state with all options"
                    icon={<MockCustomIcon />}
                    iconColor="text-blue-500"
                    centered={false}
                />
            );

            expect(screen.getByText('Custom Empty State')).toBeInTheDocument();
            expect(screen.getByText('This is a custom empty state with all options')).toBeInTheDocument();
            expect(screen.getByTestId('icon-Custom')).toBeInTheDocument();
        });

        it('updates when props change', () => {
            const { rerender } = renderWithProviders(
                <EmptyState title="First" description="First description" />
            );
            expect(screen.getByText('First')).toBeInTheDocument();

            rerender(
                <EmptyState title="Second" description="Second description" />
            );
            expect(screen.getByText('Second')).toBeInTheDocument();
            expect(screen.queryByText('First')).not.toBeInTheDocument();
        });
    });

    describe('Memoization', () => {
        it('is memoized component', () => {
            expect(EmptyState).toHaveProperty('$$typeof');
        });
    });
});
