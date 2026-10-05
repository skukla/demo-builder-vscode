/**
 * blockLibraryInstall (EDS-28) — a library an existing storefront has SELECTED
 * but never received is found, installed through the installer updates use,
 * and recorded the way creation records it.
 *
 * `installBlockCollections` is REAL here. The GitHub file-operations class it
 * drives is the fake, so what these tests read back is the calls that would
 * reach GitHub — which repository was listed, and exactly which paths were
 * committed where. A mocked installer could not show a malformed call, nor
 * what happens when the storefront already has a block folder of the same name.
 *
 * The catalog is the bundled block-libraries.json: `demo-builder-blocks` and
 * its source are read from it, not restated.
 */

const fileOps = {
    listRepoFiles: jest.fn(),
    getBranchInfo: jest.fn(),
    getBlobContent: jest.fn(),
    getFileContent: jest.fn(),
    commitTreeToBranch: jest.fn(),
};
const GitHubFileOperationsCtor = jest.fn();
const tokenService = { getToken: jest.fn() };
const mockGetLatestBranchCommit = jest.fn();

jest.mock('@/features/eds/services/github/githubFileOperations', () => ({
    GitHubFileOperations: class {
        constructor(...args: unknown[]) {
            GitHubFileOperationsCtor(...args);
            Object.assign(this, fileOps);
        }
    },
}));
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => ({ tokenService })),
}));
jest.mock('@/features/updates/services/githubApiClient', () => ({
    getLatestBranchCommit: (...a: unknown[]) => mockGetLatestBranchCommit(...a),
}));

import blockLibraries from '@/features/components/config/block-libraries.json';
import {
    applyBlockLibraryInstall,
    describeInstallOutcome,
    describePendingInstall,
    findUninstalledBlockLibraries,
} from '@/features/updates/services/blockLibraryInstall';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const catalogEntry = blockLibraries.libraries.find((l) => l.id === 'demo-builder-blocks');
if (!catalogEntry) throw new Error('demo-builder-blocks is not in block-libraries.json');
const LIBRARY = { name: catalogEntry.name, source: catalogEntry.source };
const SRC = LIBRARY.source;

function edsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/p/demo',
        selectedPackage: 'citisignal',
        selectedBlockLibraries: ['demo-builder-blocks'],
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/p/demo/components/eds-storefront',
                metadata: {
                    githubRepo: 'me/demo-storefront',
                    templateOwner: 'adobe',
                    templateRepo: 'aem-boilerplate-commerce',
                },
            },
        },
        ...overrides,
    });
}

