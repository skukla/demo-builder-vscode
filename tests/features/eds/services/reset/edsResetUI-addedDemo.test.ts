/**
 * The reset door for a project built on an added demo.
 *
 * Decided 2026-09-11: the source is checked BEFORE the first modal, an
 * unreachable one refuses in a sentence, a missing content site offers to
 * keep the current content, and the dry check's caveats are shown when the
 * reset finishes. Each case pins the arguments the VS Code window API and
 * the reset service receive.
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
import type { EdsResetResult } from '@/features/eds/services/reset/edsResetService';
import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    executeEdsReset: jest.fn(),
    extractResetParams: jest.fn().mockReturnValue({
        success: true,
        params: { repoOwner: 'test-owner', repoName: 'test-repo' },
    }),
}));
jest.mock('@/features/eds/services/reset/demoSourceCheck', () => ({
    checkDemoSource: jest.fn(),
}));
jest.mock('@/core/utils/sleep');
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({ show: jest.fn() }),
}));

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
const RESET = 'Reset Project';
const UNREACHABLE = "The Isle5 by Jen demo's repository can't be reached. Reset and updates are unavailable until it is.";
const REACHABLE: DemoSourceCheck = { reachable: true, message: '', contentReachable: true };
const CONTENT_GONE: DemoSourceCheck = {
    reachable: true,
    message: '',
    contentReachable: false,
    contentMessage: "The Isle5 by Jen demo's pages can't be reached right now.",
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
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(RESET);
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

    it('refuses in one sentence, before the confirmation, when the source is unreachable', async () => {
        mockedCheck.mockResolvedValue({ reachable: false, message: UNREACHABLE, contentReachable: false });

        const result = await run();

        expect(result).toEqual({ success: false, error: UNREACHABLE, errorType: 'DEMO_SOURCE_UNREACHABLE' });
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(UNREACHABLE);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalledWith(
            expect.stringContaining('Reset Project'),
            expect.anything(),
            expect.anything(),
        );
        expect(mockedReset).not.toHaveBeenCalled();
    });

    it('offers to keep the current content when the content site is gone, and resets the code only', async () => {
        mockedCheck.mockResolvedValue(CONTENT_GONE);
        (vscode.window.showWarningMessage as jest.Mock)
            .mockResolvedValueOnce({ title: 'Keep current content' })
            .mockResolvedValue(RESET);

        await run();

        expect(vscode.window.showWarningMessage).toHaveBeenNthCalledWith(
            1,
            "The Isle5 by Jen demo's pages can't be reached right now. You can reset the code and keep the content this site has now.",
            { modal: true },
            { title: 'Keep current content' },
        );
        expect(mockedReset).toHaveBeenCalledWith(
            expect.objectContaining({ keepContent: true }),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.anything(),
        );
    });

    it('stops, without resetting, when the keep-content offer is dismissed', async () => {
        mockedCheck.mockResolvedValue(CONTENT_GONE);
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValueOnce(undefined);

        const result = await run();

        expect(result).toEqual({ success: false, cancelled: true });
        expect(mockedReset).not.toHaveBeenCalled();
    });

    it('never sends keepContent for a reachable content site', async () => {
        await run();

        const params = mockedReset.mock.calls[0][0];
        expect('keepContent' in params).toBe(false);
    });
});

describe('reset of a project built on an added demo — what the SC is told after', () => {
    it("shows the dry check's caveats, joined, in the wizard's words", async () => {
        await run({
            success: true,
            demoCaveats: ['Product links may not work.', 'Product pages may open empty.'],
        });

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            'A few things to know about this demo: Product links may not work. Product pages may open empty.',
        );
    });

    it('shows nothing extra when the dry check found no caveats', async () => {
        await run({ success: true, demoCaveats: [] });

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalledWith(
            expect.stringContaining('A few things to know'),
        );
    });
});
