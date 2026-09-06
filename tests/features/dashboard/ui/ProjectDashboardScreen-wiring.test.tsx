/**
 * ProjectDashboardScreen — the wiring the screen itself owns
 *
 * The sibling suites assert what the dashboard SHOWS. This one asserts the
 * decisions the screen makes on the way there: the arguments it hands its
 * collaborators (the focus trap, the Start predicate), the props it captures on
 * first render and then refuses to change, and the two derived disabled flags.
 *
 * Written for the mutation burn-down (PL-22): each block below is a decision
 * that nothing constrained, so flipping it left every suite green.
 */

import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
    setupTestContext,
    renderDashboard,
    type TestContext,
} from './ProjectDashboardScreen.testUtils';
import { useFocusTrap } from '@/core/ui/hooks/useFocusTrap';
import { isStartActionDisabled } from '@/features/dashboard/ui/dashboardPredicates';

const mockFocusTrap = useFocusTrap as unknown as jest.Mock;
const mockIsStartActionDisabled = isStartActionDisabled as unknown as jest.Mock;

/** The webview stub installed by the shared mock wall. */
function client() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@/core/ui/utils/WebviewClient').webviewClient;
}

describe('ProjectDashboardScreen - screen-owned wiring', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        mockIsStartActionDisabled.mockReturnValue(false);
        ctx = setupTestContext();
    });

    describe('Collaborator arguments', () => {
        it('contains focus without stealing it (the focus-trap options)', () => {
            renderDashboard();

            // autoFocus false is the load-bearing half: the dashboard opens with
            // focus where the user left it, and the trap only stops focus
            // ESCAPING the panel (WCAG 2.1 AA).
            expect(mockFocusTrap).toHaveBeenCalledWith({
                enabled: true,
                autoFocus: false,
                containFocus: true,
            });
        });

        it('asks the Start predicate about "ready" before any status has arrived', () => {
            renderDashboard();

            // The `status || 'ready'` default is the screen's decision, and it is
            // invisible in the rendered output because the predicate answers the
            // same either way — so the ARGUMENTS are the assertion.
            expect(mockIsStartActionDisabled).toHaveBeenCalledWith(false, undefined, 'ready');
        });

        it('passes the REAL status to the Start predicate once one arrives', () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'stopped',
            });

            expect(mockIsStartActionDisabled).toHaveBeenLastCalledWith(false, undefined, 'stopped');
        });
    });

    describe('Derived disabled flags', () => {
        it('disables Configure while the mesh is busy', () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
            });
            ctx.triggerMessage('meshStatusUpdate', { status: 'deploying' });

            expect(screen.getByText('Configure').closest('button')).toBeDisabled();
        });

        it('leaves Configure enabled once the mesh settles', () => {
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
            });
            ctx.triggerMessage('meshStatusUpdate', { status: 'deployed' });

            expect(screen.getByText('Configure').closest('button')).not.toBeDisabled();
        });

        it('disables the Stop tile while a stop is in flight', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            renderDashboard();

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'running',
            });
            await user.click(screen.getByText('Stop'));

            // isTransitioning is the whole of isStopDisabled: the tile only shows
            // "Stop" while isRunning, and isRunning comes from the same payload as
            // status, so `status === 'stopping'` could never be read here.
            expect(screen.getByText('Stop').closest('button')).toBeDisabled();
            expect(client().postMessage).toHaveBeenCalledWith('stopDemo');
        });
    });

    describe('Props captured on first render', () => {
        it('keeps the EDS surface once isEds arrives, even if a later render drops it', () => {
            const { rerenderWith } = renderDashboard({ isEds: false });
            expect(screen.queryByText('Author Content')).not.toBeInTheDocument();

            rerenderWith({ isEds: true });
            expect(screen.getByText('Author Content')).toBeInTheDocument();

            rerenderWith({ isEds: false });
            expect(screen.getByText('Author Content')).toBeInTheDocument();
        });

        it('adopts an EDS live URL that only arrives on a later render', () => {
            const { rerenderWith } = renderDashboard({ isEds: true });

            rerenderWith({ isEds: true, edsLiveUrl: 'https://first.example.com' });
            fireEvent.click(screen.getByText('Open in Browser'));

            expect(client().postMessage).toHaveBeenCalledWith('openLiveSite', {
                url: 'https://first.example.com',
            });
        });

        it('keeps the FIRST live URL when a later render supplies a different one', () => {
            const { rerenderWith } = renderDashboard({
                isEds: true,
                edsLiveUrl: 'https://first.example.com',
            });

            rerenderWith({ isEds: true, edsLiveUrl: 'https://second.example.com' });
            fireEvent.click(screen.getByText('Open in Browser'));

            expect(client().postMessage).toHaveBeenCalledWith('openLiveSite', {
                url: 'https://first.example.com',
            });
        });
    });

    describe('Subtitle and mesh gating', () => {
        it('drops the separator when only one of package/stack is known', () => {
            renderDashboard({ stackName: 'Headless + PaaS' });

            // `[undefined, stack].join(' · ')` would render " · Headless + PaaS";
            // the filter is what keeps the leading separator off.
            expect(screen.getByText('Headless + PaaS')).toBeInTheDocument();
        });

        it('ignores mesh health entirely when the project has no mesh', () => {
            renderDashboard({ hasAdobeContext: true, appBuilderComponents: {} });

            ctx.triggerMessage('statusUpdate', {
                name: 'Test Project',
                path: '/test/path',
                status: 'ready',
            });
            ctx.triggerMessage('meshStatusUpdate', { status: 'error' });

            // hasMesh defaults to false, so a mesh status the project does not own
            // must not colour the integrations dot — there would be nothing behind
            // it on the surface.
            expect(screen.queryByTestId('integrations-tile-dot')).not.toBeInTheDocument();
        });
    });

    describe('Capabilities modal lifecycle', () => {
        const VERIFY_OK = {
            status: 'ok',
            checks: [{ name: 'skill-files', status: 'ok' }],
            inventory: { skills: [], mcps: [], sessionMcps: [] },
        };

        /** Open the modal from the masthead link. */
        async function openModal() {
            ctx.triggerMessage('checkResult', {
                checkId: 'ai-verify',
                status: 'ok',
                data: VERIFY_OK,
            });
            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-view-capabilities-trigger'));
            });
        }

        it('starts closed', () => {
            renderDashboard();

            expect(screen.queryByTestId('ai-capabilities-modal')).not.toBeInTheDocument();
        });

        it('closes on the modal\'s own Close action', async () => {
            renderDashboard();
            await openModal();

            await act(async () => {
                fireEvent.click(screen.getByTestId('ai-capabilities-modal-close'));
            });

            expect(screen.queryByTestId('ai-capabilities-modal')).not.toBeInTheDocument();
        });

        it('closes when the dialog container dismisses it (Esc / click-away)', async () => {
            renderDashboard();
            await openModal();

            await act(async () => {
                fireEvent.click(screen.getByTestId('dialog-dismiss'));
            });

            expect(screen.queryByTestId('ai-capabilities-modal')).not.toBeInTheDocument();
        });

        it('hands live regenerate progress to the modal', async () => {
            renderDashboard();
            await openModal();

            act(() => {
                ctx.triggerMessage('creationProgress', {
                    currentOperation: 'Writing skills',
                    message: 'skills',
                    progress: 40,
                });
            });

            expect(screen.getByTestId('ai-capabilities-modal')).toHaveAttribute(
                'data-progress-operation',
                'Writing skills'
            );
        });
    });
});
