/**
 * projectPanelPushes: the only way an already-open project panel learns anything,
 * so each push is asserted on the exact message it posts — a payload that loses its
 * field renders an empty tile with no error anywhere. Moved here from the dashboard
 * command's suites with the functions (2026-10-07).
 */

import type * as vscode from 'vscode';
import { BaseWebviewCommand } from '@/core/base/baseWebviewCommand';
import {
    sendAppBuilderComponentStatusUpdate,
    sendAppBuilderComponentsSnapshot,
    sendAuthoringExperienceUpdate,
    sendMeshStatusUpdate,
    sendProjectDestinationUpdate,
} from '@/features/dashboard/services/projectPanelPushes';

afterEach(() => {
    jest.restoreAllMocks();
});

describe('push channels', () => {
    /** Make the given panel id the only live one. */
    function livePanel(id: string): jest.Mock {
        const postMessage = jest.fn().mockResolvedValue(true);
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockImplementation((wanted: string) =>
            wanted === id
                ? ({ webview: { postMessage } } as unknown as vscode.WebviewPanel)
                : undefined
        );
        return postMessage;
    }

    it('posts the destination crumb to whichever project panel is live', async () => {
        const postMessage = livePanel('demoBuilder.integrations');

        await sendProjectDestinationUpdate({
            projectTitle: 'Acme',
            workspaceTitle: 'Stage',
        });

        expect(postMessage).toHaveBeenCalledWith({
            type: 'projectDestinationUpdate',
            payload: { destination: { projectTitle: 'Acme', workspaceTitle: 'Stage' } },
        });
    });

    it('is a silent no-op when no project panel is live', async () => {
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

        await expect(
            sendProjectDestinationUpdate({
                projectTitle: 'Acme',
                workspaceTitle: 'Stage',
            })
        ).resolves.toBeUndefined();
    });

    it('posts the mesh status with its message and endpoint', async () => {
        const postMessage = livePanel('demoBuilder.projectDashboard');

        await sendMeshStatusUpdate(
            'deployed',
            'Mesh is live',
            'https://mesh.test/graphql'
        );

        expect(postMessage).toHaveBeenCalledWith({
            type: 'meshStatusUpdate',
            payload: {
                status: 'deployed',
                message: 'Mesh is live',
                endpoint: 'https://mesh.test/graphql',
            },
        });
    });

    it('does not post mesh status when no panel is live', async () => {
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

        await expect(
            sendMeshStatusUpdate('deployed')
        ).resolves.toBeUndefined();
    });

    it('posts a per-row status update carrying the row id and its new name', async () => {
        const postMessage = livePanel('demoBuilder.projectDashboard');

        await sendAppBuilderComponentStatusUpdate(
            'erp-sync',
            'deployed',
            'Deployed',
            'ERP Sync'
        );

        expect(postMessage).toHaveBeenCalledWith({
            type: 'appBuilderComponentStatusUpdate',
            payload: {
                id: 'erp-sync',
                status: 'deployed',
                message: 'Deployed',
                name: 'ERP Sync',
            },
        });
    });

    it('does not post a row status update when no panel is live', async () => {
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

        await expect(
            sendAppBuilderComponentStatusUpdate(
                'erp-sync',
                'deployed'
            )
        ).resolves.toBeUndefined();
    });

    it('posts the full components map, not an empty envelope', async () => {
        const postMessage = livePanel('demoBuilder.projectDashboard');
        const components = {
            'erp-sync': {
                kind: 'integration' as const,
                status: 'deployed' as const,
                source: { owner: 'acme', repo: 'erp' },
            },
        };

        await sendAppBuilderComponentsSnapshot(components);

        expect(postMessage).toHaveBeenCalledWith({
            type: 'appBuilderComponentsSnapshot',
            payload: { components },
        });
    });
});

describe('sendAuthoringExperienceUpdate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
    });

    it('posts an authoringExperienceUpdate message carrying just the new DA URL', async () => {
        // Given: An active dashboard panel
        const mockPostMessage = jest.fn().mockResolvedValue(true);
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue({
            webview: { postMessage: mockPostMessage },
        } as unknown as vscode.WebviewPanel);

        // When: An authoring-experience flip pushes its update (the tile label
        // is static — only the live DA URL rides on the message now)
        await sendAuthoringExperienceUpdate(
            'https://da.live/canvas#/my-org/my-site/index',
        );

        // Then: The exact message shape is posted to the active panel
        expect(BaseWebviewCommand.getActivePanel).toHaveBeenCalledWith('demoBuilder.projectDashboard');
        expect(mockPostMessage).toHaveBeenCalledWith({
            type: 'authoringExperienceUpdate',
            payload: {
                edsDaLiveUrl: 'https://da.live/canvas#/my-org/my-site/index',
            },
        });
    });

    it('does nothing when there is no active panel', async () => {
        // Given: No active dashboard panel
        jest.spyOn(BaseWebviewCommand, 'getActivePanel').mockReturnValue(undefined);

        // When/Then: Sending does not throw
        await expect(
            sendAuthoringExperienceUpdate('https://da.live/x'),
        ).resolves.toBeUndefined();
    });
});

/** A panel stub that records what was posted to it. */
function makePanel() {
    const postMessage = jest.fn().mockResolvedValue(true);
    const panel = { webview: { postMessage } } as unknown as vscode.WebviewPanel;
    return { panel, postMessage };
}

const DASHBOARD_ID = 'demoBuilder.projectDashboard';
const INTEGRATIONS_ID = 'demoBuilder.integrations';


describe('push-channel targeting', () => {
    // The live push channels were addressed to the PROJECT DASHBOARD panel only.
    // Opening the dedicated integrations surface is a tab REPLACEMENT — the dashboard
    // panel is disposed — so those pushes would silently reach nobody. The senders
    // resolve whichever project-scoped panel is live.
    let mockGetActivePanel: jest.SpyInstance;
    beforeEach(() => {
        mockGetActivePanel = jest
            .spyOn(BaseWebviewCommand, 'getActivePanel')
            .mockReturnValue(undefined);
    });

    describe('when only the dashboard panel is live (unchanged behaviour)', () => {
        it('posts the components snapshot to the dashboard', async () => {
            const { panel, postMessage } = makePanel();
            mockGetActivePanel.mockImplementation((id: string) =>
                id === DASHBOARD_ID ? panel : undefined
            );

            await sendAppBuilderComponentsSnapshot({});

            expect(postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'appBuilderComponentsSnapshot' })
            );
        });

        it('posts a per-id status update to the dashboard', async () => {
            const { panel, postMessage } = makePanel();
            mockGetActivePanel.mockImplementation((id: string) =>
                id === DASHBOARD_ID ? panel : undefined
            );

            await sendAppBuilderComponentStatusUpdate(
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

            await sendAppBuilderComponentsSnapshot({
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

            await sendAppBuilderComponentStatusUpdate(
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

            await sendMeshStatusUpdate('deployed');

            expect(postMessage).toHaveBeenCalled();
        });
    });

    it('is a no-op when neither panel is live', async () => {
        await expect(
            sendAppBuilderComponentsSnapshot({})
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

        await sendAppBuilderComponentsSnapshot({});

        expect(dash.postMessage).toHaveBeenCalledTimes(1);
        expect(integrations.postMessage).not.toHaveBeenCalled();
    });
});
