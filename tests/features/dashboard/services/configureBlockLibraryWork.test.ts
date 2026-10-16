/**
 * Block library work pending on a Configure save (EDS-39): what the project
 * selects and the storefront lacks is installed, what the storefront has and
 * the project no longer selects is removed.
 *
 * The installer and the remover are REAL. The GitHub file-operations object
 * they drive is the fake, so these tests read the commits that would reach the
 * storefront repository, and in which order.
 */

const fileOps = {
    listRepoFiles: jest.fn(),
    getBranchInfo: jest.fn(),
    getBlobContent: jest.fn(),
    getFileContent: jest.fn(),
    commitTreeToBranch: jest.fn(),
    repoArchive: { downloadRepoContents: jest.fn() },
};
const mockGetLatestBranchCommit = jest.fn();

jest.mock('@/features/eds/services/github/githubFileOperations', () => ({
    GitHubFileOperations: class {
        constructor() {
            Object.assign(this, fileOps);
        }
    },
}));
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => ({ tokenService: { getToken: jest.fn() } })),
}));
jest.mock('@/features/updates/services/githubApiClient', () => ({
    getLatestBranchCommit: (...a: unknown[]) => mockGetLatestBranchCommit(...a),
}));

import { createHash } from 'crypto';
import blockLibraries from '@/features/components/config/block-libraries.json';
import {
    applyPendingBlockLibraryWork,
    describePendingBlockLibraryWork,
    findPendingBlockLibraryWork,
    type BlockLibraryWorkDeps,
} from '@/features/dashboard/services/configureBlockLibraryWork';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

function catalog(id: string) {
    const entry = blockLibraries.libraries.find((l) => l.id === id);
    if (!entry) throw new Error(`${id} is not in block-libraries.json`);
    return entry;
}
const DEMO_BUILDER = catalog('demo-builder-blocks');
const DEMO_TEAM = catalog('demo-team-blocks');
const BODEA = catalog('bodea-blocks');
const COMMIT = 'c'.repeat(40);
const HERO_JS = 'export default function hero() {}';

function blobSha(text: string): string {
    const bytes = Buffer.from(text, 'utf-8');
    return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function edsProject(overrides: Partial<Project> = {}): Project {
    return createMockProject({
        name: 'demo',
        path: '/p/demo',
        selectedStack: 'eds-accs',
        selectedPackage: 'citisignal',
        selectedBlockLibraries: [],
        installedBlockLibraries: installed(),
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/p/demo/components/eds-storefront',
                metadata: { githubRepo: 'me/demo-storefront', daLiveOrg: 'me-org' },
            },
        },
        ...overrides,
    });
}

/** A record of Demo Team blocks: installed, and in these tests no longer selected. */
function demoTeamRecord(overrides: Partial<InstalledBlockLibrary> = {}): InstalledBlockLibrary {
    return {
        name: DEMO_TEAM.name,
        source: DEMO_TEAM.source,
        commitSha: COMMIT,
        blockIds: ['hero'],
        installedAt: '2026-10-01T00:00:00.000Z',
        ...overrides,
    };
}

/**
 * A custom library the SC has since unticked: installed, no longer selected. Used where
 * one save both adds Demo Team blocks and removes another library.
 */
function droppedCustomRecord(): InstalledBlockLibrary {
    return demoTeamRecord({
        name: 'My Blocks',
        source: { owner: 'acme', repo: 'my-blocks', branch: 'main' },
    });
}

/**
 * The storefront's installed records. Every storefront has Demo Builder Blocks (always
 * included, owner decision 2026-10-15), so without its record each case would also install it.
 */
function installed(...records: InstalledBlockLibrary[]): InstalledBlockLibrary[] {
    const demoBuilder = demoTeamRecord({
        name: DEMO_BUILDER.name,
        source: DEMO_BUILDER.source,
        blockIds: ['catalog-menu'],
    });
    return [demoBuilder, ...records];
}

function makeDeps(): BlockLibraryWorkDeps {
    const stateManager = createMockStateManager();
    const logger = createMockLogger();
    return {
        updateContext: {
            secrets: createMockSecretStorage().secrets,
            extensionPath: '/ext',
            stateManager,
            commandManager: createMockCommandExecutor(),
            logger,
        },
        uninstall: { fileOps, stateManager, logger },
    };
}

/** Script every repository listing: `owner/repo` → path → text. */
function repos(trees: Record<string, Record<string, string>>): void {
    fileOps.listRepoFiles.mockImplementation(async (owner: string, repo: string) =>
        Object.entries(trees[`${owner}/${repo}`] ?? {}).map(([path, text]) => ({
            path,
            type: 'blob',
            sha: blobSha(text),
        })),
    );
}

