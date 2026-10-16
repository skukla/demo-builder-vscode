/**
 * The Configure shell around pending block library work (EDS-39).
 *
 * This file is the boundary: it fetches the collaborators, asks for a DA.live
 * sign-in when a removal needs one, and answers each result line for its caller to
 * say. So what it is tested on is what it HANDS the service — which GitHub object,
 * which DA.live object or none — and the lines it answers.
 */

const SHARED_FILE_OPS = { origin: 'shared-github-file-operations' };
const BLOCK_LIB_OPS = { origin: 'da-live-block-lib-ops' };
const AUTH_SERVICE = { origin: 'da-live-auth-service' };
const TOKEN_PROVIDER = { origin: 'da-live-token-provider' };

const mockEnsureDaLiveAuth = jest.fn();
const mockApply = jest.fn();
const mockRefresh = jest.fn();
const daLiveContentOpsCtor = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: (...args: unknown[]) => mockEnsureDaLiveAuth(...args),
    getDaLiveAuthService: jest.fn(() => AUTH_SERVICE),
    getGitHubServices: jest.fn(() => ({ fileOperations: SHARED_FILE_OPS })),
}));
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => TOKEN_PROVIDER),
}));
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: class {
        blockLibOps = BLOCK_LIB_OPS;
        constructor(...args: unknown[]) {
            daLiveContentOpsCtor(...args);
        }
    },
}));
jest.mock('@/features/eds/services/refreshBlockLibraryHeadless', () => ({
    refreshBlockLibraryHeadless: (...args: unknown[]) => mockRefresh(...args),
}));
jest.mock('@/features/dashboard/services/configureBlockLibraryWork', () => ({
    ...jest.requireActual('@/features/dashboard/services/configureBlockLibraryWork'),
    applyPendingBlockLibraryWork: (...args: unknown[]) => mockApply(...args),
}));

import * as vscode from 'vscode';
import { ServiceLocator } from '@/core/di/serviceLocator';
import blockLibraries from '@/features/components/config/block-libraries.json';
import { runPendingBlockLibraryWork } from '@/features/dashboard/commands/configureBlockLibraryExecutor';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import type { Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const DEMO_TEAM = blockLibraries.libraries.find((l) => l.id === 'demo-team-blocks');
if (!DEMO_TEAM) throw new Error('demo-team-blocks is not in block-libraries.json');
const DEMO_BUILDER = blockLibraries.libraries.find((l) => l.id === 'demo-builder-blocks');
if (!DEMO_BUILDER) throw new Error('demo-builder-blocks is not in block-libraries.json');

/**
 * Every storefront has Demo Builder Blocks (always included, owner decision 2026-10-15);
 * without its record every project here would have an install pending.
 */
const DEMO_BUILDER_RECORD = {
    name: DEMO_BUILDER.name,
    source: DEMO_BUILDER.source,
    commitSha: 'c'.repeat(40),
    blockIds: ['catalog-menu'],
    installedAt: '2026-10-01T00:00:00.000Z',
};

function edsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        selectedStack: 'eds-accs',
        selectedPackage: 'citisignal',
        selectedBlockLibraries: [],
        installedBlockLibraries: [DEMO_BUILDER_RECORD],
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                metadata: { githubRepo: 'me/demo-storefront' },
            },
        },
        ...overrides,
    });
}

/** Ticked, and not in the storefront yet. */
const withInstallPending = () => edsProject({ selectedBlockLibraries: ['demo-team-blocks'] });

/** In the storefront, and no longer ticked. */
const withRemovalPending = () =>
    edsProject({
        installedBlockLibraries: [
            DEMO_BUILDER_RECORD,
            {
                name: DEMO_TEAM.name,
                source: DEMO_TEAM.source,
                commitSha: 'c'.repeat(40),
                blockIds: ['hero'],
                installedAt: '2026-10-01T00:00:00.000Z',
            },
        ],
    });

function makeParts() {
    return {
        context: createMockExtensionContext(),
        stateManager: createMockStateManager(),
        logger: createMockLogger(),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockApply.mockResolvedValue({ lines: [], storefrontChanged: false });
    mockRefresh.mockResolvedValue({ success: true });
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    ServiceLocator.setCommandExecutor(createMockCommandExecutor());
});

