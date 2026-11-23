/**
 * The reset door for a project built on an added demo.
 *
 * Decided 2026-09-11: the source is checked before anything runs and an
 * unreachable one refuses in a sentence. A missing content site no longer asks
 * (P5-Q8, owner walk 2026-11-13, step-07 D5): the reset carries on, keeps the
 * content and says so on its row, with no VS Code dialog mid-run. Each case pins
 * the arguments the reset service receives. Driven as the batch runs it (`withinEdit`).
 */

import {
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
    resetEdsProjectWithUI,
    vscode,
    fakeGitHubAppService,
} from './edsResetUI.testUtils';
import type { DemoSourceCheck } from '@/features/eds/services/reset/demoSourceCheck';
import { resetCaveats, type EdsResetResult } from '@/features/eds/services/reset/edsResetParams';
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
// The check is faked.
jest.mock('@/features/eds/services/reset/demoSourceCheck', () => ({
    ...jest.requireActual('@/features/eds/services/reset/demoSourceCheck'),
    checkDemoSource: jest.fn(),
}));
jest.mock('@/core/utils/sleep');

import { checkDemoSource } from '@/features/eds/services/reset/demoSourceCheck';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';
import { createMockProject } from '../../../../helpers/projectFake';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';

const mockedReset = executeEdsReset as jest.MockedFunction<typeof executeEdsReset>;
const mockedCheck = checkDemoSource as jest.MockedFunction<typeof checkDemoSource>;
const meshDeps = createMeshDepsFake();
const UNREACHABLE = "The Isle5 by Robin demo's repository can't be reached. Reset and updates are unavailable until it is.";
/** The row's line for the kept content (step-07 D5; the owner's words, 2026-11-14). */
const CONTENT_KEPT = "Content kept: the demo's pages can't be reached.";
const REACHABLE: DemoSourceCheck = { reachable: true, checked: true, message: '', contentReachable: true };
const CONTENT_GONE: DemoSourceCheck = {
    reachable: true, checked: true,
    message: '',
    contentReachable: false,
    contentMessage: "The Isle5 by Robin demo's pages can't be reached right now.",
};

function createProject(): Project {
    return createMockProject({
        name: 'test-project',
        path: '/test/project',
        status: 'running' as ProjectStatus,
        demo: makeAddedDemo(),
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

const repoOperations = { getRepository: jest.fn() };

function run(outcome: EdsResetResult = { success: true }) {
    mockedReset.mockResolvedValue(outcome);
    return resetEdsProjectWithUI({
        githubAppService: fakeGitHubAppService,
        meshDeps,
        project: createProject(),
        context: createContext(),
        repoOperations,
        withinEdit: { report: jest.fn() },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
    mockedCheck.mockResolvedValue(REACHABLE);
});

describe('reset of a project built on an added demo — the source check', () => {
    it('checks the source with the handed-in repository reader before anything else', async () => {
        await run();

        expect(mockedCheck).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'test-project' }),
            repoOperations,
            expect.objectContaining({ logger: expect.anything() }),
            undefined,
        );
        expect(mockedReset).toHaveBeenCalledTimes(1);
    });

    // P5-Q8 (step-07 D5): the refusal is the row's line, never a VS Code popup mid-run.
    it('refuses in one sentence when the source is unreachable, with no dialog', async () => {
        mockedCheck.mockResolvedValue({ reachable: false, checked: true, message: UNREACHABLE, contentReachable: false });

        const result = await run();

        expect(result).toEqual({ success: false, error: UNREACHABLE, errorType: 'DEMO_SOURCE_UNREACHABLE' });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(mockedReset).not.toHaveBeenCalled();
    });

    // P5-Q8 (step-07 D5): carries on, resets the code only, and says the content was kept.
    it('keeps the current content without asking when the content site is gone, and says so', async () => {
        mockedCheck.mockResolvedValue(CONTENT_GONE);

        const result = await run();

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(mockedReset).toHaveBeenCalledWith(
            expect.objectContaining({ keepContent: true }),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.anything(),
        );
        expect(resetCaveats(result)).toStrictEqual([CONTENT_KEPT]);
    });

    // Found by the first mutation run of edsResetUI on its own (EDS-8, 2026-10-08).
    it('never checks a source for a project that is not built on an added demo', async () => {
        mockedReset.mockResolvedValue({ success: true });
        const project = createProject();
        delete project.demo;

        await resetEdsProjectWithUI({
            githubAppService: fakeGitHubAppService,
            meshDeps,
            project,
            context: createContext(),
            repoOperations,
            withinEdit: { report: jest.fn() },
        });

        expect(mockedCheck).not.toHaveBeenCalled();
        expect(mockedReset).toHaveBeenCalledTimes(1);
    });

    it('never sends keepContent for a reachable content site', async () => {
        await run();

        const params = mockedReset.mock.calls[0][0];
        expect('keepContent' in params).toBe(false);
    });

    it('CONTROL: says nothing of content for a reachable content site', async () => {
        const result = await run();

        expect(resetCaveats(result)).toStrictEqual([]);
    });
});
