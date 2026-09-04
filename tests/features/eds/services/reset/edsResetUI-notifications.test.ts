/**
 * What the user is TOLD when a reset finishes.
 *
 * `showResetResultNotifications` had no test at all before PL-22 batch MUT-07:
 * every suite mocked `executeEdsReset` to succeed and read only `result.success`,
 * so the success toast, the two post-success warnings, the missing-App error
 * with its install link, and the "Show Logs" affordance were all deletable with
 * the suite green.
 *
 * Each case pins the ARGUMENTS the VS Code window API receives — the message,
 * the buttons offered, and what a chosen button opens.
 */

import {
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
    resetEdsProjectWithUI,
    vscode,
    fakeGitHubAppService,
} from './edsResetUI.testUtils';
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
jest.mock('@/core/utils/sleep');
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({ show: mockShowLogs }),
}));
const mockShowLogs = jest.fn();

import { sleep } from '@/core/utils/sleep';
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
const RESET = 'Reset Project';
const FAILED = 'Failed to reset EDS project: boom';

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

/** The `.then` on the Show Logs prompt is not awaited by the SUT; let it settle. */
async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
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
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(RESET);
    (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
});

describe('reset notifications — success', () => {
    it('shows a success toast that names the project and holds for the notification delay', async () => {
        await run({ success: true });

        expect(vscode.window.withProgress).toHaveBeenLastCalledWith(
            {
                location: vscode.ProgressLocation.Notification,
                title: '"test-project" reset successfully',
            },
            expect.any(Function),
        );
        expect(sleep).toHaveBeenCalledWith(2000);
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('adds no warning to a clean success', async () => {
        await run({ success: true });

        // The confirmation prompt is the only warning shown.
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it('warns with the config-write remedy when the site config could not be written', async () => {
        await run({ success: true, errorType: 'CONFIG_WRITE_FAILED', error: 'PDP routing is off.' });

        expect(vscode.window.showWarningMessage).toHaveBeenLastCalledWith('PDP routing is off.');
    });

    it('falls back to a generic config warning when no remedy text was given', async () => {
        await run({ success: true, errorType: 'CONFIG_WRITE_FAILED' });

        expect(vscode.window.showWarningMessage).toHaveBeenLastCalledWith(
            'Site configuration incomplete.',
        );
    });

    it('warns that Commerce features need a manual mesh redeploy when that step failed', async () => {
        await run({ success: true, errorType: 'MESH_REDEPLOY_FAILED', error: 'Mesh deploy timed out.' });

        expect(vscode.window.showWarningMessage).toHaveBeenLastCalledWith(
            'Mesh deploy timed out. Commerce features may not work until mesh is manually redeployed.',
        );
    });
});

describe('reset notifications — the App is missing', () => {
    const missingApp: EdsResetResult = {
        success: false,
        errorType: 'GITHUB_APP_NOT_INSTALLED',
        errorDetails: { owner: 'acme', repo: 'shop', installUrl: 'https://install.example' },
    };

    it('names the repo and offers to install the App', async () => {
        await run(missingApp);

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('not installed on acme/shop'),
            'Install GitHub App',
        );
        expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });

    it('opens the install URL when that button is chosen', async () => {
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Install GitHub App');

        await run(missingApp);

        expect(vscode.Uri.parse).toHaveBeenCalledWith('https://install.example');
        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
    });

    it('opens nothing when the button is chosen but no install URL came back', async () => {
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Install GitHub App');

        await run({ ...missingApp, errorDetails: { owner: 'acme', repo: 'shop' } });

        expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });

    it('still shows the error, and survives the button, when the result carried no details', async () => {
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Install GitHub App');

        await expect(run({ success: false, errorType: 'GITHUB_APP_NOT_INSTALLED' })).resolves.toMatchObject({
            success: false,
        });

        expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(1);
        expect(vscode.env.openExternal).not.toHaveBeenCalled();
    });
});

describe('reset notifications — failure', () => {
    it('shows the error with no button by default', async () => {
        await run({ success: false, error: 'boom' });

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(FAILED);
    });

    it('shows nothing for a failure that carries no error text (a cancel)', async () => {
        await run({ success: false, cancelled: true });

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it('offers Show Logs when asked, and opens the log channel on it', async () => {
        (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue('Show Logs');

        await run({ success: false, error: 'boom' }, { showLogsOnError: true });
        await flush();

        expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(FAILED, 'Show Logs');
        expect(mockShowLogs).toHaveBeenCalledWith(false);
    });

    it('leaves the log channel alone when Show Logs is dismissed', async () => {
        await run({ success: false, error: 'boom' }, { showLogsOnError: true });
        await flush();

        expect(mockShowLogs).not.toHaveBeenCalled();
    });
});
