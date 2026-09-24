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
import { OPERATION_STAGES } from '@/core/utils/operationStages';
import { startModalRun } from '@/core/vscode/operationProgress';
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
    // PL-59 phase 2: a notification shows the STAGE, the short set; the step is the
    // progress modal's long set (owner, 2026-09-19).
    it('sends the stage to the notification, never the step under it', async () => {
        const { report } = stubWithProgress();
        mockDeployMeshHeadless.mockImplementation(
            async ({ onProgress }: { onProgress?: (m: string, s?: string) => void }) => {
                onProgress?.(OPERATION_STAGES.deployingMesh.label, 'Validating configuration');
                return { success: true };
            }
        );

        await deployMeshWithFeedback(deps());

        expect(report).toHaveBeenCalledWith({ message: OPERATION_STAGES.deployingMesh.label });
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
                onProgress?.('Reading mesh configuration');
                onProgress?.('Deploying', 'Validating configuration');
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
                onProgress?.('Reading mesh configuration');
                return { success: true };
            }
        );

        await deployMeshWithFeedback(deps());

        const stepPushes = mockSendMeshStatusUpdate.mock.calls.filter(
            (c) => typeof c[1] === 'string' && /Reading mesh configuration/.test(c[1])
        );
        expect(stepPushes).toStrictEqual([]);
    });

    // The core sends step-ish text on the STATUS channel too ("Starting
    // deployment…"). Passing it through would put narration back on the card
    // through a second door, so an in-flight status keeps the static label.
    it('replaces an in-flight status message with the card label', async () => {
        stubWithProgress();
        mockDeployMeshHeadless.mockImplementation(
            async ({
                onStatus,
            }: {
                onStatus?: (s: string, m?: string, e?: string) => Promise<void> | void;
            }) => {
                await onStatus?.('deploying', 'Starting deployment');
                return { success: true };
            }
        );

        await deployMeshWithFeedback(deps());

        expect(mockSendMeshStatusUpdate.mock.calls).toStrictEqual([
            // The register's own opening push, then the in-flight status —
            // both the static label, neither the core's wording.
            ['deploying', 'Deploying Mesh'],
            ['deploying', 'Deploying Mesh'],
        ]);
    });

    // A terminal status with no endpoint must push TWO arguments, not three with
    // an undefined tail — the card reads arity to tell "no endpoint" from "this
    // endpoint".
    it('omits the endpoint argument entirely when the core sends none', async () => {
        stubWithProgress();
        mockDeployMeshHeadless.mockImplementation(
            async ({
                onStatus,
            }: {
                onStatus?: (s: string, m?: string, e?: string) => Promise<void> | void;
            }) => {
                await onStatus?.('error', 'Mesh deployment failed');
                return { success: false };
            }
        );

        await deployMeshWithFeedback(deps());

        expect(mockSendMeshStatusUpdate.mock.calls).toStrictEqual([
            ['deploying', 'Deploying Mesh'],
            ['error', 'Mesh deployment failed'],
        ]);
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

// PL-59 phase 2, slice 1: started from a button, the mesh deploy reports to the
// screen's progress modal (rule R1) and opens no notification.
describe('started from a button on a screen', () => {
    const screen = jest.fn(async (_type: string, _payload?: unknown): Promise<void> => undefined);
    const modal = (): Array<Record<string, unknown>> =>
        screen.mock.calls.filter(([type]) => type === 'operationProgress').map(([, p]) => p as Record<string, unknown>);

    beforeEach(() => {
        startModalRun('eds-accs-mesh', screen);
    });

    it('reports each stage to the modal and opens no notification', async () => {
        mockDeployMeshHeadless.mockImplementation(
            async ({ onProgress }: { onProgress?: (m: string, s?: string) => void }) => {
                onProgress?.(OPERATION_STAGES.deployingMesh.label, 'Validating configuration');
                return { success: true };
            }
        );

        await deployMeshWithFeedback(deps(), { progress: 'modal', operationId: 'eds-accs-mesh' });

        expect(vscode.window.withProgress).not.toHaveBeenCalled();
        expect(modal()).toContainEqual(
            expect.objectContaining({ stage: OPERATION_STAGES.deployingMesh.label, step: 'Validating configuration' }),
        );
        expect(modal().at(-1)).toEqual({ id: 'eds-accs-mesh', state: 'succeeded' });
    });

    it('ends the modal with a reason a person can act on, not a tool instruction', async () => {
        mockDeployMeshHeadless.mockResolvedValue({ success: false, blockedBy: 'no-mesh' });

        const result = await deployMeshWithFeedback(deps(), { progress: 'modal', operationId: 'eds-accs-mesh' });

        expect(result.error).toBe('This project does not have an API Mesh component.');
        expect(modal().at(-1)).toEqual({
            id: 'eds-accs-mesh',
            state: 'failed',
            error: 'This project does not have an API Mesh component.',
        });
    });

    it('leaves the core\'s own error for callers that are not a modal (the agent words its own)', async () => {
        stubWithProgress();
        mockDeployMeshHeadless.mockResolvedValue({ success: false, blockedBy: 'no-mesh' });

        const result = await deployMeshWithFeedback(deps());

        expect(result.error).toBeUndefined();
    });
});

// A redeploy that moved the mesh left the live storefront on its dead old address
// until someone republished by hand (owner, 2026-09-21): a deploy republishes.
describe('republishing the storefront after a deploy', () => {
    /** A project whose storefront reads the mesh address. */
    function withStorefront(): DeployMeshWithFeedbackDeps {
        const base = deps();
        base.project = createMockProject({
            name: 'p',
            path: '/p',
            appBuilderComponents: {
                mesh: {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-mesh' },
                    providesEnvVars: { MESH_ENDPOINT: 'https://edge-graph.adobe.io/api/m/graphql' },
                },
            },
        });
        return base;
    }

    it('republishes after a successful deploy, as its own stage', async () => {
        const { report } = stubWithProgress();
        const republishStorefront = jest.fn().mockResolvedValue({ success: true, cdnPublished: true });
        const input = { ...withStorefront(), republishStorefront };

        const result = await deployMeshWithFeedback(input);

        expect(republishStorefront).toHaveBeenCalledWith(input.project);
        expect(report).toHaveBeenCalledWith(
            expect.objectContaining({ message: OPERATION_STAGES.republishingStorefront.label }),
        );
        expect(result).toEqual({ success: true });
    });

    it('says so when the republish does not reach the CDN — the mesh still counts as deployed', async () => {
        stubWithProgress();
        const republishStorefront = jest.fn().mockResolvedValue({ success: true, cdnPublished: false });

        const result = await deployMeshWithFeedback({ ...withStorefront(), republishStorefront });

        expect(result).toEqual({
            success: true,
            storefrontNotRepublished: 'the CDN still serves the previous config',
        });
    });

    it('reports a republish that throws, in its own words', async () => {
        stubWithProgress();
        const republishStorefront = jest.fn().mockRejectedValue(new Error('GitHub sign-in expired'));

        const result = await deployMeshWithFeedback({ ...withStorefront(), republishStorefront });

        expect(result.storefrontNotRepublished).toBe('GitHub sign-in expired');
    });

    it('does not republish a project whose storefront does not read the mesh', async () => {
        stubWithProgress();
        const republishStorefront = jest.fn();

        await deployMeshWithFeedback({ ...deps(), republishStorefront });

        expect(republishStorefront).not.toHaveBeenCalled();
    });

    it('does not republish after a failed deploy', async () => {
        stubWithProgress();
        mockDeployMeshHeadless.mockResolvedValue({ success: false, error: 'boom' });
        const republishStorefront = jest.fn();

        await deployMeshWithFeedback({ ...withStorefront(), republishStorefront });

        expect(republishStorefront).not.toHaveBeenCalled();
    });
});
