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

jest.mock('@/features/dashboard/ui/components/demo-package/DemoPackageModal', () => ({
    DemoPackageModal: () => <div role="dialog" aria-label="Save as demo package" />,
}));

const DEMO = { name: 'Isle5 by Jen', source: { owner: 'jen', repo: 'isle5-demo' }, storefrontKind: 'eds' as const };
const PAGES = "The Isle5 by Jen demo's pages can't be reached right now.";
const GUIDANCE = "If it moved, change the source. If it's gone for good, save this project as your own demo package.";
const UNREACHABLE = "The Isle5 by Jen demo's repository can't be reached. Reset and updates are unavailable until it is.";

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

    it('offers Save as demo package beside Change source on an Edge Delivery project, and says which fits when', async () => {
        renderDashboard({ demo: DEMO, isEds: true });
        emitWarning();

        const banner = await screen.findByTestId('demo-source-banner');
        expect(banner).toHaveTextContent(GUIDANCE);
        expect(screen.getByRole('button', { name: 'Change source' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save as demo package' }));
        expect(screen.getByRole('dialog', { name: 'Save as demo package' })).toBeInTheDocument();
    });

    it('offers only Change source on a headless project, which cannot be saved as a demo package', async () => {
        renderDashboard({ demo: { ...DEMO, storefrontKind: 'headless' as const } });
        emitWarning();

        const banner = await screen.findByTestId('demo-source-banner');
        expect(banner).not.toHaveTextContent(GUIDANCE);
        expect(screen.getByRole('button', { name: 'Change source' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Save as demo package' })).not.toBeInTheDocument();
    });

    it('names the pages, not the source, when only the pages are out of reach, and offers no Save', async () => {
        renderDashboard({ demo: DEMO, isEds: true });
        ctx.triggerMessage('checkResult', {
            checkId: 'demo-source',
            status: 'warning',
            message: PAGES,
            data: { demoName: 'Isle5 by Jen', unreachable: false, contentUnreachable: true },
        });

        const banner = await screen.findByTestId('demo-source-banner');
        expect(banner).toHaveTextContent("This demo's pages can't be reached");
        expect(banner).not.toHaveTextContent("This demo's source can't be reached");
        expect(banner).toHaveTextContent(PAGES);
        expect(screen.queryByRole('button', { name: 'Save as demo package' })).not.toBeInTheDocument();
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
