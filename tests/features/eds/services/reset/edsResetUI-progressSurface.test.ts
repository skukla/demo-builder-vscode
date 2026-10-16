/**
 * Which surface a reset runs on, and which id it is followed by (PL-59 R1).
 *
 * Found by the first mutation run of `edsResetUI` on its own (EDS-8, 2026-10-08):
 * the `progress: 'modal'` option and the `operationId` a screen names its run by
 * were read by no test, so a reset started from a screen could have run in a
 * background notification, or under an id its modal does not follow, with every
 * suite green. The progress surface is replaced here so the options it receives
 * can be read; the surface itself is pinned in `withOperationProgress.test.ts`.
 */

import {
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
    resetEdsProjectWithUI,
    vscode,
    fakeGitHubAppService,
} from './edsResetUI.testUtils';
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
const mockReport = jest.fn();
jest.mock('@/core/vscode/withOperationProgress', () => ({
    withOperationProgress: jest.fn(
        async (_options: unknown, work: (report: jest.Mock) => Promise<unknown>) => work(mockReport),
    ),
}));

import { resetOperationId } from '@/core/utils/operationIds';
import { withOperationProgress } from '@/core/vscode/withOperationProgress';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
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
        stateManager: createMockStateManager({ getCurrentProject: jest.fn(), saveProject: jest.fn() }),
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
        ...extra,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Reset Project');
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
});

describe('resetEdsProjectWithUI — the progress surface', () => {
    it('runs in a notification named by the reset id when no screen is hosting it', async () => {
        await run({ success: true });

        expect(withOperationProgress).toHaveBeenCalledWith(
            { id: resetOperationId('test-project'), title: 'Resetting test-project', inModal: false },
            expect.any(Function),
        );
    });

    it("runs in the screen's modal, under the id that screen named, when started from one", async () => {
        await run({ success: true }, { progress: 'modal', operationId: 'op-7' });

        expect(withOperationProgress).toHaveBeenCalledWith(
            { id: 'op-7', title: 'Resetting test-project', inModal: true },
            expect.any(Function),
        );
    });

    // The step under the stage is what a screen's modal shows on its second row.
    it('names each pre-flight check as the step under one stage, in order', async () => {
        const project = createProject();
        project.adobe = { organization: 'org-1' };
        mockedReset.mockResolvedValue({ success: true });

        await resetEdsProjectWithUI({
            githubAppService: fakeGitHubAppService,
            meshDeps,
            project,
            context: createContext(),
        });

        expect(mockReport.mock.calls).toStrictEqual([
            ['Checking requirements', 'Your DA.live sign-in'],
            ['Checking requirements', 'Your Adobe sign-in'],
            ['Checking requirements', 'The Adobe organization'],
            ['Checking requirements', 'The GitHub app on your repo'],
        ]);
    });

    it('raises no failure toast in a modal, which already shows the reason', async () => {
        await run({ success: false, error: 'pipeline died' }, { progress: 'modal' });

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    // Found on the 2026-10-16 release walk: a reset run from the dashboard finished
    // in its modal with a clean success, and its warning arrived as a notification
    // in the corner instead.
    it("puts a success's warnings on the modal's last view, not in notifications", async () => {
        const leftover = 'Pages from before the reset may still be live on h. Reset again to remove them.';
        const missing = '3 pages the source has are missing from this storefront: /a, /b, /c';

        const result = await run(
            {
                success: true,
                leftoverPages: { status: 'not-listed', removed: 0, summary: leftover },
                missingPages: missing,
            },
            { progress: 'modal' },
        );

        expect(result.warning).toBe(`${leftover} ${missing}`);
        // The confirmation is the only one.
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it('points at the storefront report in the modal when the demo has fixes on offer', async () => {
        const result = await run(
            { success: true, demoCaveats: ['Product links may not work.'], demoFixes: { offered: ['pdp'] } },
            { progress: 'modal' },
        );

        expect(result.warning).toBe(
            'A few things to know about this demo: Product links may not work. ' +
                'Storefront Report offers fixes for this.',
        );
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it('adds no warning to a clean success in a modal', async () => {
        const result = await run({ success: true }, { progress: 'modal' });

        expect(result).not.toHaveProperty('warning');
    });

    it('raises the failure toast when no modal is showing the reason', async () => {
        await run({ success: false, error: 'pipeline died' });

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            'Failed to reset EDS project: pipeline died',
        );
    });
});

// An Edit that changes the package resets as part of its Finish (PL-75): it asked
// its own questions before anything ran, and shows progress on the wizard's screen.
describe('resetEdsProjectWithUI — within an Edit', () => {
    it("asks nothing, opens no progress of its own, and reports onto the Edit's screen", async () => {
        const editReport = jest.fn();

        const result = await run({ success: true }, { withinEdit: { report: editReport } });

        expect(result.success).toBe(true);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(withOperationProgress).not.toHaveBeenCalled();
        expect(editReport).toHaveBeenCalledWith('Checking requirements', 'Your DA.live sign-in');
        expect(mockedReset).toHaveBeenCalledTimes(1);
    });

    it('raises no result toast: the Edit reports the outcome', async () => {
        await run({ success: false, error: 'pipeline died' }, { withinEdit: { report: jest.fn() } });

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });
});
