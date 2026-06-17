/**
 * ProjectDashboardScreen - Org Context (badge + banner) Tests
 *
 * Org-context is surfaced two ways, both fed by the async `orgContextResult`
 * message ({ pending } → { pending:false, orgMismatch?, currentOrg }):
 *  - the "IMS Org" STATUS BADGE — ambient health: blue "Checking…" → green with
 *    the org name (ok) / red with the (wrong) org name (mismatch). Shown only for
 *    Adobe projects.
 *  - the mismatch BANNER — the actionable half: appears only on mismatch with a
 *    forced "Switch IMS Org" recovery (+ a no-loop tab hint after a failed switch).
 */

import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';

/** Past the org-check minimum-display gate (FRONTEND_TIMEOUTS.ORG_CHECK_MIN_DISPLAY = 700ms). */
const advancePastOrgCheckGate = () => act(() => { jest.advanceTimersByTime(1000); });

const ORG_MISMATCH = { expectedOrg: 'org-A', expectedOrgName: 'CitiSignal Org', currentOrg: 'Org B' };

describe('ProjectDashboardScreen - Org Context (badge + banner)', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    /** Emit the async org-check result messages (with the current org name). */
    const emitOrgMismatch = () =>
        ctx.triggerMessage('orgContextResult', { pending: false, orgMismatch: ORG_MISMATCH, currentOrg: 'Org B' });
    const emitOrgOk = () =>
        ctx.triggerMessage('orgContextResult', { pending: false, currentOrg: 'Project Org' });

    /** The "IMS Org" status badge element, if present. */
    const imsOrgBadge = () => screen.queryByTestId('status-card-IMS Org');

    /** Render with Adobe context, resolve to a mismatch, and wait for the banner. */
    const showMismatchBanner = async () => {
        renderDashboard({ hasAdobeContext: true });
        emitOrgMismatch();
        advancePastOrgCheckGate();
        await screen.findByText(/Switch IMS Org/i);
    };

    it('shows a blue "Checking…" IMS Org badge before the check resolves', () => {
        renderDashboard({ hasAdobeContext: true });

        const badge = imsOrgBadge();
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveTextContent(/Checking/i);
        expect(badge).toHaveAttribute('data-color', 'blue');
        // No banner while checking.
        expect(screen.queryByText(/Switch IMS Org/i)).not.toBeInTheDocument();
    });

    it('holds checking until the min-display gate, then shows a red badge + banner on mismatch', async () => {
        renderDashboard({ hasAdobeContext: true });

        emitOrgMismatch();
        // Held until the gate so the check is perceived, not flashed.
        expect(imsOrgBadge()).toHaveTextContent(/Checking/i);
        expect(screen.queryByText(/Switch IMS Org/i)).not.toBeInTheDocument();

        advancePastOrgCheckGate();

        await waitFor(() => {
            expect(screen.getByText(/Switch IMS Org/i)).toBeInTheDocument();
        });
        // Badge turns red and names the (wrong) org.
        expect(imsOrgBadge()).toHaveAttribute('data-color', 'red');
        expect(imsOrgBadge()).toHaveTextContent(/Org B/);
    });

    it('resolves to a green IMS Org badge (no banner) when the org is reachable', async () => {
        renderDashboard({ hasAdobeContext: true });

        emitOrgOk();
        advancePastOrgCheckGate();

        await waitFor(() => {
            expect(imsOrgBadge()).toHaveAttribute('data-color', 'green');
        });
        expect(imsOrgBadge()).toHaveTextContent(/Project Org/);
        expect(screen.queryByText(/Switch IMS Org/i)).not.toBeInTheDocument();
    });

    it('shows no IMS Org badge or banner for a project without an Adobe org', async () => {
        renderDashboard();

        emitOrgOk();

        await waitFor(() => {
            expect(screen.queryByText(/Switch IMS Org/i)).not.toBeInTheDocument();
        });
        expect(imsOrgBadge()).not.toBeInTheDocument();
    });

    it('renders the warning banner, names the current org, and offers a switch action on mismatch', async () => {
        await showMismatchBanner();

        expect(screen.getByText(/Wrong Adobe organization/i)).toBeInTheDocument();
        // Banner message names BOTH the current org and the project's expected org.
        expect(screen.getByText(/You're signed into Org B, but this project was created in CitiSignal Org/i)).toBeInTheDocument();
        expect(screen.queryByText(/another browser tab/i)).not.toBeInTheDocument();
    });

    it('posts switchOrg when the switch action is clicked', async () => {
        await showMismatchBanner();

        fireEvent.click(screen.getByText(/Switch IMS Org/i));

        expect(ctx.mockPostMessage).toHaveBeenCalledWith('switchOrg');
    });

    it('shows the no-loop tab hint when still mismatched after a switch attempt', async () => {
        await showMismatchBanner();

        fireEvent.click(screen.getByText(/Switch IMS Org/i));

        // The forced switch landed in the wrong org again (re-check still mismatched).
        emitOrgMismatch();

        await waitFor(() => {
            expect(screen.getByText(/another browser tab/i)).toBeInTheDocument();
        });
    });

    it('replaces the banner with a green badge when the org resolves OK after recovery', async () => {
        await showMismatchBanner();

        emitOrgOk();

        await waitFor(() => {
            expect(screen.queryByText(/Switch IMS Org/i)).not.toBeInTheDocument();
        });
        expect(imsOrgBadge()).toHaveAttribute('data-color', 'green');
        expect(imsOrgBadge()).toHaveTextContent(/Project Org/);
    });
});
