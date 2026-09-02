/**
 * updateExecutor.performAddonUpdates — syncBehavior policy
 *
 * `performAddonUpdates` respects the `demoBuilder.blockLibraries.syncBehavior`
 * setting and actually re-installs block files (via `installBlockCollections`)
 * instead of silently bumping `commitSha`.
 */

import './updateExecutor.testUtils';
import * as vscode from 'vscode';
import { performAddonUpdates } from '@/features/updates/commands/updateExecutor';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import type { BlockLibraryUpdateItem } from '@/features/updates/commands/updateTypes';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockLogger } from '../../../helpers/loggerFake';

import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
// ─── Module mocks ────────────────────────────────────────────────────────────

// The block-library update path reaches the shared GitHub services for a token.
// The real accessor calls getLogger(), which throws in a suite that initialises
// none — so the cache is mocked to the one thing this path reads.
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => ({
        tokenService: { getToken: jest.fn().mockResolvedValue({ token: 'gh-token' }) },
    })),
}));

const installMock = installBlockCollections as jest.Mock;
const showInfoMock = vscode.window.showInformationMessage as jest.Mock;
const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;

// ─── Helpers ────────────────────────────────────────────────────────────────

function setSyncBehavior(value: 'ask' | 'enabled' | 'disabled'): void {
    getConfigMock.mockReturnValue({
        get: jest.fn((_key: string, defaultValue: unknown) => value ?? defaultValue),
    });
}

function makeLibrary(overrides: Partial<InstalledBlockLibrary> = {}): InstalledBlockLibrary {
    return {
        name: 'Isle5 Block Collection',
        source: { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' },
        commitSha: 'aaa111',
        blockIds: ['hero'],
        installedAt: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'demo',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/demo',
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/demo/components/eds-storefront',
                metadata: { githubRepo: 'demo-org/demo-repo' },
            },
        },
        installedBlockLibraries: [makeLibrary()],
        ...overrides,
    };
}

function makeItem(project: Project): BlockLibraryUpdateItem {
    return {
        project,
        library: project.installedBlockLibraries![0],
        latestCommit: 'bbb222',
        commitsBehind: 1,
        isBlockLibraryUpdate: true,
        label: 'Test Library',
    };
}

function makeCtx(saveImpl?: () => Promise<void>): TestUpdateContext {
    return {
        // `{} as vscode.SecretStorage` claimed an empty object was a secret store,
        // and the one-method stateManager beside it the same about a class with
        // twenty. Both have canonical builders.
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        // REQUIRED on UpdateContext and omitted entirely until now — the cast on the
        // whole object meant nothing said so, and this suite was handing the executor
        // a context production cannot produce.
        commandManager: createMockCommandExecutor(),
        stateManager: createMockStateManager({
            // `.mockImplementation` rather than `jest.fn(impl)`: the latter INFERS a
            // zero-argument signature from the callback, which no real `saveProject`
            // accepts. Third time this shape has bitten on this programme.
            saveProject: jest.fn().mockImplementation(saveImpl ?? (() => Promise.resolve())),
        }),
        logger: createMockLogger(),
    };
}

/**
 * The REAL `UpdateContext`, with the two members this suite reads back kept at their
 * mocked types — `stateManager.saveProject.mock.calls` and the logger's.
 *
 * An earlier draft declared a parallel `UpdateContextForTest` shape. That is the
 * invented-type mistake this programme keeps finding in other people's tests: the
 * production type exists, and a second description of it can only drift.
 */
