/**
 * UpdateManager — what it ASKS its collaborators and the decision behind each answer.
 *
 * The sibling suites assert what checkExtensionUpdate and checkAllProjectsForUpdates
 * return. This one pins what they ask for and why: the GitHub URL and headers per
 * channel, the setting they read, which component paths are probed on disk, which
 * project's repoUrl resolves a component (through the REAL URL parser), the failure
 * wording per HTTP status that reaches Debug Logs, and how the asset, notes and tag
 * of a release are read.
 */

jest.mock('fs/promises', () => ({
    access: jest.fn(),
}));

jest.mock('@/features/updates/services/collaboratorGate', () => ({
    isRepoCollaborator: jest.fn(),
    clearCollaboratorCache: jest.fn(),
}));

// components.json is never read: the registry lookup is scripted per test, while
// extractRepositoryFromUrl is the REAL one so a bad repoUrl is judged by the parser,
// not by a fake's answer.
const mockGetRepositoryInfo = jest.fn();
jest.mock('@/features/updates/services/componentRepositoryResolver', () => {
    const { ComponentRepositoryResolver: Real } = jest.requireActual(
        '@/features/updates/services/componentRepositoryResolver'
    );
    return {
        ComponentRepositoryResolver: jest.fn().mockImplementation(() => ({
            getRepositoryInfo: (id: string) => mockGetRepositoryInfo(id),
            extractRepositoryFromUrl: (url: string) => Real.prototype.extractRepositoryFromUrl(url),
        })),
    };
});

global.fetch = jest.fn();

// The shared mock wall FIRST, so its jest.mock calls register before the subject binds.
import { UpdateManager, vscode } from './updateManager.testUtils';
import {
    createUpdateManagerContext,
    createMockLogger,
    createMockWorkspaceConfig,
    createMockReleasesArray,
    createUpdateManagerProject,
} from './updateManager.testUtils';
import * as fs from 'fs/promises';
import { isRepoCollaborator } from '@/features/updates/services/collaboratorGate';

const fetchMock = global.fetch as jest.Mock;
const accessMock = fs.access as jest.Mock;
const gateMock = isRepoCollaborator as jest.Mock;

const EXTENSION_API = 'https://api.github.com/repos/skukla/demo-builder-vscode';
const EXPECTED_HEADERS = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Demo-Builder-VSCode',
    Authorization: 'token mock-github-token',
};

function vsixUrl(version: string): string {
    return `https://github.com/skukla/demo-builder-vscode/releases/download/v${version}/extension.vsix`;
}

/** A single-object (stable) extension release with one .vsix asset. */
function vsixRelease(version: string, extra: Record<string, unknown> = {}) {
    return {
        tag_name: `v${version}`,
        body: `Notes for ${version}`,
        published_at: '2024-01-01T00:00:00Z',
        prerelease: false,
        draft: false,
        assets: [{ name: 'extension.vsix', browser_download_url: vsixUrl(version) }],
        ...extra,
    };
}

/** A single-object component release: no assets, a zipball. */
function zipRelease(version: string, extra: Record<string, unknown> = {}) {
    return {
        tag_name: `v${version}`,
        body: `Notes for ${version}`,
        published_at: '2024-01-01T00:00:00Z',
        prerelease: false,
        draft: false,
        assets: [],
        zipball_url: `https://api.github.com/repos/acme/widget/zipball/v${version}`,
        ...extra,
    };
}

