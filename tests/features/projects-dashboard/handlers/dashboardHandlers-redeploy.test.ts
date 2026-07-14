/**
 * handleRedeployMesh / handleRedeployApp — the projects-kebab "Redeploy Mesh" and
 * "Redeploy App" actions. Each validates the path, loads the project, and runs the
 * shared headless deploy core under a progress notification, then toasts the outcome.
 */

jest.mock('@/features/mesh/services/deployMeshHeadless', () => ({
    deployMeshHeadless: jest.fn(),
}));
jest.mock('@/features/app-builder/services/deployAppHeadless', () => ({
    deployAppHeadless: jest.fn(),
}));

import * as vscode from 'vscode';
import {
    handleRedeployMesh,
    handleRedeployApp,
} from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { deployMeshHeadless } from '@/features/mesh/services/deployMeshHeadless';
import { deployAppHeadless } from '@/features/app-builder/services/deployAppHeadless';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext, createMockProject } from '../testUtils';

const mockMesh = deployMeshHeadless as jest.Mock;
const mockApp = deployAppHeadless as jest.Mock;

/** A handler context whose loadProjectFromPath resolves the given project, with an extension path. */
function ctx(project = createMockProject({ name: 'demo' })): {
    context: HandlerContext;
    path: string;
} {
    const base = createMockHandlerContext([project]) as unknown as HandlerContext & {
        context?: unknown;
    };
    base.context = { extensionPath: '/ext' } as never;
    return { context: base, path: project.path };
}

describe('handleRedeployMesh / handleRedeployApp', () => {
    beforeEach(() => jest.clearAllMocks());

    it('redeployMesh loads the project by path and runs deployMeshHeadless', async () => {
        mockMesh.mockResolvedValue({ success: true });
        const { context, path } = ctx();

        const res = await handleRedeployMesh(context, { projectPath: path });

        expect(context.stateManager.loadProjectFromPath).toHaveBeenCalledWith(
            path,
            undefined,
            expect.any(Object)
        );
        expect(mockMesh).toHaveBeenCalledWith(
            expect.objectContaining({ project: expect.objectContaining({ name: 'demo' }) })
        );
        expect(res).toEqual({ success: true });
        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it('redeployApp runs deployAppHeadless', async () => {
        mockApp.mockResolvedValue({ success: true });
        const { context, path } = ctx();

        const res = await handleRedeployApp(context, { projectPath: path });

        expect(mockApp).toHaveBeenCalledWith(
            expect.objectContaining({ project: expect.objectContaining({ name: 'demo' }) })
        );
        expect(res).toEqual({ success: true });
    });

    it('surfaces a failed redeploy as an error and toasts it', async () => {
        mockMesh.mockResolvedValue({ success: false, error: 'boom' });
        const { context, path } = ctx();

        const res = await handleRedeployMesh(context, { projectPath: path });

        expect(res).toEqual({ success: false, error: 'boom' });
        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith('boom');
    });

    it('does NOT toast an error when the deploy was cancelled (auth/org dismissed)', async () => {
        mockMesh.mockResolvedValue({ success: false, blockedBy: 'auth', cancelled: true });
        const { context, path } = ctx();

        await handleRedeployMesh(context, { projectPath: path });

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('rejects a missing project path without deploying', async () => {
        const { context } = ctx();
        const res = await handleRedeployMesh(context, undefined);
        expect(res.success).toBe(false);
        expect(mockMesh).not.toHaveBeenCalled();
    });
});
