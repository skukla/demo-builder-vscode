/**
 * A storefront reset run inside its caller's window: the batch window (every screen's Reset
 * since step-05 S4, `answered`) and an Edit's Finish (`withinEdit` alone). It asks nothing,
 * opens no progress of its own, and tells each step to the caller's `report`.
 *
 * What was this suite's first job, which surface a reset ran on and the id a screen's modal
 * followed it by (PL-59 R1), went with the one-project reset's own window (step-05 S5).
 */

import {
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
    resetEdsProjectWithUI,
    vscode,
    fakeGitHubAppService,
} from './edsResetUI.testUtils';
import { RESET_STEP } from '@/core/utils/resetStages';
import type { EdsResetResult } from '@/features/eds/services/reset/edsResetParams';
import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    executeEdsReset: jest.fn(),
}));
jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetParams'),
    extractResetParams: jest.fn().mockReturnValue({
        success: true,
        params: { repoOwner: 'test-owner', repoName: 'test-repo' },
    }),
}));
jest.mock('@/core/utils/sleep');
// The datapack's removal is its own suite's (sampleDataRemovalChanges); here only what it is handed.
jest.mock('@/features/eds/services/reset/edsResetSampleData', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetSampleData'),
    removeProjectSampleData: jest.fn(),
}));
const mockReport = jest.fn();

import { runningWork } from '@/core/state/projectWorkRunning';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import { removeProjectSampleData } from '@/features/eds/services/reset/edsResetSampleData';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';
import { createMockProject } from '../../../../helpers/projectFake';

const mockedReset = executeEdsReset as jest.MockedFunction<typeof executeEdsReset>;
const meshDeps = createMeshDepsFake();

function createProject(): Project {
    return createMockProject({
        name: 'test-project',
        path: '/test/project',
        status: 'running' as ProjectStatus,
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'test-owner/test-repo', daLiveOrg: 'test-org' },
            },
        },
    });
}

function createContext(): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn(),
            saveProject: jest.fn(),
        }),
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        sendMessage: jest.fn(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
}

function run(outcome: EdsResetResult, extra: Record<string, unknown> = {}) {
    mockedReset.mockResolvedValue(outcome);
    return resetEdsProjectWithUI({
        githubAppService: fakeGitHubAppService,
        meshDeps,
        project: createProject(),
        context: createContext(),
        withinEdit: { report: mockReport },
        ...extra,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
});

describe('resetEdsProjectWithUI — the steps it reports', () => {
    // Found on the 2026-10-16 release walk: every message from inside a step was shown
    // AS the stage, with the step's position glued on, so "Publishing block library
    // (11 of 11)" read as eleven of eleven library items. A step's stage is its own
    // name; what it is doing right now is the line under it.
    it("shows a step's own name as the stage and its current work as the line under it", async () => {
        mockedReset.mockImplementation(async (_params, _context, _tokens, _mesh, onProgress) => {
            onProgress?.({
                step: RESET_STEP.publishingPages,
                totalSteps: 11,
                message: 'Publishing the block list: 11 pages',
            });
            onProgress?.({
                step: RESET_STEP.resettingCode,
                totalSteps: 11,
                message: 'Reset 3448 files',
            });
            return { success: true };
        });

        await resetEdsProjectWithUI({
            githubAppService: fakeGitHubAppService,
            meshDeps,
            project: createProject(),
            context: createContext(),
            withinEdit: { report: mockReport },
        });

        expect(mockReport).toHaveBeenCalledWith(
            'Publishing the pages',
            'Publishing the block list: 11 pages',
            {
                index: RESET_STEP.publishingPages,
                total: 11,
            }
        );
        expect(mockReport).toHaveBeenCalledWith('Resetting the code', 'Reset 3448 files', {
            index: RESET_STEP.resettingCode,
            total: 11,
        });
    });
});

// The projects list reads what is running from the registry, never the reset's own
// copy of the project (found 2026-10-28: three resets all still said "Needs reset").
describe('resetEdsProjectWithUI — listed as resetting', () => {
    it('lists the project as resetting while the reset runs, and not after', async () => {
        let during: string | undefined;
        mockedReset.mockImplementation(async () => {
            during = runningWork('/test/project');
            return { success: true };
        });

        await resetEdsProjectWithUI({
            githubAppService: fakeGitHubAppService,
            meshDeps,
            project: createProject(),
            context: createContext(),
            withinEdit: { report: mockReport },
        });

        expect(during).toBe('resetting');
        expect(runningWork('/test/project')).toBeUndefined();
    });

    it('stops listing it when the reset fails', async () => {
        mockedReset.mockRejectedValue(new Error('pipeline died'));

        await expect(
            resetEdsProjectWithUI({
                githubAppService: fakeGitHubAppService,
                meshDeps,
                project: createProject(),
                context: createContext(),
                withinEdit: { report: mockReport },
            }),
        ).rejects.toThrow('pipeline died');

        expect(runningWork('/test/project')).toBeUndefined();
    });
});

// An Edit that changes the package resets as part of its Finish (PL-75): it asked
// its own questions before anything ran, and shows progress on the wizard's screen.
describe('resetEdsProjectWithUI — within an Edit', () => {
    it("asks nothing and reports onto the Edit's screen", async () => {
        const editReport = jest.fn();

        const result = await run({ success: true }, { withinEdit: { report: editReport } });

        expect(result.success).toBe(true);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(editReport).toHaveBeenCalledWith('Checking requirements', 'Your DA.live sign-in');
        expect(mockedReset).toHaveBeenCalledTimes(1);
    });

    it('raises no result toast: the Edit reports the outcome', async () => {
        await run(
            { success: false, error: 'pipeline died' },
            { withinEdit: { report: jest.fn() } }
        );

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });
});

// Reset Selected on the projects list (owner, 2026-11-04): the batch asked its questions before
// anything ran, and the reset reports into the batch's window with those answers.
describe('resetEdsProjectWithUI — answered by a batch', () => {
    const withPack = (): Project => ({
        ...createProject(),
        datapack: { name: 'bodea', version: 'main', store: 'library' },
        componentSelections: { backend: 'adobe-commerce-accs' },
    });

    it("asks nothing, removes the datapack as answered, and hands the batch's answer to the changes", async () => {
        mockedReset.mockResolvedValue({ success: true });
        const report = jest.fn();

        const result = await resetEdsProjectWithUI({
            githubAppService: fakeGitHubAppService,
            meshDeps,
            project: withPack(),
            context: createContext(),
            withinEdit: { report },
            answered: { removeDatapack: true, changes: { saveAs: 'My Bodea' } },
        });

        expect(result.success).toBe(true);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        // Given, not asked: it goes with the first read, so it reaches the SC's own pack too (step-05 S1).
        expect((removeProjectSampleData as jest.Mock).mock.calls[0][3]).toStrictEqual({ given: { saveAs: 'My Bodea' } });
    });

    it('keeps the datapack when the batch said not to remove it', async () => {
        mockedReset.mockResolvedValue({ success: true });

        await resetEdsProjectWithUI({
            githubAppService: fakeGitHubAppService,
            meshDeps,
            project: withPack(),
            context: createContext(),
            withinEdit: { report: jest.fn() },
            answered: { removeDatapack: false },
        });

        expect(removeProjectSampleData).not.toHaveBeenCalled();
        expect(mockedReset).toHaveBeenCalledTimes(1);
    });
});