/** Every fetch answers with `body` at `status` — a body that would READ as an update. */
function respond(body: unknown, status = 200): void {
    fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

function setChannel(channel: string): jest.Mock {
    const config = createMockWorkspaceConfig(channel);
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(config);
    return config.get;
}

function component(id: string, version: string, extra: { repoUrl?: string; path?: string } = {}) {
    return { id, version, path: `/projects/demo/${id}`, ...extra };
}

let logger: ReturnType<typeof createMockLogger>;
let manager: UpdateManager;

beforeEach(() => {
    jest.clearAllMocks();
    accessMock.mockResolvedValue(undefined);
    mockGetRepositoryInfo.mockResolvedValue(null);
    setChannel('stable');
    logger = createMockLogger();
    manager = new UpdateManager(createUpdateManagerContext('1.0.0'), logger);
});

describe('what it asks GitHub for', () => {
    it('reads demoBuilder.updateChannel with a stable default', async () => {
        const get = setChannel('stable');
        respond(vsixRelease('1.1.0'));

        await manager.checkExtensionUpdate();

        expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('demoBuilder');
        expect(get).toHaveBeenCalledWith('updateChannel', 'stable');
    });

    it('stable: the extension repo latest-release endpoint with the token headers', async () => {
        respond(vsixRelease('1.1.0'));

        await manager.checkExtensionUpdate();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            `${EXTENSION_API}/releases/latest`,
            expect.objectContaining({ headers: EXPECTED_HEADERS })
        );
    });

    it('beta: the release list endpoint', async () => {
        setChannel('beta');
        respond(createMockReleasesArray());

        await manager.checkExtensionUpdate();

        expect(fetchMock).toHaveBeenCalledWith(
            `${EXTENSION_API}/releases?per_page=20`,
            expect.objectContaining({ headers: EXPECTED_HEADERS })
        );
    });

    it('getLatestFinalVersion asks for the stable release whatever the channel says', async () => {
        setChannel('early-access');
        gateMock.mockResolvedValue(true);
        respond(vsixRelease('1.4.0'));

        await expect(manager.getLatestFinalVersion()).resolves.toBe('1.4.0');

        expect(fetchMock).toHaveBeenCalledWith(
            `${EXTENSION_API}/releases/latest`,
            expect.anything()
        );
        expect(gateMock).not.toHaveBeenCalled();
    });

    it('getLatestFinalVersion is null when there is no stable release', async () => {
        respond(vsixRelease('9.9.9'), 404);

        await expect(manager.getLatestFinalVersion()).resolves.toBeNull();
    });
});

describe('component channel', () => {
    const project = () =>
        createUpdateManagerProject([
            component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/widget' }),
        ]);

    it('stable stays stable: the latest-release endpoint of the component repo', async () => {
        respond(zipRelease('1.1.0'));

        const results = await manager.checkAllProjectsForUpdates([project()]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/acme/widget/releases/latest',
            expect.objectContaining({ headers: EXPECTED_HEADERS })
        );
        expect(results.map((r) => r.latestVersion)).toEqual(['1.1.0']);
    });

    it('early-access collapses to beta: the list endpoint, the beta picked, the gate unasked', async () => {
        setChannel('early-access');
        const withZipball = createMockReleasesArray({
            final: '1.1.0',
            beta: '1.2.0-beta.1',
            alpha: '2.0.0-alpha.1',
        }).map((r) => ({
            ...r,
            zipball_url: `https://api.github.com/repos/acme/widget/zipball/${r.tag_name}`,
        }));
        respond(withZipball);

        const results = await manager.checkAllProjectsForUpdates([project()]);

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/acme/widget/releases?per_page=20',
            expect.anything()
        );
        expect(results.map((r) => r.latestVersion)).toEqual(['1.2.0-beta.1']);
        expect(gateMock).not.toHaveBeenCalled();
    });
});

describe('which components are checked', () => {
    it('a component with no path is neither probed on disk nor resolved', async () => {
        const project = createUpdateManagerProject([
            { id: 'ghost', version: '1.0.0' },
            component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/widget' }),
        ]);
        respond(zipRelease('1.1.0'));

        const results = await manager.checkAllProjectsForUpdates([project]);

        expect(accessMock).toHaveBeenCalledTimes(1);
        expect(accessMock).toHaveBeenCalledWith('/projects/demo/widget');
        expect(mockGetRepositoryInfo).not.toHaveBeenCalledWith('ghost');
        expect(results.map((r) => r.componentId)).toEqual(['widget']);
    });

    it('a component whose path is gone from disk is skipped after being probed', async () => {
        accessMock.mockImplementation(async (p: string) => {
            if (p === '/projects/demo/gone') throw new Error('ENOENT');
        });
        const project = createUpdateManagerProject([
            component('gone', '1.0.0', { repoUrl: 'https://github.com/acme/gone' }),
            component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/widget' }),
        ]);
        respond(zipRelease('1.1.0'));

        const results = await manager.checkAllProjectsForUpdates([project]);

        expect(accessMock).toHaveBeenCalledWith('/projects/demo/gone');
        expect(mockGetRepositoryInfo).not.toHaveBeenCalledWith('gone');
        expect(results.map((r) => r.componentId)).toEqual(['widget']);
    });

    it('a component with no recorded version is outdated as "unknown"', async () => {
        const project = {
            ...createUpdateManagerProject([
                component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/widget' }),
            ]),
            componentVersions: {},
        };
        respond(zipRelease('1.0.0'));

        const results = await manager.checkAllProjectsForUpdates([project]);

        expect(results[0].outdatedProjects).toEqual([{ project, currentVersion: 'unknown' }]);
    });

    it('lists only the projects behind the release, each with its own version', async () => {
        const current = {
            ...createUpdateManagerProject([
                component('widget', '1.1.0', { repoUrl: 'https://github.com/acme/widget' }),
            ]),
            name: 'current',
        };
        const behind = {
            ...createUpdateManagerProject([
                component('widget', '0.9.0', { repoUrl: 'https://github.com/acme/widget' }),
            ]),
            name: 'behind',
        };
        respond(zipRelease('1.1.0'));

        const results = await manager.checkAllProjectsForUpdates([current, behind]);

        expect(results).toHaveLength(1);
        expect(results[0].outdatedProjects).toEqual([{ project: behind, currentVersion: '0.9.0' }]);
    });

    it('a component every project already has at the latest version is not reported', async () => {
        const project = createUpdateManagerProject([
            component('widget', '1.1.0', { repoUrl: 'https://github.com/acme/widget' }),
        ]);
        respond(zipRelease('1.1.0'));

        await expect(manager.checkAllProjectsForUpdates([project])).resolves.toEqual([]);
    });
});

