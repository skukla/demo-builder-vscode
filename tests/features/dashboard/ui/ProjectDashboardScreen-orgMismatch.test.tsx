/**
 * ProjectDashboardScreen - Org Mismatch Banner Tests
 *
 * The proactive org-context check surfaces `orgMismatch` in the status payload
 * when the project's Adobe org isn't reachable by the current token. The
 * dashboard renders a banner naming the org the user is signed into and offers
 * a FORCED "Switch IMS Org" recovery. After a switch attempt that still
 * leaves the user in the wrong org, the banner persists with a no-loop hint
 * about another browser tab.
 */

import { screen, waitFor, fireEvent } from '@testing-library/react';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';

const cleanStatus = {
    name: 'Test Project',
    path: '/test/path',
    status: 'ready' as const,
};

const mismatchStatus = {
    ...cleanStatus,
    orgMismatch: { expectedOrg: 'org-A', currentOrg: 'Org B' },
};

describe('ProjectDashboardScreen - Org Mismatch Banner', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    it('does not render the banner when there is no org mismatch', async () => {
        renderDashboard();

        ctx.triggerMessage('statusUpdate', cleanStatus);

        await waitFor(() => {
            expect(screen.queryByText(/Switch IMS Org/i)).not.toBeInTheDocument();
        });
    });

    it('renders the banner naming the current org and a switch action on mismatch', async () => {
        renderDashboard();

        ctx.triggerMessage('statusUpdate', mismatchStatus);

        await waitFor(() => {
            expect(screen.getByText(/Switch IMS Org/i)).toBeInTheDocument();
        });
        // Names the org the token actually reaches (Org B).
        expect(screen.getByText(/Org B/)).toBeInTheDocument();
        // No "another browser tab" hint until a switch has been attempted.
        expect(screen.queryByText(/another browser tab/i)).not.toBeInTheDocument();
    });

    it('posts switchOrg when the switch action is clicked', async () => {
        renderDashboard();

        ctx.triggerMessage('statusUpdate', mismatchStatus);

        const action = await screen.findByText(/Switch IMS Org/i);
        fireEvent.click(action);

        expect(ctx.mockPostMessage).toHaveBeenCalledWith('switchOrg');
    });

    it('shows the no-loop tab hint when still mismatched after a switch attempt', async () => {
        renderDashboard();

        ctx.triggerMessage('statusUpdate', mismatchStatus);

        const action = await screen.findByText(/Switch IMS Org/i);
        fireEvent.click(action);

        // The forced switch landed in the wrong org again (status re-emitted with mismatch).
        ctx.triggerMessage('statusUpdate', mismatchStatus);

        await waitFor(() => {
            expect(screen.getByText(/another browser tab/i)).toBeInTheDocument();
        });
    });

    it('clears the banner when a clean status arrives after recovery', async () => {
        renderDashboard();

        ctx.triggerMessage('statusUpdate', mismatchStatus);
        await screen.findByText(/Switch IMS Org/i);

        ctx.triggerMessage('statusUpdate', cleanStatus);

        await waitFor(() => {
            expect(screen.queryByText(/Switch IMS Org/i)).not.toBeInTheDocument();
        });
    });
});
