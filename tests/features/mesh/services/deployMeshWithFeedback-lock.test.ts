/**
 * deployMeshWithFeedback — one mesh deploy at a time, and the mesh prompt cleared after one.
 *
 * Both used to be each door's job. The palette and the screen button took `meshDeployLock` and
 * fired `meshActionTaken`; the agent's `deploy_mesh` did neither, so an agent deploy could run
 * beside a button deploy and leave the "redeploy the mesh" prompt muted (PL-104 fix 4, F265).
 * The spine does both now, so no door can leave them out.
 */

const mockSendMeshStatusUpdate = jest.fn();
jest.mock('@/features/dashboard/services/projectPanelPushes', () => ({
    sendMeshStatusUpdate: (...args: unknown[]) => mockSendMeshStatusUpdate(...args),
}));

const mockDeployMeshHeadless = jest.fn();
jest.mock('@/features/mesh/services/deployMeshHeadless', () => ({
    deployMeshHeadless: (...args: unknown[]) => mockDeployMeshHeadless(...args),
}));

import * as vscode from 'vscode';
import { deployMeshWithFeedback } from '@/features/mesh/services/deployMeshWithFeedback';
import { MESH_DEPLOY_ALREADY_RUNNING, meshDeployLock } from '@/features/mesh/services/meshDeployLock';
import { deps } from './deployMeshWithFeedback.testUtils';

const ACTION_TAKEN = 'demoBuilder._internal.meshActionTaken';

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window.withProgress as unknown as jest.Mock).mockImplementation(
        async (_options: unknown, task: (p: unknown) => Promise<unknown>) =>
            task({ report: jest.fn() })
    );
    mockDeployMeshHeadless.mockResolvedValue({ success: true });
});

describe('one deploy at a time, whichever door started it', () => {
    it('holds the mesh lock for the whole deploy, and lets go when it ends', async () => {
        let lockedDuringDeploy: boolean | undefined;
        mockDeployMeshHeadless.mockImplementation(async () => {
            lockedDuringDeploy = meshDeployLock.isLocked();
            return { success: true };
        });

        await deployMeshWithFeedback(deps());

        expect(lockedDuringDeploy).toBe(true);
        expect(meshDeployLock.isLocked()).toBe(false);
    });

    it('refuses a second deploy while one runs, before anything is deployed', async () => {
        const release = await meshDeployLock.acquire();
        try {
            const result = await deployMeshWithFeedback(deps());

            expect(result).toStrictEqual({
                success: false,
                error: MESH_DEPLOY_ALREADY_RUNNING,
                alreadyRunning: true,
            });
            expect(mockDeployMeshHeadless).not.toHaveBeenCalled();
            expect(vscode.window.withProgress).not.toHaveBeenCalled();
        } finally {
            release();
        }
    });

    it('lets go of the lock when the deploy throws', async () => {
        mockDeployMeshHeadless.mockRejectedValue(new Error('boom'));

        await expect(deployMeshWithFeedback(deps())).rejects.toThrow('boom');

        expect(meshDeployLock.isLocked()).toBe(false);
    });
});

describe('the mesh prompt is cleared after a deploy', () => {
    it('clears it once the mesh deployed', async () => {
        await deployMeshWithFeedback(deps());

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(ACTION_TAKEN);
    });

    it('leaves it set when the deploy failed', async () => {
        mockDeployMeshHeadless.mockResolvedValue({ success: false, error: 'boom' });

        await deployMeshWithFeedback(deps());

        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(ACTION_TAKEN);
    });

    it('leaves it set when another deploy was already running', async () => {
        const release = await meshDeployLock.acquire();
        try {
            await deployMeshWithFeedback(deps());
        } finally {
            release();
        }

        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(ACTION_TAKEN);
    });
});
