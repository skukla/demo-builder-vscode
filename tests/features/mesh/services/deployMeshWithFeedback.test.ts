/**
 * deployMeshWithFeedback — the progress register for the MESH deploy.
 *
 * The thin UI layer over the UI-free `deployMeshHeadless`, shared by
 * `DeployMeshCommand` and the `deploy_mesh` MCP tool.
 *
 * REGRESSION (2026-08-04): the register split was reversed for the App Builder
 * component path (`withComponentProgress`) — notification carries the STEPS
 * under a static title, card names the operation once — but this module is a
 * SECOND implementation of the same policy and kept the old assignment. So a
 * mesh redeploy from the integrations grid still showed "GENERATING MESH
 * CONFIGURATION…" wrapped across the card while the notification sat on a
 * static "Deploying API Mesh": exactly the arrangement the swap removed, on the
 * one path the swap did not touch.
 *
 * The rule both modules now share: the notification carries the steps, the card
 * names the operation once and holds still, and no two surfaces narrate the
 * same step.
 */

const mockSendMeshStatusUpdate = jest.fn();
jest.mock('@/features/dashboard/commands/showDashboard', () => ({
    ProjectDashboardWebviewCommand: {
        sendMeshStatusUpdate: (...args: unknown[]) => mockSendMeshStatusUpdate(...args),
    },
}));

const mockDeployMeshHeadless = jest.fn();
jest.mock('@/features/mesh/services/deployMeshHeadless', () => ({
    deployMeshHeadless: (...args: unknown[]) => mockDeployMeshHeadless(...args),
}));

import * as vscode from 'vscode';
import { deployMeshWithFeedback } from '@/features/mesh/services/deployMeshWithFeedback';
import type { DeployMeshWithFeedbackDeps } from '@/features/mesh/services/deployMeshWithFeedback';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';

/** Capture the reporter withProgress hands the task. */
function stubWithProgress(): { report: jest.Mock; title: () => string } {
    const report = jest.fn();
    let seenTitle = '';
    (vscode.window.withProgress as unknown as jest.Mock).mockImplementation(
        async (options: { title: string }, task: (p: unknown) => Promise<unknown>) => {
            seenTitle = options.title;
            return task({ report });
        }
    );
    return { report, title: () => seenTitle };
}

function deps(): DeployMeshWithFeedbackDeps {
    return {
        project: createMockProject({ name: 'p', path: '/p' }),
        stateManager: createMockStateManager(),
        logger: createMockLogger(),
        extensionPath: '/ext',
        authManager: createMockAuthenticationService(),
        commandManager: createMockCommandExecutor(),
        secrets: undefined,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDeployMeshHeadless.mockResolvedValue({ success: true });
});

describe('progress register', () => {
    it('sends the step detail to the notification', async () => {
        const { report } = stubWithProgress();
        mockDeployMeshHeadless.mockImplementation(
            async ({ onProgress }: { onProgress?: (m: string, s?: string) => void }) => {
                onProgress?.('Reading mesh configuration...');
                return { success: true };
            }
        );

        await deployMeshWithFeedback(deps());

        expect(report).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Reading mesh configuration...' })
        );
    });

    it('keeps the operation name on the notification title', async () => {
        const { title } = stubWithProgress();

        await deployMeshWithFeedback(deps());

        expect(title()).toBe('Deploying API Mesh');
    });

    // ONCE, and the verb plus the kind — matching withComponentProgress. The
    // card's heading already reads "API Mesh", so the status line must not
    // restate it.
    it('names the operation on the card exactly once', async () => {
        stubWithProgress();
        mockDeployMeshHeadless.mockImplementation(
            async ({ onProgress }: { onProgress?: (m: string, s?: string) => void }) => {
                onProgress?.('Reading mesh configuration...');
                onProgress?.('Deploying...', 'Validating configuration');
                return { success: true };
            }
        );

        await deployMeshWithFeedback(deps());

        const deploying = mockSendMeshStatusUpdate.mock.calls.filter((c) => c[0] === 'deploying');
        expect(deploying).toHaveLength(1);
        expect(deploying[0][1]).toBe('Deploying Mesh');
    });

    it('keeps step detail off the card', async () => {
        stubWithProgress();
        mockDeployMeshHeadless.mockImplementation(
            async ({ onProgress }: { onProgress?: (m: string, s?: string) => void }) => {
                onProgress?.('Reading mesh configuration...');
                return { success: true };
            }
        );

        await deployMeshWithFeedback(deps());

        const stepPushes = mockSendMeshStatusUpdate.mock.calls.filter(
            (c) => typeof c[1] === 'string' && /Reading mesh configuration/.test(c[1])
        );
        expect(stepPushes).toEqual([]);
    });

    // onStatus is a different channel from onProgress: it carries the terminal
    // status (and the endpoint on success), which the card still needs.
    it('still forwards the core status pushes to the card', async () => {
        stubWithProgress();
        mockDeployMeshHeadless.mockImplementation(
            async ({
                onStatus,
            }: {
                onStatus?: (s: string, m?: string, e?: string) => Promise<void> | void;
            }) => {
                await onStatus?.('deployed', 'Done', 'https://mesh/graphql');
                return { success: true };
            }
        );

        await deployMeshWithFeedback(deps());

        expect(mockSendMeshStatusUpdate).toHaveBeenCalledWith(
            'deployed',
            'Done',
            'https://mesh/graphql'
        );
    });
});
