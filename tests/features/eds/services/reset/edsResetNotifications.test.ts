/**
 * RENAMED from `edsResetUI-notifications.test.ts` on 2026-10-08 (EDS-8 split by job):
 * the result notifications moved to `edsResetNotifications.ts`.
 * A suite is paired with the module it is named for. Still driven through the
 * public entry point; no assertion changed in the rename.
 *
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
import { withModalWarning } from '@/features/eds/services/reset/edsResetNotifications';
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
    // R6: the progress itself ends with the outcome — the modal closes, a
    // background run says "— done". A toast on a timer used to hold the screen
    // after the work had finished.
    it('raises no success toast of its own', async () => {
        await run({ success: true });

        expect(vscode.window.withProgress).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('adds no warning to a clean success', async () => {
        await run({ success: true });

        // The confirmation prompt is the only warning shown.
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it('warns with the config-write remedy when the site config could not be written', async () => {
        await run({
            success: true,
            errorType: 'CONFIG_WRITE_FAILED',
            error: 'PDP routing is off.',
        });

        expect(vscode.window.showWarningMessage).toHaveBeenLastCalledWith('PDP routing is off.');
    });

    it('falls back to a generic config warning when no remedy text was given', async () => {
        await run({ success: true, errorType: 'CONFIG_WRITE_FAILED' });

        expect(vscode.window.showWarningMessage).toHaveBeenLastCalledWith(
            'Site configuration incomplete.'
        );
    });

    it('warns first that the code is not published, when the reset could not publish it', async () => {
        const codeNotPublished = 'The storefront code could not be published.';
        await run({
            success: true,
            codeNotPublished,
            errorType: 'CONFIG_WRITE_FAILED',
            error: 'PDP routing is off.',
        });

        const shown = (vscode.window.showWarningMessage as jest.Mock).mock.calls.map(
            ([message]) => message
        );
        expect(shown.slice(-2)).toEqual([codeNotPublished, 'PDP routing is off.']);
    });

    it('warns that Commerce features need a manual mesh redeploy when that step failed', async () => {
        await run({
            success: true,
            errorType: 'MESH_REDEPLOY_FAILED',
            error: 'Mesh deploy timed out.',
        });

        expect(vscode.window.showWarningMessage).toHaveBeenLastCalledWith(
            'Mesh deploy timed out. Commerce features may not work until mesh is manually redeployed.'
        );
    });
});

// EDS-55: what the content pipeline could not do arrives as one list (old pages that may
// still be live, pages the source has that did not arrive, an empty block palette); the
// pipeline decides what is a warning, and the reset shows each one, in order.
describe('reset notifications — what the content pipeline could not do (EDS-55)', () => {
    const leftover =
        'Pages from before the reset may still be live on main--r--o.aem.live: Helix could not list what is published (HTTP 401). Reset again to remove them.';
    const missing = '2 pages the source has are missing from this storefront: /cart, /checkout';

    it('warns with each sentence, in the order the pipeline gave them', async () => {
        await run({ success: true, pipelineWarnings: [leftover, missing] });

        const shown = (vscode.window.showWarningMessage as jest.Mock).mock.calls.map(
            ([message]) => message
        );
        expect(shown.slice(-2)).toEqual([leftover, missing]);
    });

    it('adds no warning when the pipeline had nothing to say', async () => {
        await run({ success: true });

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
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
            'Install GitHub App'
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

        await expect(
            run({ success: false, errorType: 'GITHUB_APP_NOT_INSTALLED' })
        ).resolves.toMatchObject({
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

// The page steps' sentences (2026-10-23): "13 category pages couldn't be published"
// reached only the Debug Logs. A step that left something undone is a warning.
describe('reset notifications — the page steps', () => {
    const UNDONE = "13 category pages couldn't be published; republish the storefront to try again.";

    it('warns with a page step that left pages undone', async () => {
        await run({ success: true, catalogMenu: UNDONE, pageWarnings: [UNDONE] });

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(UNDONE);
    });

    it('raises nothing for a page step that did all it set out to: a notification has no room for notes', async () => {
        await run({ success: true, productPages: 'Removed 49 product pages.' });

        // The confirmation prompt is the only warning shown.
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
    });
});

// The modal's last view (EDS-64): broken links are a line of their own, never a warning.
describe('withModalWarning — broken links', () => {
    const LINKS = '1 link in the copied content goes to a missing page: /fr (on /store-switcher).';

    it('puts them on their own line, not in the warning', () => {
        const result: EdsResetResult = { success: true, brokenLinks: LINKS };

        const shown = withModalWarning(result);

        expect(shown.details).toStrictEqual([LINKS]);
        expect(shown).not.toHaveProperty('warning');
    });
});

describe('withModalWarning — each page sentence on its own line', () => {
    it('lists what the page steps did and the broken links one line each, in that order', () => {
        const result: EdsResetResult = {
            success: true,
            catalogMenu: 'Wrote 12 category pages.',
            productPages: 'Removed 18 product pages from the old catalog.',
            brokenLinks: '2 links in the copied content go to missing pages: /a (on /footer), /b (on /x).',
        };

        expect(withModalWarning(result).details).toStrictEqual([
            'Wrote 12 category pages.',
            'Removed 18 product pages from the old catalog.',
            '2 links in the copied content go to missing pages: /a (on /footer), /b (on /x).',
        ]);
    });
});
