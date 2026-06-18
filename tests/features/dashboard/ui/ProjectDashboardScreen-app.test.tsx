/**
 * ProjectDashboardScreen - App Builder Card Integration
 *
 * Verifies the dashboard renders the App Builder card when the project carries
 * an app (initialApp prop) and that the card reflects live `appStatusUpdate`
 * messages from the dashboard status channel.
 */

import { screen, waitFor } from '@testing-library/react';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';

describe('ProjectDashboardScreen - App Builder Card', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    it('does not render the App Builder card when there is no Adobe context and no app', () => {
        renderDashboard();
        expect(screen.queryByText(/Add an App Builder app/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /redeploy/i })).not.toBeInTheDocument();
    });

    it('renders the "Add an App Builder app" entry point when the project has Adobe context but no app', () => {
        renderDashboard({ hasAdobeContext: true });
        // No-app state: the add affordance + URL input must be reachable so the
        // user can attach an app (otherwise the card is a chicken-and-egg dead end).
        expect(screen.getByText(/Add an App Builder app/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /redeploy/i })).not.toBeInTheDocument();
    });

    it('renders the deployed App Builder card when initialApp is deployed', () => {
        renderDashboard({
            initialApp: { status: 'deployed', url: 'https://app.example.com', deployedUrls: { 'web/app': 'https://app.example.com' } },
        });
        expect(screen.getByRole('button', { name: /redeploy/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    });

    it('updates the card from an appStatusUpdate message', async () => {
        renderDashboard({ initialApp: { status: 'not-deployed' } });

        ctx.triggerMessage('appStatusUpdate', { status: 'deploying', message: 'Running aio app deploy' });

        await waitFor(() => {
            expect(screen.getByText(/running aio app deploy/i)).toBeInTheDocument();
        });
    });
});