describe('resolving the repository', () => {
    it('the registry wins over the instance repoUrl', async () => {
        mockGetRepositoryInfo.mockResolvedValue({
            id: 'widget',
            repository: 'registry/widget',
            name: 'Widget',
        });
        const project = createUpdateManagerProject([
            component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/widget' }),
        ]);
        respond(zipRelease('1.1.0'));

        await manager.checkAllProjectsForUpdates([project]);

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/registry/widget/releases/latest',
            expect.anything()
        );
    });

    it('falls back to the first project whose instance carries a repoUrl', async () => {
        const bare = {
            ...createUpdateManagerProject([component('widget', '1.0.0')]),
            name: 'bare',
        };
        const withUrl = {
            ...createUpdateManagerProject([
                component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/widget.git' }),
            ]),
            name: 'with-url',
        };
        respond(zipRelease('1.1.0'));

        const results = await manager.checkAllProjectsForUpdates([bare, withUrl]);

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/acme/widget/releases/latest',
            expect.anything()
        );
        expect(results[0].outdatedProjects.map((o) => o.project.name)).toEqual([
            'bare',
            'with-url',
        ]);
    });

    it('stops at the first project that resolves', async () => {
        const first = {
            ...createUpdateManagerProject([
                component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/first' }),
            ]),
            name: 'first',
        };
        const bare = {
            ...createUpdateManagerProject([component('widget', '1.0.0')]),
            name: 'bare',
        };
        respond(zipRelease('1.1.0'));

        const results = await manager.checkAllProjectsForUpdates([first, bare]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.github.com/repos/acme/first/releases/latest',
            expect.anything()
        );
        expect(results).toHaveLength(1);
    });

    it('a component nothing can resolve is skipped without a fetch', async () => {
        const project = createUpdateManagerProject([component('widget', '1.0.0')]);

        await expect(manager.checkAllProjectsForUpdates([project])).resolves.toEqual([]);

        expect(mockGetRepositoryInfo).toHaveBeenCalledWith('widget');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a repoUrl that is not a GitHub URL is skipped without a fetch', async () => {
        const project = createUpdateManagerProject([
            component('widget', '1.0.0', { repoUrl: 'https://gitlab.com/acme/widget' }),
        ]);

        await expect(manager.checkAllProjectsForUpdates([project])).resolves.toEqual([]);

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a component whose repo has no release is skipped', async () => {
        const project = createUpdateManagerProject([
            component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/widget' }),
        ]);
        respond(zipRelease('1.1.0'), 404);

        await expect(manager.checkAllProjectsForUpdates([project])).resolves.toEqual([]);
    });
});