function installed(overrides: Partial<InstalledBlockLibrary> = {}): InstalledBlockLibrary {
    return {
        name: 'Some Other Blocks',
        source: { owner: 'acme', repo: 'blocks', branch: 'main' },
        commitSha: 'aaa',
        blockIds: ['hero'],
        installedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function makeCtx() {
    return {
        secrets: createMockSecretStorage().secrets,
        extensionPath: '/ext',
        stateManager: createMockStateManager(),
        commandManager: createMockCommandExecutor(),
        logger: createMockLogger(),
    } satisfies UpdateContext;
}

/** Script the two repositories: the storefront (destination) and the library (source). */
function repos(dest: string[], source: string[]): void {
    fileOps.listRepoFiles.mockImplementation(async (owner: string, repo: string) => {
        const paths = owner === 'me' && repo === 'demo-storefront' ? dest : source;
        return paths.map((path) => ({ path, sha: `sha:${path}` }));
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    fileOps.getBranchInfo.mockResolvedValue({ commitSha: 'src-commit-1', treeSha: 't' });
    fileOps.getBlobContent.mockImplementation(async (_o, _r, sha: string) => `content of ${sha}`);
    fileOps.getFileContent.mockResolvedValue(null);
    fileOps.commitTreeToBranch.mockResolvedValue(undefined);
    mockGetLatestBranchCommit.mockResolvedValue('src-commit-head');
});

describe('findUninstalledBlockLibraries', () => {
    it('finds a selected catalog library with no record, resolved to the catalog source', () => {
        expect(findUninstalledBlockLibraries(edsProject())).toEqual([LIBRARY]);
    });

    it('leaves out a library already recorded — by source repository or by name', () => {
        const bySource = edsProject({
            installedBlockLibraries: [installed({ name: 'renamed', source: SRC })],
        });
        const byName = edsProject({ installedBlockLibraries: [installed({ name: LIBRARY.name })] });

        expect(findUninstalledBlockLibraries(bySource)).toStrictEqual([]);
        expect(findUninstalledBlockLibraries(byName)).toStrictEqual([]);
    });

    it('still finds it when a DIFFERENT library is the only one recorded', () => {
        const project = edsProject({ installedBlockLibraries: [installed()] });

        expect(findUninstalledBlockLibraries(project)).toEqual([LIBRARY]);
    });

    it('leaves out a library whose source is the storefront\'s own template', () => {
        const project = edsProject({ selectedBlockLibraries: ['demo-team-blocks'] });
        const meta = project.componentInstances!['eds-storefront'].metadata!;
        meta.templateOwner = 'demo-system-stores';
        meta.templateRepo = 'accs-citisignal';

        expect(findUninstalledBlockLibraries(project)).toStrictEqual([]);
    });

    it('applies the package filter creation applies, and ignores an unknown id', () => {
        // isle5 is onlyForPackages: ['isle5'].
        const project = edsProject({ selectedBlockLibraries: ['isle5', 'no-such-library'] });

        expect(findUninstalledBlockLibraries(project)).toStrictEqual([]);
    });

    it('includes a custom library the project carries, and skips one with no source', () => {
        const custom = { name: 'Mine', source: { owner: 'me', repo: 'my-blocks', branch: 'main' } };
        const project = edsProject({
            selectedBlockLibraries: [],
            customBlockLibraries: [
                custom,
                { name: 'Broken', source: { owner: '', repo: 'x', branch: 'main' } },
            ],
        });

        expect(findUninstalledBlockLibraries(project)).toEqual([custom]);
    });

    it('finds nothing for a project with no storefront repository', () => {
        const project = edsProject({ componentInstances: {} });

        expect(findUninstalledBlockLibraries(project)).toStrictEqual([]);
    });
});

describe('applyBlockLibraryInstall', () => {
    it('commits only the library\'s block files to the storefront\'s main branch', async () => {
        repos(
            ['blocks/hero/hero.js', 'scripts/scripts.js'],
            ['blocks/commerce-nav/commerce-nav.js', 'blocks/commerce-nav/commerce-nav.css', 'README.md'],
        );
        const ctx = makeCtx();

        const outcome = await applyBlockLibraryInstall({ project: edsProject(), library: LIBRARY }, ctx);

        expect(GitHubFileOperationsCtor).toHaveBeenCalledWith(tokenService, ctx.logger);
        expect(fileOps.listRepoFiles).toHaveBeenCalledWith('me', 'demo-storefront', 'main');
        expect(fileOps.listRepoFiles).toHaveBeenCalledWith(SRC.owner, SRC.repo, SRC.branch);
        expect(fileOps.commitTreeToBranch).toHaveBeenCalledTimes(1);
        expect(fileOps.commitTreeToBranch).toHaveBeenCalledWith(
            'me',
            'demo-storefront',
            'main',
            [
                {
                    path: 'blocks/commerce-nav/commerce-nav.js',
                    mode: '100644',
                    type: 'blob',
                    content: 'content of sha:blocks/commerce-nav/commerce-nav.js',
                },
                {
                    path: 'blocks/commerce-nav/commerce-nav.css',
                    mode: '100644',
                    type: 'blob',
                    content: 'content of sha:blocks/commerce-nav/commerce-nav.css',
                },
            ],
            `chore: add ${LIBRARY.name} (1 blocks)`,
        );
        expect(outcome).toEqual({ name: LIBRARY.name, blockIds: ['commerce-nav'] });
    });

    it('records the library exactly as creation does, appended to what was there, and saves', async () => {
        repos([], ['blocks/commerce-nav/commerce-nav.js']);
        const existing = installed();
        const project = edsProject({ installedBlockLibraries: [existing] });
        const ctx = makeCtx();

        await applyBlockLibraryInstall({ project, library: LIBRARY }, ctx);

        expect(project.installedBlockLibraries).toEqual([
            existing,
            {
                name: LIBRARY.name,
                source: SRC,
                commitSha: 'src-commit-1',
                blockIds: ['commerce-nav'],
                installedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            },
        ]);
        expect(ctx.stateManager.saveProject).toHaveBeenCalledWith(project);
        // Once installed, the check stops offering it.
        expect(findUninstalledBlockLibraries(project)).toStrictEqual([]);
    });

    it('never touches a block folder the storefront already has (ADR-013)', async () => {
        repos(
            ['blocks/commerce-nav/commerce-nav.js'],
            ['blocks/commerce-nav/commerce-nav.js', 'blocks/mega-menu/mega-menu.js'],
        );
        const project = edsProject();

        const outcome = await applyBlockLibraryInstall({ project, library: LIBRARY }, makeCtx());

        const tree = fileOps.commitTreeToBranch.mock.calls[0][3] as Array<{ path: string }>;
        expect(tree.map((e) => e.path)).toEqual(['blocks/mega-menu/mega-menu.js']);
        expect(outcome.blockIds).toEqual(['mega-menu']);
        expect(project.installedBlockLibraries?.[0].blockIds).toEqual(['mega-menu']);
    });

    it('writes nothing when every block already exists, but records the library so it is not re-offered', async () => {
        repos(['blocks/commerce-nav/commerce-nav.js'], ['blocks/commerce-nav/commerce-nav.js']);
        const project = edsProject();
        const ctx = makeCtx();

        const outcome = await applyBlockLibraryInstall({ project, library: LIBRARY }, ctx);

        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(mockGetLatestBranchCommit).toHaveBeenCalledWith(
            ctx.secrets, SRC.owner, SRC.repo, SRC.branch,
        );
        expect(outcome).toEqual({ name: LIBRARY.name, blockIds: [] });
        expect(project.installedBlockLibraries).toEqual([
            expect.objectContaining({ name: LIBRARY.name, commitSha: 'src-commit-head', blockIds: [] }),
        ]);
        expect(findUninstalledBlockLibraries(project)).toStrictEqual([]);
    });

    it('fails without recording when the library has no blocks at all', async () => {
        repos([], ['README.md']);
        const project = edsProject();
        const ctx = makeCtx();

        await expect(applyBlockLibraryInstall({ project, library: LIBRARY }, ctx)).rejects.toThrow(
            'No blocks found in source libraries',
        );

        expect(project.installedBlockLibraries).toBeUndefined();
        expect(ctx.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('fails before any GitHub call when the project has no storefront repository', async () => {
        const project = edsProject({ componentInstances: {} });

        await expect(
            applyBlockLibraryInstall({ project, library: LIBRARY }, makeCtx()),
        ).rejects.toThrow(/no GitHub repo/);

        expect(fileOps.listRepoFiles).not.toHaveBeenCalled();
    });

    it('puts the in-memory record list back when the save fails', async () => {
        repos([], ['blocks/commerce-nav/commerce-nav.js']);
        const existing = [installed()];
        const project = edsProject({ installedBlockLibraries: existing });
        const ctx = makeCtx();
        ctx.stateManager.saveProject.mockRejectedValueOnce(new Error('disk full'));

        await expect(applyBlockLibraryInstall({ project, library: LIBRARY }, ctx)).rejects.toThrow(
            'disk full',
        );

        expect(project.installedBlockLibraries).toBe(existing);
    });
});

describe('the wording both surfaces share', () => {
    it('reads as an install before, and as one short sentence after', () => {
        expect(describePendingInstall(LIBRARY)).toBe('Demo Builder Blocks: install');
        expect(describeInstallOutcome({ name: 'Demo Builder Blocks', blockIds: ['commerce-nav'] }, 'justrite')).toBe(
            'Added 1 block from Demo Builder Blocks to justrite.',
        );
        expect(describeInstallOutcome({ name: 'Demo Builder Blocks', blockIds: ['a', 'b'] }, 'justrite')).toBe(
            'Added 2 blocks from Demo Builder Blocks to justrite.',
        );
        expect(describeInstallOutcome({ name: 'Demo Builder Blocks', blockIds: [] }, 'justrite')).toBe(
            'Demo Builder Blocks is already in justrite.',
        );
    });
});