describe('runPendingBlockLibraryWork', () => {
    it('fetches nothing and asks nothing when no library work is pending', async () => {
        await runPendingBlockLibraryWork(edsProject(), makeParts(), jest.fn());

        expect(mockApply).not.toHaveBeenCalled();
        expect(mockEnsureDaLiveAuth).not.toHaveBeenCalled();
        expect(getGitHubServices).not.toHaveBeenCalled();
    });

    it('hands the installer the context Check for Updates builds, and the shared GitHub object', async () => {
        const parts = makeParts();
        const project = withInstallPending();
        const report = jest.fn();

        await runPendingBlockLibraryWork(project, parts, report);

        expect(getGitHubServices).toHaveBeenCalledWith(parts.context.secrets);
        expect(mockApply).toHaveBeenCalledTimes(1);
        const [handedProject, deps, handedReport] = mockApply.mock.calls[0];
        expect(handedProject).toBe(project);
        expect(handedReport).toBe(report);
        expect(deps.updateContext).toEqual({
            secrets: parts.context.secrets,
            extensionPath: parts.context.extensionPath,
            stateManager: parts.stateManager,
            logger: parts.logger,
            commandManager: ServiceLocator.getCommandExecutor(),
        });
        expect(deps.uninstall.fileOps).toBe(SHARED_FILE_OPS);
        expect(deps.uninstall.stateManager).toBe(parts.stateManager);
    });

    it('does not ask for a DA.live sign-in when there is only an install to do', async () => {
        await runPendingBlockLibraryWork(withInstallPending(), makeParts(), jest.fn());

        expect(mockEnsureDaLiveAuth).not.toHaveBeenCalled();
        expect(mockApply.mock.calls[0][1].uninstall.daLive).toBeUndefined();
    });

    it('asks for the DA.live session before a removal and hands over the block list', async () => {
        const parts = makeParts();

        await runPendingBlockLibraryWork(withRemovalPending(), parts, jest.fn());

        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith(
            { context: parts.context, logger: parts.logger },
            '[Configure]',
        );
        expect(getDaLiveAuthService).toHaveBeenCalledWith(parts.context);
        expect(daLiveContentOpsCtor).toHaveBeenCalledWith(TOKEN_PROVIDER, parts.logger);
        expect(mockApply.mock.calls[0][1].uninstall.daLive).toBe(BLOCK_LIB_OPS);
    });

    it('still runs the removal with no DA.live block list when the sign-in is declined', async () => {
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        await runPendingBlockLibraryWork(withRemovalPending(), makeParts(), jest.fn());

        expect(mockApply).toHaveBeenCalledTimes(1);
        expect(mockApply.mock.calls[0][1].uninstall.daLive).toBeUndefined();
        expect(daLiveContentOpsCtor).not.toHaveBeenCalled();
    });

    it('answers each line, and shows none itself: the caller says them', async () => {
        const lines = [
            { level: 'info', text: 'Added 2 blocks.' },
            { level: 'warning', text: 'Left 1 in place: hero.' },
            { level: 'error', text: 'Failed to remove X.' },
        ];
        mockApply.mockResolvedValue({ storefrontChanged: false, lines });

        const answered = await runPendingBlockLibraryWork(withInstallPending(), makeParts(), jest.fn());

        expect(answered).toEqual(lines);
        expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('refreshes the DA.live block list after a library was added or removed, under its own stage', async () => {
        mockApply.mockResolvedValue({
            storefrontChanged: true,
            lines: [{ level: 'info', text: 'Added 2 blocks.' }],
            addedBlockIds: ['cards', 'hero'],
        });
        const parts = makeParts();
        const project = withInstallPending();
        const report = jest.fn();

        const answered = await runPendingBlockLibraryWork(project, parts, report);

        // The existing refresh, handed THIS project and the command's own context, and
        // told to publish only the doc pages of the blocks just added.
        expect(mockRefresh).toHaveBeenCalledTimes(1);
        expect(mockRefresh).toHaveBeenCalledWith(
            expect.objectContaining({
                project,
                context: parts.context,
                logger: parts.logger,
                publishOnlyBlocks: ['cards', 'hero'],
            }),
        );
        expect(report).toHaveBeenCalledWith('Publishing the block list');
        // Its own progress lines are steps under that stage.
        mockRefresh.mock.calls[0][0].onProgress('Publishing 9 library paths');
        expect(report).toHaveBeenLastCalledWith('Publishing the block list', 'Publishing 9 library paths');
        expect(answered).toEqual([{ level: 'info', text: 'Added 2 blocks.' }]);
    });

    it('does not refresh when nothing was added or removed', async () => {
        mockApply.mockResolvedValue({
            storefrontChanged: false,
            lines: [{ level: 'warning', text: 'Left 1 in place: hero.' }],
        });

        await runPendingBlockLibraryWork(withRemovalPending(), makeParts(), jest.fn());

        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('says so in plain words when the refresh fails, after the result it does not undo', async () => {
        mockApply.mockResolvedValue({
            storefrontChanged: true,
            lines: [{ level: 'info', text: 'Added 2 blocks.' }],
        });
        mockRefresh.mockResolvedValue({ success: false, error: 'DA.live answered 503' });

        const answered = await runPendingBlockLibraryWork(withInstallPending(), makeParts(), jest.fn());

        expect(answered).toEqual([
            { level: 'info', text: 'Added 2 blocks.' },
            {
                level: 'warning',
                text:
                    'The storefront files were changed, but the DA.live block list was not refreshed ' +
                    '(DA.live answered 503). Run Refresh Block Library from the dashboard.',
            },
        ]);
    });

    it('says the same when the refresh throws', async () => {
        mockApply.mockResolvedValue({ storefrontChanged: true, lines: [] });
        mockRefresh.mockRejectedValue(new Error('network down'));

        const answered = await runPendingBlockLibraryWork(withInstallPending(), makeParts(), jest.fn());

        expect(answered).toEqual([
            {
                level: 'warning',
                text:
                    'The storefront files were changed, but the DA.live block list was not refreshed ' +
                    '(network down). Run Refresh Block Library from the dashboard.',
            },
        ]);
    });
});
