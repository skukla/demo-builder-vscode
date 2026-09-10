/**
 * ProjectDashboardScreen - Back Navigation Tests
 *
 * The mock wall lives in `ProjectDashboardScreen.testUtils` with the other six
 * suites of this screen. This one carried its own copy of 21 of those 23 mocks
 * until 2026-09-02 — it was the only sibling that never adopted the shared file,
 * and the clone ledger found it duplicating a helper sitting beside it.
 *
 * The two below are genuinely its own: no other suite renders the icons that the
 * back-navigation row does.
 */

jest.mock('@spectrum-icons/workflow/DataMapping', () => ({
    __esModule: true,
    default: () => <span data-testid="datamapping-icon" />,
}));

import { fireEvent, screen } from '@testing-library/react';
import { renderDashboard } from './ProjectDashboardScreen.testUtils';
import { asDisplayName } from '@/core/utils/projectDisplayName';

/** The stub the shared mock wall installs on the webview client. */
const mockPostMessage = webviewClient.postMessage as jest.Mock;
import { webviewClient } from '@/core/ui/utils/WebviewClient';

describe('ProjectDashboardScreen - Back Navigation', () => {
    const mockProject = {
        name: asDisplayName('Test Project'),
        path: '/test/path',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Back navigation link rendering', () => {
        it('should render "All Projects" back navigation link', () => {
            // Given: A project dashboard screen
            renderDashboard({ project: mockProject });

            // Then: The back navigation link should be visible
            const backLink = screen.getByText('All Projects');
            expect(backLink).toBeInTheDocument();
        });

        it('should render back button in status section', () => {
            // Given: A project dashboard screen
            renderDashboard({ project: mockProject });

            // Then: Back button should be in the content area (status section)
            const content = screen.getByTestId('page-layout-content');
            const backButton = screen.getByTestId('back-button');
            expect(content).toContainElement(backButton);
        });

        it('should render back button with secondary variant', () => {
            // Given: A project dashboard screen
            renderDashboard({ project: mockProject });

            // Then: Back button should use secondary variant (matching design system)
            const backButton = screen.getByTestId('back-button');
            expect(backButton).toHaveAttribute('data-variant', 'secondary');
        });
    });

    describe('Back navigation click handling', () => {
        it('should send navigateBack message when clicked', () => {
            // Given: A project dashboard screen
            renderDashboard({ project: mockProject });

            // When: User clicks the back link
            const backLink = screen.getByText('All Projects');
            fireEvent.click(backLink);

            // Then: navigateBack message should be sent
            expect(mockPostMessage).toHaveBeenCalledWith('navigateBack');
        });

        it('should only send one navigateBack message per click', () => {
            // Given: A project dashboard screen
            renderDashboard({ project: mockProject });

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
            renderDashboard({ project: mockProject });

            // Then: Back link should be a button
            const backButton = screen.getByText('All Projects').closest('button');
            expect(backButton).toBeInTheDocument();
        });

        it('should be keyboard accessible', () => {
            // Given: A project dashboard screen
            renderDashboard({ project: mockProject });

            // Then: Back button should be focusable and clickable via keyboard
            const backButton = screen.getByText('All Projects').closest('button');
            expect(backButton).not.toBeDisabled();
        });
    });

    describe('Status section back button', () => {
        it('should render back button in status section', () => {
            // Given: A project dashboard screen
            renderDashboard({ project: mockProject });

            // Then: Back button should be rendered in content area
            const content = screen.getByTestId('page-layout-content');
            const backButton = screen.getByTestId('back-button');
            expect(content).toContainElement(backButton);
        });

        it('should display "All Projects" label on back button', () => {
            // Given: A project dashboard screen
            renderDashboard({ project: mockProject });

            // Then: Back button should display "All Projects" label
            const backButton = screen.getByTestId('back-button');
            expect(backButton).toHaveTextContent('All Projects');
        });
    });
});
