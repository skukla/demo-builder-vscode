/**
 * Tests for ProjectDashboardScreen back navigation
 *
 * Tests that the dashboard renders a back navigation link and handles clicks.
 */

// Mock webviewClient - must be before imports due to hoisting
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        onMessage: jest.fn().mockReturnValue(() => {}),
    },
}));

// Mock React Spectrum Provider context (required for Spectrum components)
jest.mock('@adobe/react-spectrum', () => ({
    View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Flex: ({ children, ...props }: any) => <div style={{ display: 'flex' }} {...props}>{children}</div>,
    Heading: ({ children, level, ...props }: any) => {
        const Tag = `h${level || 1}` as keyof JSX.IntrinsicElements;
        return <Tag {...props}>{children}</Tag>;
    },
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    Button: ({ children, onPress, variant, isDisabled, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} data-variant={variant} data-testid="back-button" {...props}>{children}</button>
    ),
    ActionButton: ({ children, onPress, isQuiet, isDisabled, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} {...props}>{children}</button>
    ),
    Divider: () => <hr />,
    ProgressCircle: () => <div data-testid="progress-circle" />,
}));

// Mock Spectrum icons
jest.mock('@spectrum-icons/workflow/ChevronLeft', () => ({
    __esModule: true,
    default: ({ size }: any) => <span data-testid="chevron-left-icon" data-size={size}>{'<'}</span>,
}));

jest.mock('@spectrum-icons/workflow/PlayCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="play-icon" />,
}));

jest.mock('@spectrum-icons/workflow/StopCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="stop-icon" />,
}));

jest.mock('@spectrum-icons/workflow/Settings', () => ({
    __esModule: true,
    default: () => <span data-testid="settings-icon" />,
}));

jest.mock('@spectrum-icons/workflow/Refresh', () => ({
    __esModule: true,
    default: () => <span data-testid="refresh-icon" />,
}));

jest.mock('@spectrum-icons/workflow/Globe', () => ({
    __esModule: true,
    default: () => <span data-testid="globe-icon" />,
}));

jest.mock('@spectrum-icons/workflow/Delete', () => ({
    __esModule: true,
    default: () => <span data-testid="delete-icon" />,
}));

jest.mock('@spectrum-icons/workflow/ViewList', () => ({
    __esModule: true,
    default: () => <span data-testid="viewlist-icon" />,
}));

jest.mock('@spectrum-icons/workflow/DataMapping', () => ({
    __esModule: true,
    default: () => <span data-testid="datamapping-icon" />,
}));

jest.mock('@spectrum-icons/workflow/Data', () => ({
    __esModule: true,
    default: () => <span data-testid="data-icon" />,
}));

jest.mock('@spectrum-icons/workflow/Login', () => ({
    __esModule: true,
    default: () => <span data-testid="login-icon" />,
}));

// Mock hooks
jest.mock('@/core/ui/hooks', () => ({
    useFocusTrap: () => ({ current: null }),
}));

// Mock StatusCard and GridLayout
jest.mock('@/core/ui/components/feedback', () => ({
    StatusCard: ({ label, status, color }: any) => (
        <div data-testid={`status-card-${label}`} data-color={color}>{label}: {status}</div>
    ),
}));

jest.mock('@/core/ui/components/layout', () => ({
    GridLayout: ({ children }: any) => <div data-testid="grid-layout">{children}</div>,
    PageLayout: ({ header, children }: any) => (
        <div data-testid="page-layout">
            <div data-testid="page-layout-header">{header}</div>
            <div data-testid="page-layout-content">{children}</div>
        </div>
    ),
    PageHeader: ({ title, subtitle }: any) => (
        <div data-testid="page-header">
            <h1>{title}</h1>
            {subtitle && <h3>{subtitle}</h3>}
        </div>
    ),
}));

// Mock dashboardPredicates
jest.mock('@/features/dashboard/ui/dashboardPredicates', () => ({
    isStartActionDisabled: () => false,
}));

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ProjectDashboardScreen } from '@/features/dashboard/ui/ProjectDashboardScreen';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

const mockPostMessage = webviewClient.postMessage as jest.Mock;

describe('ProjectDashboardScreen - Back Navigation', () => {
    const mockProject = {
        name: 'Test Project',
        path: '/test/path',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Back navigation link rendering', () => {
        it('should render "All Projects" back navigation link', () => {
            // Given: A project dashboard screen
            render(<ProjectDashboardScreen project={mockProject} />);

            // Then: The back navigation link should be visible
            const backLink = screen.getByText('All Projects');
            expect(backLink).toBeInTheDocument();
        });

        it('should render back button in status section', () => {
            // Given: A project dashboard screen
            render(<ProjectDashboardScreen project={mockProject} />);

            // Then: Back button should be in the content area (status section)
            const content = screen.getByTestId('page-layout-content');
            const backButton = screen.getByTestId('back-button');
            expect(content).toContainElement(backButton);
        });

        it('should render back button with secondary variant', () => {
            // Given: A project dashboard screen
            render(<ProjectDashboardScreen project={mockProject} />);

            // Then: Back button should use secondary variant (matching design system)
            const backButton = screen.getByTestId('back-button');
            expect(backButton).toHaveAttribute('data-variant', 'secondary');
        });
    });

    describe('Back navigation click handling', () => {
        it('should send navigateBack message when clicked', () => {
            // Given: A project dashboard screen
            render(<ProjectDashboardScreen project={mockProject} />);

            // When: User clicks the back link
            const backLink = screen.getByText('All Projects');
            fireEvent.click(backLink);

            // Then: navigateBack message should be sent
            expect(mockPostMessage).toHaveBeenCalledWith('navigateBack');
        });

        it('should only send one navigateBack message per click', () => {
            // Given: A project dashboard screen
            render(<ProjectDashboardScreen project={mockProject} />);

            // When: User clicks the back link
            const backLink = screen.getByText('All Projects');
            fireEvent.click(backLink);

            // Then: Only one navigateBack message should be sent
            const navigateBackCalls = mockPostMessage.mock.calls.filter(
                (call: unknown[]) => call[0] === 'navigateBack'
            );
            expect(navigateBackCalls).toHaveLength(1);
        });
    });

    describe('Back navigation accessibility', () => {
        it('should be a clickable button element', () => {
            // Given: A project dashboard screen
            render(<ProjectDashboardScreen project={mockProject} />);

            // Then: Back link should be a button
            const backButton = screen.getByText('All Projects').closest('button');
            expect(backButton).toBeInTheDocument();
        });

        it('should be keyboard accessible', () => {
            // Given: A project dashboard screen
            render(<ProjectDashboardScreen project={mockProject} />);

            // Then: Back button should be focusable and clickable via keyboard
            const backButton = screen.getByText('All Projects').closest('button');
            expect(backButton).not.toBeDisabled();
        });
    });

    describe('Status section back button', () => {
        it('should render back button in status section', () => {
            // Given: A project dashboard screen
            render(<ProjectDashboardScreen project={mockProject} />);

            // Then: Back button should be rendered in content area
            const content = screen.getByTestId('page-layout-content');
            const backButton = screen.getByTestId('back-button');
            expect(content).toContainElement(backButton);
        });

        it('should display "All Projects" label on back button', () => {
            // Given: A project dashboard screen
            render(<ProjectDashboardScreen project={mockProject} />);

            // Then: Back button should display "All Projects" label
            const backButton = screen.getByTestId('back-button');
            expect(backButton).toHaveTextContent('All Projects');
        });
    });
});
