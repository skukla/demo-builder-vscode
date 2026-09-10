/**
 * ProjectDashboardWebviewCommand — push-channel targeting
 *
 * The live push channels (mesh status, per-id component status, the components
 * snapshot) were addressed to the PROJECT DASHBOARD panel only. Opening the
 * dedicated integrations surface is a tab REPLACEMENT — the dashboard panel is
 * disposed — so those pushes would silently reach nobody and the grid would
 * never flip status or land an added card.
 *
 * The senders now resolve whichever project-scoped panel is live.
 *
 * Strict TDD: written BEFORE the resolver exists.
 */


const mockGetActivePanel = jest.fn();
jest.mock('@/core/base/baseWebviewCommand', () => ({
    BaseWebviewCommand: class {
        static getActivePanel: (...a: unknown[]) => unknown = (...a) => mockGetActivePanel(...a);
        static startWebviewTransition = jest.fn();
        static endWebviewTransition = jest.fn();
    },
}));

import { ProjectDashboardWebviewCommand } from '@/features/dashboard/commands/showDashboard';

/** A panel stub that records what was posted to it. */
function makePanel() {
    const postMessage = jest.fn().mockResolvedValue(true);
    return { panel: { webview: { postMessage } }, postMessage };
}

const DASHBOARD_ID = 'demoBuilder.projectDashboard';
const INTEGRATIONS_ID = 'demoBuilder.integrations';

beforeEach(() => {
    jest.clearAllMocks();
    mockGetActivePanel.mockReturnValue(undefined);
});

describe('push-channel targeting', () => {
    describe('when only the dashboard panel is live (unchanged behaviour)', () => {
        it('posts the components snapshot to the dashboard', async () => {
            const { panel, postMessage } = makePanel();
            mockGetActivePanel.mockImplementation((id: string) =>
                id === DASHBOARD_ID ? panel : undefined
            );

            await ProjectDashboardWebviewCommand.sendAppBuilderComponentsSnapshot({});

            expect(postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appBuilderComponentsSnapshot' })
            );
        });

        it('posts a per-id status update to the dashboard', async () => {
            const { panel, postMessage } = makePanel();
            mockGetActivePanel.mockImplementation((id: string) =>
                id === DASHBOARD_ID ? panel : undefined
            );

            await ProjectDashboardWebviewCommand.sendAppBuilderComponentStatusUpdate(
                'erp-sync',
                'deployed'
            );

            expect(postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appBuilderComponentStatusUpdate' })
            );
        });
    });

    describe('when the integrations surface is live instead (tab replacement)', () => {
        it('posts the components snapshot to the integrations panel', async () => {
            const { panel, postMessage } = makePanel();
            mockGetActivePanel.mockImplementation((id: string) =>
                id === INTEGRATIONS_ID ? panel : undefined
            );

            await ProjectDashboardWebviewCommand.sendAppBuilderComponentsSnapshot({
                'erp-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'a', repo: 'b' },
                },
            });

            expect(postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appBuilderComponentsSnapshot' })
            );
        });

        it('posts a per-id status update to the integrations panel', async () => {
            const { panel, postMessage } = makePanel();
            mockGetActivePanel.mockImplementation((id: string) =>
                id === INTEGRATIONS_ID ? panel : undefined
            );

            await ProjectDashboardWebviewCommand.sendAppBuilderComponentStatusUpdate(
                'erp-sync',
                'deploying',
                'Cloning…'
            );

            expect(postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appBuilderComponentStatusUpdate' })
            );
        });

        it('posts mesh status to the integrations panel (the mesh peer card)', async () => {
            const { panel, postMessage } = makePanel();
            mockGetActivePanel.mockImplementation((id: string) =>
                id === INTEGRATIONS_ID ? panel : undefined
            );

            await ProjectDashboardWebviewCommand.sendMeshStatusUpdate('deployed');

            expect(postMessage).toHaveBeenCalled();
        });
    });

    it('is a no-op when neither panel is live', async () => {
        await expect(
            ProjectDashboardWebviewCommand.sendAppBuilderComponentsSnapshot({})
        ).resolves.not.toThrow();
    });

    it('prefers the dashboard when BOTH are somehow live (single post, no double render)', async () => {
        const dash = makePanel();
        const integrations = makePanel();
        mockGetActivePanel.mockImplementation((id: string) =>
            id === DASHBOARD_ID
                ? dash.panel
                : id === INTEGRATIONS_ID
                  ? integrations.panel
                  : undefined
        );

        await ProjectDashboardWebviewCommand.sendAppBuilderComponentsSnapshot({});

        expect(dash.postMessage).toHaveBeenCalledTimes(1);
        expect(integrations.postMessage).not.toHaveBeenCalled();
    });
});