const STOREFRONT = 'me/demo-storefront';
const DEMO_TEAM_REPO = `${DEMO_TEAM.source.owner}/${DEMO_TEAM.source.repo}`;

beforeEach(() => {
    jest.clearAllMocks();
    fileOps.getBranchInfo.mockResolvedValue({ commitSha: 'src-commit-1', treeSha: 't' });
    fileOps.getBlobContent.mockResolvedValue('block file');
    fileOps.getFileContent.mockResolvedValue(null);
    fileOps.commitTreeToBranch.mockResolvedValue('new-commit');
    fileOps.repoArchive.downloadRepoContents.mockResolvedValue(
        new Map([['blocks/hero/hero.js', { data: Buffer.from(HERO_JS, 'utf-8'), mode: '100644' }]]),
    );
    mockGetLatestBranchCommit.mockResolvedValue('src-commit-head');
});

describe('findPendingBlockLibraryWork', () => {
    it('is computed from the project: selected and not installed installs, installed and not selected removes', () => {
        const record = droppedCustomRecord();
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            installedBlockLibraries: installed(record),
        });

        expect(findPendingBlockLibraryWork(project)).toEqual({
            install: [{ name: DEMO_TEAM.name, source: DEMO_TEAM.source }],
            remove: [record],
        });
    });

    it('finds nothing when what is selected is what is installed', () => {
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            installedBlockLibraries: installed(demoTeamRecord()),
        });

        expect(findPendingBlockLibraryWork(project)).toEqual({ install: [], remove: [] });
    });
});

describe('describePendingBlockLibraryWork', () => {
    it('names what Republish will add and remove', () => {
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            installedBlockLibraries: installed(droppedCustomRecord()),
        });

        expect(describePendingBlockLibraryWork(project)).toBe(
            ` Block libraries: add ${DEMO_TEAM.name}; remove My Blocks.`,
        );
    });

    it('names only the half there is', () => {
        expect(
            describePendingBlockLibraryWork(edsProject({ selectedBlockLibraries: ['demo-team-blocks'] })),
        ).toBe(` Block libraries: add ${DEMO_TEAM.name}.`);
        expect(
            describePendingBlockLibraryWork(edsProject({ installedBlockLibraries: installed(demoTeamRecord()) })),
        ).toBe(` Block libraries: remove ${DEMO_TEAM.name}.`);
    });

    it('adds nothing when no library work is pending', () => {
        expect(describePendingBlockLibraryWork(edsProject())).toBe('');
    });
});

