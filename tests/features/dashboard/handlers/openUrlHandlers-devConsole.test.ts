/**
 * handleOpenDevConsole — which workspace the Developer Console opens on.
 *
 * "Open" on an integration card goes to THAT integration's Adobe workspace
 * (owner, 2026-09-21). Since AB-23 an integration deploys into a workspace of its
 * own, so the project's workspace would be the wrong page. Without an integration
 * named, the dashboard's Dev Console tile still opens the project's.
 *
 * The ids are the real shapes (19-digit Console ids, a numeric org id), because
 * the handler validates them before building the URL.
 */

import * as vscode from 'vscode';
import { handleOpenDevConsole } from '@/features/dashboard/handlers/openUrlHandlers';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const ORG = '285361';
const PROJECT = '4566206088345759588';
const PROJECT_WORKSPACE = '4566206088345806475';
const OWN_WORKSPACE = '4566206088345806999';

function contextFor(project: Project) {
    const stateManager = createMockStateManager();
    stateManager.getCurrentProject.mockResolvedValue(project);
    return createMockHandlerContext({ stateManager });
}

function bodea(): Project {
    return createMockProject({
        adobe: { organization: ORG, projectId: PROJECT, workspace: PROJECT_WORKSPACE, authenticated: true },
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                workspace: { id: OWN_WORKSPACE, name: 'erpintegrationAb12', title: 'ERP Integration' },
            },
            'old-integration': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'old' },
            },
        },
    });
}

/** The URL handed to the browser. */
function opened(): string {
    const [uri] = (vscode.env.openExternal as jest.Mock).mock.calls[0] ?? [];
    return (vscode.Uri.parse as jest.Mock).mock.calls.at(-1)?.[0] ?? String(uri);
}

const workspaceUrl = (workspace: string) =>
    `https://developer.adobe.com/console/projects/${ORG}/${PROJECT}/workspaces/${workspace}/details`;

beforeEach(() => jest.clearAllMocks());

describe('handleOpenDevConsole', () => {
    it("opens an integration's OWN workspace when the card names it", async () => {
        await expect(
            handleOpenDevConsole(contextFor(bodea()), { componentId: 'erp-integration' }),
        ).resolves.toEqual({ success: true });

        expect(opened()).toBe(workspaceUrl(OWN_WORKSPACE));
    });

    it('opens the project workspace for an integration added before it had one of its own', async () => {
        await handleOpenDevConsole(contextFor(bodea()), { componentId: 'old-integration' });

        expect(opened()).toBe(workspaceUrl(PROJECT_WORKSPACE));
    });

    it("opens the project's workspace when no integration is named — the dashboard tile", async () => {
        await handleOpenDevConsole(contextFor(bodea()), undefined);

        expect(opened()).toBe(workspaceUrl(PROJECT_WORKSPACE));
    });

    it("ignores an id the project does not have, rather than guessing a workspace", async () => {
        await handleOpenDevConsole(contextFor(bodea()), { componentId: 'nope' });

        expect(opened()).toBe(workspaceUrl(PROJECT_WORKSPACE));
    });
});
