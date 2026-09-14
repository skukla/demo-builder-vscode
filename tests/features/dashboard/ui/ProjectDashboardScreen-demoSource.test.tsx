/**
 * ProjectDashboardScreen — a project built on an added demo.
 *
 * The demo-source check's warning shows the notice with the check's own
 * sentence; "Change source" (the notice's button and the overflow item) opens
 * the Add a demo package dialog in its change mode, and a change re-requests status so
 * the check re-runs. Without a demo row there is no door at all.
 */

import { screen, fireEvent } from '@testing-library/react';
import { setupTestContext, renderDashboard, TestContext } from './ProjectDashboardScreen.testUtils';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

jest.mock('@/features/project-creation/ui/components/add-demo/AddDemoModal', () => ({
    AddDemoModal: ({ mode, currentKind, onDemoAdded, onClose }: any) => (
        <div data-testid="change-source-dialog" data-mode={mode} data-kind={currentKind}>
            <button onClick={() => onDemoAdded({})}>commit</button>
            <button onClick={onClose}>close</button>
        </div>
    ),
}));

const DEMO = { name: 'Isle5 by Jen', source: { owner: 'jen', repo: 'isle5-demo' }, storefrontKind: 'eds' as const };
const UNREACHABLE = "jen's demo can't be reached. Reset and updates are unavailable until it is.";

describe('ProjectDashboardScreen - added demo source', () => {
    let ctx: TestContext;

    beforeEach(() => {
        jest.clearAllMocks();
        ctx = setupTestContext();
    });

    const emitWarning = () =>
        ctx.triggerMessage('checkResult', {
            checkId: 'demo-source',
            status: 'warning',
            message: UNREACHABLE,
            data: { demoName: 'Isle5 by Jen', unreachable: true, contentUnreachable: true },
        });

    it('shows nothing until the check warns, then the sentence with a Change source button', async () => {
        renderDashboard({ demo: DEMO });
        expect(screen.queryByTestId('demo-source-banner')).not.toBeInTheDocument();

        emitWarning();

        const banner = await screen.findByTestId('demo-source-banner');
        expect(banner).toHaveTextContent("This demo's source can't be reached");
        expect(banner).toHaveTextContent(UNREACHABLE);
        expect(screen.getByRole('button', { name: 'Change source' })).toBeInTheDocument();
    });

    it('clears the notice when the check comes back ok', async () => {
        renderDashboard({ demo: DEMO });
        emitWarning();
        await screen.findByTestId('demo-source-banner');

        ctx.triggerMessage('checkResult', { checkId: 'demo-source', status: 'ok' });

        expect(screen.queryByTestId('demo-source-banner')).not.toBeInTheDocument();
    });

    it("opens the dialog in change mode for the project's kind, and re-requests status after a change", async () => {
        renderDashboard({ demo: DEMO });
        expect(screen.queryByTestId('change-source-dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Change Demo Source'));

        const dialog = screen.getByTestId('change-source-dialog');
        expect(dialog).toHaveAttribute('data-mode', 'change');
        expect(dialog).toHaveAttribute('data-kind', 'eds');

        fireEvent.click(screen.getByText('commit'));
        expect(webviewClient.postMessage).toHaveBeenCalledWith('requestStatus');

        fireEvent.click(screen.getByText('close'));
        expect(screen.queryByTestId('change-source-dialog')).not.toBeInTheDocument();
    });

    it('offers no door for a project built on a shipped brand', async () => {
        renderDashboard({});
        expect(screen.queryByText('Change Demo Source')).not.toBeInTheDocument();

        emitWarning();

        expect(screen.queryByRole('button', { name: 'Change source' })).not.toBeInTheDocument();
    });
});