describe('applyPendingBlockLibraryWork', () => {
    it('installs a newly ticked library through the existing installer and records it', async () => {
        repos({
            [STOREFRONT]: { 'scripts/aem.js': 'x' },
            [DEMO_TEAM_REPO]: { 'blocks/cards/cards.js': 'cards' },
        });
        const project = edsProject({ selectedBlockLibraries: ['demo-team-blocks'] });

        const { lines, storefrontChanged, addedBlockIds } = await applyPendingBlockLibraryWork(project, makeDeps());

        expect(storefrontChanged).toBe(true);
        // The only doc page the DA.live refresh then publishes (2026-10-15).
        expect(addedBlockIds).toEqual(['cards']);
        expect(fileOps.commitTreeToBranch).toHaveBeenCalledTimes(1);
        expect(fileOps.commitTreeToBranch).toHaveBeenCalledWith(
            'me',
            'demo-storefront',
            'main',
            [{ path: 'blocks/cards/cards.js', mode: '100644', type: 'blob', content: 'block file' }],
            `chore: add ${DEMO_TEAM.name} (1 blocks)`,
        );
        expect(project.installedBlockLibraries).toEqual([
            ...installed(),
            expect.objectContaining({ name: DEMO_TEAM.name, blockIds: ['cards'] }),
        ]);
        expect(lines).toEqual([
            { level: 'info', text: `Added 1 block from ${DEMO_TEAM.name} to demo.` },
        ]);
    });

    it('removes an unticked library and reports it', async () => {
        repos({ [STOREFRONT]: { 'blocks/hero/hero.js': HERO_JS, 'scripts/aem.js': 'x' } });
        const project = edsProject({ installedBlockLibraries: installed(demoTeamRecord()) });

        const { lines, storefrontChanged } = await applyPendingBlockLibraryWork(project, makeDeps());

        expect(storefrontChanged).toBe(true);
        expect(fileOps.commitTreeToBranch).toHaveBeenCalledWith(
            'me',
            'demo-storefront',
            'main',
            [{ path: 'blocks/hero/hero.js', mode: '100644', type: 'blob', sha: null }],
            `chore: remove ${DEMO_TEAM.name} (1 block)`,
        );
        expect(project.installedBlockLibraries).toStrictEqual(installed());
        expect(lines).toEqual([
            { level: 'info', text: `Removed 1 block that ${DEMO_TEAM.name} added to demo.` },
        ]);
    });

    it('removes before it installs when one save does both', async () => {
        repos({
            [STOREFRONT]: { 'blocks/hero/hero.js': HERO_JS },
            [DEMO_TEAM_REPO]: { 'blocks/cards/cards.js': 'cards' },
        });
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            installedBlockLibraries: installed(droppedCustomRecord()),
        });

        const { lines } = await applyPendingBlockLibraryWork(project, makeDeps());

        expect(fileOps.commitTreeToBranch.mock.calls.map((call) => call[4])).toEqual([
            'chore: remove My Blocks (1 block)',
            `chore: add ${DEMO_TEAM.name} (1 blocks)`,
        ]);
        expect(lines.map((line) => line.level)).toEqual(['info', 'info']);
    });

    it('warns, naming the block, when a removal left one in place', async () => {
        repos({ [STOREFRONT]: { 'blocks/hero/hero.js': 'edited by the SC' } });
        const record = demoTeamRecord();
        const project = edsProject({ installedBlockLibraries: installed(record) });

        const { lines, storefrontChanged } = await applyPendingBlockLibraryWork(project, makeDeps());

        // Nothing was added or removed, so there is nothing for DA.live to catch up on.
        expect(storefrontChanged).toBe(false);
        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(lines).toEqual([
            {
                level: 'warning',
                text:
                    `${DEMO_TEAM.name} had no blocks left to remove from demo. ` +
                    'Left 1 in place: hero (changed since it was added).',
            },
        ]);
        // Named once. The block is the SC's own now, so the next save does not offer it again.
        expect(findPendingBlockLibraryWork(project).remove).toStrictEqual([]);
    });

    it('does nothing at all for a native library', async () => {
        const project = edsProject({
            selectedPackage: 'bodea',
            installedBlockLibraries: installed(demoTeamRecord({ name: BODEA.name, source: BODEA.source })),
        });

        const { lines, storefrontChanged } = await applyPendingBlockLibraryWork(project, makeDeps());

        expect(lines).toStrictEqual([]);
        expect(storefrontChanged).toBe(false);
        expect(fileOps.listRepoFiles).not.toHaveBeenCalled();
        expect(fileOps.repoArchive.downloadRepoContents).not.toHaveBeenCalled();
        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(project.installedBlockLibraries).toHaveLength(2);
    });

    it('reports a failed removal and still runs the install', async () => {
        fileOps.listRepoFiles.mockImplementation(async (owner: string, repo: string) => {
            if (`${owner}/${repo}` === DEMO_TEAM_REPO) {
                return [{ path: 'blocks/cards/cards.js', type: 'blob', sha: 's' }];
            }
            // The kept Demo Builder Blocks repository must not claim hero, or hero would stay.
            if (`${owner}/${repo}` === `${DEMO_BUILDER.source.owner}/${DEMO_BUILDER.source.repo}`) {
                return [];
            }
            return [{ path: 'blocks/hero/hero.js', type: 'blob', sha: blobSha(HERO_JS) }];
        });
        fileOps.commitTreeToBranch.mockRejectedValueOnce(new Error('main is protected'));
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            installedBlockLibraries: installed(droppedCustomRecord()),
        });

        const { lines } = await applyPendingBlockLibraryWork(project, makeDeps());

        expect(lines).toEqual([
            { level: 'error', text: 'Failed to remove My Blocks from demo: main is protected' },
            { level: 'info', text: `Added 1 block from ${DEMO_TEAM.name} to demo.` },
        ]);
    });

    it('says what it is doing as it goes', async () => {
        repos({
            [STOREFRONT]: { 'blocks/hero/hero.js': HERO_JS },
            [DEMO_TEAM_REPO]: { 'blocks/cards/cards.js': 'cards' },
        });
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            installedBlockLibraries: installed(droppedCustomRecord()),
        });
        const onProgress = jest.fn();

        await applyPendingBlockLibraryWork(project, makeDeps(), onProgress);

        // A named stage each, with the library as its step.
        expect(onProgress.mock.calls).toEqual([
            ['Removing block libraries', 'My Blocks'],
            ['Adding block libraries', DEMO_TEAM.name],
        ]);
    });
});
