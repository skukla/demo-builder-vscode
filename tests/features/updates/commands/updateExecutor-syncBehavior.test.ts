/**
 * updateExecutor.performAddonUpdates — syncBehavior policy
 *
 * Tests the Cycle B Step 6h fix: `performAddonUpdates` now respects the
 * `demoBuilder.blockLibraries.syncBehavior` setting and actually re-installs
 * block files (via `installBlockCollections`) instead of silently bumping
 * `commitSha`.
 */

import * as vscode from 'vscode';
import { performAddonUpdates } from '@/features/updates/commands/updateExecutor';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import type { BlockLibraryUpdateItem } from '@/features/updates/commands/updateTypes';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';

// ─── Module mocks ────────────────────────────────────────────────────────────

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn(),
}));

jest.mock('@/features/eds/services/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn(),
}));

jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
    },
    workspace: {
        getConfiguration: jest.fn(),
    },
}), { virtual: true });

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
    };
}

function makeCtx(saveImpl?: () => Promise<void>): {
    secrets: vscode.SecretStorage;
    extensionPath: string;
    stateManager: { saveProject: jest.Mock };
    logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };
} {
    return {
        secrets: {} as vscode.SecretStorage,
        extensionPath: '/ext',
        stateManager: { saveProject: jest.fn(saveImpl ?? (() => Promise.resolve())) },
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('performAddonUpdates — block library syncBehavior policy (Cycle B Step 6h)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        installMock.mockResolvedValue({ success: true, blocksCount: 1, blockIds: ['hero'] });
    });

    describe('syncBehavior = "disabled"', () => {
        it('sets syncDisabledMarker with upstream SHA and timestamp', async () => {
            setSyncBehavior('disabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            const lib = project.installedBlockLibraries![0];
            expect(lib.syncDisabledMarker).toBeDefined();
            expect(lib.syncDisabledMarker!.upstreamSha).toBe('bbb222');
            expect(typeof lib.syncDisabledMarker!.lastCheckedAt).toBe('string');
        });

        it('does NOT call installBlockCollections', async () => {
            setSyncBehavior('disabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(installMock).not.toHaveBeenCalled();
        });

        it('does NOT bump the recorded commitSha', async () => {
            setSyncBehavior('disabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
        });
    });

    describe('syncBehavior = "enabled"', () => {
        it('calls installBlockCollections with destOwner, destRepo, and the library', async () => {
            setSyncBehavior('enabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(installMock).toHaveBeenCalledTimes(1);
            const [, destOwner, destRepo, libs] = installMock.mock.calls[0];
            expect(destOwner).toBe('demo-org');
            expect(destRepo).toBe('demo-repo');
            expect(libs).toEqual([{ source: { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' }, name: 'Isle5 Block Collection' }]);
        });

        it('bumps commitSha to the latest upstream SHA on successful install', async () => {
            setSyncBehavior('enabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(project.installedBlockLibraries![0].commitSha).toBe('bbb222');
        });

        it('does NOT bump commitSha if installBlockCollections fails', async () => {
            installMock.mockResolvedValueOnce({ success: false, blocksCount: 0, blockIds: [], error: 'upstream 404' });
            setSyncBehavior('enabled');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
        });

        it('clears a pre-existing syncDisabledMarker after a successful re-install', async () => {
            setSyncBehavior('enabled');
            const project = makeProject({
                installedBlockLibraries: [makeLibrary({
                    syncDisabledMarker: { upstreamSha: 'ccc333', lastCheckedAt: '2026-04-01T00:00:00Z' },
                })],
            });
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(project.installedBlockLibraries![0].syncDisabledMarker).toBeUndefined();
        });
    });

    describe('syncBehavior = "ask"', () => {
        it('prompts the user with Update and Skip buttons', async () => {
            setSyncBehavior('ask');
            showInfoMock.mockResolvedValueOnce(undefined);
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(showInfoMock).toHaveBeenCalledTimes(1);
            const [, ...buttons] = showInfoMock.mock.calls[0];
            expect(buttons).toEqual(['Update', 'Skip']);
        });

        it('on Update: re-installs files and bumps commitSha', async () => {
            setSyncBehavior('ask');
            showInfoMock.mockResolvedValueOnce('Update');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(installMock).toHaveBeenCalledTimes(1);
            expect(project.installedBlockLibraries![0].commitSha).toBe('bbb222');
        });

        it('on Skip: sets syncDisabledMarker and does not install', async () => {
            setSyncBehavior('ask');
            showInfoMock.mockResolvedValueOnce('Skip');
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(installMock).not.toHaveBeenCalled();
            expect(project.installedBlockLibraries![0].syncDisabledMarker).toBeDefined();
            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
        });

        it('on dialog dismissal: no install, no SHA bump, no marker change', async () => {
            setSyncBehavior('ask');
            showInfoMock.mockResolvedValueOnce(undefined);
            const project = makeProject();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

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

            await performAddonUpdates([makeItem(project)], [], new Set(), ctx as never);

            expect(installMock).not.toHaveBeenCalled();
            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
            expect(ctx.logger.error).toHaveBeenCalled();
        });
    });
});
