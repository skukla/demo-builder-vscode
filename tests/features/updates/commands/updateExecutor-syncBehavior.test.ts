/**
 * updateExecutor.performAddonUpdates — syncBehavior policy
 *
 * `performAddonUpdates` respects the `demoBuilder.blockLibraries.syncBehavior`
 * setting and actually re-installs block files (via `installBlockCollections`)
 * instead of silently bumping `commitSha`.
 */

import { makeUpdateContext as makeCtx } from './updateExecutor.testUtils';
import * as vscode from 'vscode';
import { performAddonUpdates } from '@/features/updates/commands/updateExecutor';
import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import type { BlockLibraryUpdateItem } from '@/features/updates/commands/updateTypes';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
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

    describe('template-sync dedup', () => {
        // The project's EDS metadata names the same repo the library came from.
        function projectSyncedFromLibrarySource(): Project {
            return makeProject({
                componentInstances: {
                    'eds-storefront': {
                        id: 'eds-storefront',
                        name: 'EDS Storefront',
                        status: 'ready',
                        path: '/projects/demo/components/eds-storefront',
                        metadata: {
                            githubRepo: 'demo-org/demo-repo',
                            templateOwner: 'stephen-garner-adobe',
                            templateRepo: 'isle5',
                        },
                    },
                },
            });
        }

        it('skips a library the template sync just covered — no install, no SHA bump, no prompt', async () => {
            setSyncBehavior('ask');
            const project = projectSyncedFromLibrarySource();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set([project.path]), ctx);

            expect(installMock).not.toHaveBeenCalled();
            expect(showInfoMock).not.toHaveBeenCalled();
            expect(project.installedBlockLibraries![0].commitSha).toBe('aaa111');
        });

        it('still applies the library when the template sync did NOT succeed for that project', async () => {
            setSyncBehavior('enabled');
            const project = projectSyncedFromLibrarySource();
            const ctx = makeCtx();

            await performAddonUpdates([makeItem(project)], [], new Set(['/projects/other']), ctx);

            expect(installMock).toHaveBeenCalledTimes(1);
            expect(project.installedBlockLibraries![0].commitSha).toBe('bbb222');
        });
    });

    describe('library not installed in the project', () => {
        it('returns before prompting when the selection names a library the project lacks', async () => {
            setSyncBehavior('ask');
            const project = makeProject();
            const ctx = makeCtx();
            const item = { ...makeItem(project), library: makeLibrary({ name: 'Ghost' }) };

            await performAddonUpdates([item], [], new Set(), ctx);

            expect(showInfoMock).not.toHaveBeenCalled();
            expect(installMock).not.toHaveBeenCalled();
            expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('treats a project with no installedBlockLibraries at all the same way, without throwing', async () => {
            setSyncBehavior('enabled');
            const project = makeProject({ installedBlockLibraries: undefined });
            const ctx = makeCtx();
            const item = { ...makeItem(makeProject()), project };

            await expect(performAddonUpdates([item], [], new Set(), ctx)).resolves.toBeUndefined();

            expect(installMock).not.toHaveBeenCalled();
            expect(ctx.logger.warn).toHaveBeenCalledTimes(1);
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
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