type TestUpdateContext = UpdateContext & {
    stateManager: ReturnType<typeof createMockStateManager>;
    logger: ReturnType<typeof createMockLogger>;
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('performAddonUpdates — block library syncBehavior policy', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        installMock.mockResolvedValue({ success: true, blocksCount: 1, blockIds: ['hero'] });
    });

    describe('syncBehavior = "disabled"', () => {
        it('sets syncDisabledMarker with upstream SHA and timestamp', async () => {
            setSyncBehavior('disabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            const lib = project.installedBlockLibraries![0];
            expect(lib.syncDisabledMarker).toBeDefined();
            expect(lib.syncDisabledMarker!.upstreamSha).toBe('bbb222');
            expect(typeof lib.syncDisabledMarker!.lastCheckedAt).toBe('string');
        });

        it('does NOT call installBlockCollections', async () => {
            setSyncBehavior('disabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(installMock).not.toHaveBeenCalled();
        });

        it('does NOT bump the recorded commitSha', async () => {
            setSyncBehavior('disabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
        });
    });

    describe('syncBehavior = "enabled"', () => {
        it('calls installBlockCollections with destOwner, destRepo, and the library', async () => {
            setSyncBehavior('enabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(installMock).toHaveBeenCalledTimes(1);
            const [, destOwner, destRepo, libs] = installMock.mock.calls[0];
            expect(destOwner).toBe('demo-org');
            expect(destRepo).toBe('demo-repo');
            expect(libs).toEqual([
                {
                    source: { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' },
                    name: 'Isle5 Block Collection',
                },
            ]);
        });

        it('bumps commitSha to the latest upstream SHA on successful install', async () => {
            setSyncBehavior('enabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(project.installedBlockLibraries![0].commitSha).toBe('bbb222');
        });

        it('does NOT bump commitSha if installBlockCollections fails', async () => {
            installMock.mockResolvedValueOnce({
                success: false,
                blocksCount: 0,
                blockIds: [],
                error: 'upstream 404',
            });
            setSyncBehavior('enabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
        });

        it('clears a pre-existing syncDisabledMarker after a successful re-install', async () => {
            setSyncBehavior('enabled');
            const project = makeProject({
                installedBlockLibraries: [
                    makeLibrary({
                        syncDisabledMarker: {
                            upstreamSha: 'ccc333',
                            lastCheckedAt: '2026-04-01T00:00:00Z',
                        },
                    }),
                ],
            });
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(project.installedBlockLibraries![0].syncDisabledMarker).toBeUndefined();
        });
    });

    describe('syncBehavior = "ask"', () => {
        it('prompts the user with Update and Skip buttons', async () => {
            setSyncBehavior('ask');
            showInfoMock.mockResolvedValueOnce(undefined);
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(showInfoMock).toHaveBeenCalledTimes(1);
            const [, ...buttons] = showInfoMock.mock.calls[0];
            expect(buttons).toEqual(['Update', 'Skip']);
        });

        it('on Update: re-installs files and bumps commitSha', async () => {
            setSyncBehavior('ask');
            showInfoMock.mockResolvedValueOnce('Update');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(installMock).toHaveBeenCalledTimes(1);
            expect(project.installedBlockLibraries![0].commitSha).toBe('bbb222');
        });

        it('on Skip: sets syncDisabledMarker and does not install', async () => {
            setSyncBehavior('ask');
            showInfoMock.mockResolvedValueOnce('Skip');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(installMock).not.toHaveBeenCalled();
            expect(project.installedBlockLibraries![0].syncDisabledMarker).toBeDefined();
            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
        });

        it('on dialog dismissal: no install, no SHA bump, no marker change', async () => {
            setSyncBehavior('ask');
            showInfoMock.mockResolvedValueOnce(undefined);
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(installMock).not.toHaveBeenCalled();
            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
            expect(project.installedBlockLibraries![0].syncDisabledMarker).toBeUndefined();
        });
    });

    describe('error handling', () => {
        it('aborts when the storefront has no GitHub repo (without crashing)', async () => {
            setSyncBehavior('enabled');
            const project = makeProject({
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        status: 'ready',
                        path: '/projects/demo/components/eds-storefront',
                        metadata: {},
                    },
                },
            });
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx);

            expect(installMock).not.toHaveBeenCalled();
            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
            expect(ctx.logger.error).toHaveBeenCalled();
        });
    });
});