describe('how a release is read', () => {
    it('the extension takes its .vsix asset, whatever else is attached', async () => {
        respond(
            vsixRelease('1.1.0', {
                assets: [
                    {
                        name: 'checksums.txt',
                        browser_download_url:
                            'https://github.com/skukla/demo-builder-vscode/releases/download/v1.1.0/checksums.txt',
                    },
                    { name: 'extension.vsix', browser_download_url: vsixUrl('1.1.0') },
                ],
            })
        );

        const result = await manager.checkExtensionUpdate();

        expect(result.releaseInfo?.downloadUrl).toBe(vsixUrl('1.1.0'));
    });

    it('a component takes the zipball', async () => {
        const project = createUpdateManagerProject([
            component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/widget' }),
        ]);
        respond(zipRelease('1.1.0'));

        const results = await manager.checkAllProjectsForUpdates([project]);

        expect(results[0].releaseInfo?.downloadUrl).toBe(
            'https://api.github.com/repos/acme/widget/zipball/v1.1.0'
        );
    });

    it('a component release without a zipball is a quiet no-update', async () => {
        const project = createUpdateManagerProject([
            component('widget', '1.0.0', { repoUrl: 'https://github.com/acme/widget' }),
        ]);
        respond(zipRelease('1.1.0', { zipball_url: '' }));

        await expect(manager.checkAllProjectsForUpdates([project])).resolves.toEqual([]);

        expect(logger.debug).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('an extension release with no .vsix is a quiet no-update', async () => {
        respond(vsixRelease('1.1.0', { assets: [] }));

        const result = await manager.checkExtensionUpdate();

        expect(result).toEqual({ hasUpdate: false, current: '1.0.0', latest: '1.0.0' });
        expect(logger.debug).not.toHaveBeenCalled();
    });

    it('carries the release notes, the date and the prerelease flag through', async () => {
        respond(vsixRelease('1.1.0', { body: 'What changed', prerelease: true }));

        const result = await manager.checkExtensionUpdate();

        expect(result.releaseInfo).toEqual({
            version: '1.1.0',
            downloadUrl: vsixUrl('1.1.0'),
            releaseNotes: 'What changed',
            publishedAt: '2024-01-01T00:00:00Z',
            isPrerelease: true,
        });
    });

    it('substitutes a placeholder when the release has no notes', async () => {
        respond(vsixRelease('1.1.0', { body: '' }));

        const result = await manager.checkExtensionUpdate();

        expect(result.releaseInfo?.releaseNotes).toBe('No release notes available');
    });

    it('strips only a LEADING v from the tag', async () => {
        respond(vsixRelease('1.1.0', { tag_name: '2.0.0-dev.1' }));

        const result = await manager.checkExtensionUpdate();

        expect(result.latest).toBe('2.0.0-dev.1');
    });

    it('a tag that is not semver is no update, and says which tag', async () => {
        respond(vsixRelease('1.1.0', { tag_name: 'nightly' }));

        const result = await manager.checkExtensionUpdate();

        expect(result).toEqual({ hasUpdate: false, current: '1.0.0', latest: 'nightly' });
    });

    it('a release list with nothing the channel accepts is a quiet no-update', async () => {
        setChannel('beta');
        respond([{ ...vsixRelease('1.3.0'), draft: true }]);

        const result = await manager.checkExtensionUpdate();

        expect(result.hasUpdate).toBe(false);
        expect(logger.debug).not.toHaveBeenCalled();
    });

    it('a "Not Found" body is a quiet no-update', async () => {
        respond({ message: 'Not Found' });

        const result = await manager.checkExtensionUpdate();

        expect(result.hasUpdate).toBe(false);
        expect(logger.debug).not.toHaveBeenCalled();
    });
});

describe('a bad answer from GitHub', () => {
    // 403, 5xx and everything else are thrown and then caught by the same catch-all, so
    // they share one outcome; only a debug line differs, and that wording is deliberately
    // NOT asserted (.rptc/handoff/2026-09-02-equivalent-mutants.md). What IS pinned: a
    // non-OK body is never read as a release, and a 404 is silent.
    it('404: no release, nothing logged, and the body is not read as one', async () => {
        respond(vsixRelease('9.9.9'), 404);

        const result = await manager.checkExtensionUpdate();

        expect(result).toEqual({ hasUpdate: false, current: '1.0.0', latest: '1.0.0' });
        expect(logger.debug).not.toHaveBeenCalled();
    });

    it.each([403, 500, 503, 422])('%s: no release, and the body is not read as one', async (status) => {
        respond(vsixRelease('9.9.9'), status);

        const result = await manager.checkExtensionUpdate();

        expect(result).toEqual({ hasUpdate: false, current: '1.0.0', latest: '1.0.0' });
    });

    it('a network failure is no release', async () => {
        fetchMock.mockRejectedValue(new Error('socket hang up'));

        const result = await manager.checkExtensionUpdate();

        expect(result).toEqual({ hasUpdate: false, current: '1.0.0', latest: '1.0.0' });
    });
});
