/**
 * blockLibraryUninstall (EDS-39) — a library an existing storefront HAS but no
 * longer selects is found, taken out of the storefront, and its record updated
 * to exactly what was removed.
 *
 * `removeBlockLibraryFiles` is REAL here; the GitHub and DA.live collaborators
 * are fakes, and the tests read what they were handed. The catalog is the
 * bundled block-libraries.json.
 */

import { createHash } from 'crypto';
import blockLibraries from '@/features/components/config/block-libraries.json';
import {
    applyBlockLibraryUninstall,
    describeUninstallOutcome,
    findUnselectedInstalledBlockLibraries,
    type BlockLibraryUninstallDeps,
} from '@/features/updates/services/blockLibraryUninstall';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
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
const CARDS_JS = 'export default function cards() {}';
const HERO_ENTRY = { title: 'Hero', id: 'hero' };

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
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/p/demo/components/eds-storefront',
                metadata: {
                    githubRepo: 'me/demo-storefront',
                    daLiveOrg: 'me-org',
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
        name: DEMO_BUILDER.name,
        source: DEMO_BUILDER.source,
        commitSha: COMMIT,
        blockIds: ['hero'],
        installedAt: '2026-10-01T00:00:00.000Z',
        ...overrides,
    };
}

const fileOps = {
    listRepoFiles: jest.fn(),
    getFileContent: jest.fn(),
    commitTreeToBranch: jest.fn(),
    repoArchive: { downloadRepoContents: jest.fn() },
};
const daLive = { removeBlockFromLibrary: jest.fn() };

function makeDeps(overrides: Partial<BlockLibraryUninstallDeps> = {}) {
    return {
        fileOps,
        daLive,
        stateManager: createMockStateManager(),
        logger: createMockLogger(),
        ...overrides,
    } satisfies BlockLibraryUninstallDeps;
}

/** Script every repository listing: `owner/repo` → path → text. Unlisted repositories are empty. */
function repos(trees: Record<string, Record<string, string>>): void {
    fileOps.listRepoFiles.mockImplementation(async (owner: string, repo: string) =>
        Object.entries(trees[`${owner}/${repo}`] ?? {}).map(([path, text]) => ({
            path,
            type: 'blob',
            sha: blobSha(text),
        })),
    );
}

function libraryAtCommit(files: Record<string, string>): void {
    fileOps.repoArchive.downloadRepoContents.mockResolvedValue(
        new Map(
            Object.entries(files).map(([path, text]) => [
                path,
                { data: Buffer.from(text, 'utf-8'), mode: '100644' },
            ]),
        ),
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    fileOps.getFileContent.mockResolvedValue(null);
    fileOps.commitTreeToBranch.mockResolvedValue('new-commit');
    daLive.removeBlockFromLibrary.mockResolvedValue({ docPage: 'deleted', sheet: 'removed' });
    libraryAtCommit({ 'blocks/hero/hero.js': HERO_JS, 'blocks/cards/cards.js': CARDS_JS });
});

describe('findUnselectedInstalledBlockLibraries', () => {
    it('finds an installed library the project no longer selects', () => {
        const record = installed();

        expect(
            findUnselectedInstalledBlockLibraries(edsProject({ installedBlockLibraries: [record] })),
        ).toEqual([record]);
    });

    it('leaves out an installed library that is still selected, matched by source or by name', () => {
        const selected = { selectedBlockLibraries: ['demo-builder-blocks'] };
        const bySource = edsProject({
            ...selected,
            installedBlockLibraries: [installed({ name: 'renamed' })],
        });
        const byName = edsProject({
            ...selected,
            installedBlockLibraries: [
                installed({ source: { owner: 'moved', repo: 'elsewhere', branch: 'main' } }),
            ],
        });

        expect(findUnselectedInstalledBlockLibraries(bySource)).toStrictEqual([]);
        expect(findUnselectedInstalledBlockLibraries(byName)).toStrictEqual([]);
    });

    it('never finds a library that is native to the project package', () => {
        const project = edsProject({
            selectedPackage: 'bodea',
            installedBlockLibraries: [installed({ name: BODEA.name, source: BODEA.source })],
        });

        expect(findUnselectedInstalledBlockLibraries(project)).toStrictEqual([]);
    });

    it('never finds the storefront template itself', () => {
        const project = edsProject({
            installedBlockLibraries: [
                installed({
                    name: 'Boilerplate',
                    source: { owner: 'Adobe', repo: 'aem-boilerplate-commerce', branch: 'main' },
                }),
            ],
        });

        expect(findUnselectedInstalledBlockLibraries(project)).toStrictEqual([]);
    });

    it('keeps a custom library the project still lists, and finds one it dropped', () => {
        const custom = { name: 'My Blocks', source: { owner: 'acme', repo: 'mine', branch: 'main' } };
        const record = installed(custom);

        expect(
            findUnselectedInstalledBlockLibraries(
                edsProject({ customBlockLibraries: [custom], installedBlockLibraries: [record] }),
            ),
        ).toStrictEqual([]);
        expect(
            findUnselectedInstalledBlockLibraries(edsProject({ installedBlockLibraries: [record] })),
        ).toEqual([record]);
    });

    it('finds nothing when the storefront has no GitHub repository', () => {
        const project = edsProject({ installedBlockLibraries: [installed()], componentInstances: {} });

        expect(findUnselectedInstalledBlockLibraries(project)).toStrictEqual([]);
    });

    it('finds nothing when the stack is unknown, because native libraries cannot be told apart', () => {
        const project = edsProject({ selectedStack: 'gone', installedBlockLibraries: [installed()] });

        expect(findUnselectedInstalledBlockLibraries(project)).toStrictEqual([]);
    });
});

describe('applyBlockLibraryUninstall', () => {
    it('removes an unedited library, takes it off DA.live, and drops its record', async () => {
        repos({ 'me/demo-storefront': { 'blocks/hero/hero.js': HERO_JS, 'scripts/aem.js': 'x' } });
        const definition = JSON.stringify({ groups: [{ id: 'blocks', components: [HERO_ENTRY] }] }, null, 2);
        fileOps.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) =>
            path === 'component-definition.json'
                ? { content: definition, sha: 's', path, encoding: 'utf-8' }
                : null,
        );
        libraryAtCommit({ 'blocks/hero/hero.js': HERO_JS, 'component-definition.json': definition });
        const record = installed({
            addedEntries: { definition: ['hero'], sectionFilter: [], filters: [], models: [] },
        });
        const project = edsProject({ installedBlockLibraries: [record] });
        const deps = makeDeps();

        const outcome = await applyBlockLibraryUninstall({ project, library: record }, deps);

        expect(fileOps.commitTreeToBranch).toHaveBeenCalledWith(
            'me',
            'demo-storefront',
            'main',
            expect.arrayContaining([{ path: 'blocks/hero/hero.js', mode: '100644', type: 'blob', sha: null }]),
            `chore: remove ${DEMO_BUILDER.name} (1 block)`,
        );
        // DA.live is addressed by the project's DA org and the repository's name.
        expect(daLive.removeBlockFromLibrary).toHaveBeenCalledTimes(1);
        expect(daLive.removeBlockFromLibrary).toHaveBeenCalledWith('me-org', 'demo-storefront', {
            blockId: 'hero',
        });
        expect(project.installedBlockLibraries).toStrictEqual([]);
        expect(deps.stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(outcome).toEqual({
            name: DEMO_BUILDER.name,
            removedBlockIds: ['hero'],
            leftBlocks: [],
            leftEntries: [],
        });
    });

    it('drops the record after a partial removal: an edited block is the SC\'s own from then on', async () => {
        repos({
            'me/demo-storefront': {
                'blocks/hero/hero.js': HERO_JS,
                'blocks/cards/cards.js': 'export default function cards() { /* ours */ }',
            },
        });
        const record = installed({
            blockIds: ['cards', 'hero'],
            addedEntries: {
                definition: [],
                sectionFilter: ['cards', 'hero'],
                filters: [],
                models: ['cards', 'hero'],
            },
        });
        const other = installed({ name: 'Kept', source: DEMO_TEAM.source, blockIds: ['kept'] });
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            installedBlockLibraries: [other, record],
        });

        const outcome = await applyBlockLibraryUninstall({ project, library: record }, makeDeps());

        expect(outcome.removedBlockIds).toEqual(['hero']);
        expect(outcome.leftBlocks).toEqual([{ id: 'cards', reason: 'changed' }]);
        // Named once in the outcome above, and never offered again.
        expect(project.installedBlockLibraries).toEqual([other]);
        expect(findUnselectedInstalledBlockLibraries(project)).toStrictEqual([]);
    });

    it('keeps the record, for only the blocks it could not check, when the library cannot be read', async () => {
        repos({
            'me/demo-storefront': {
                'blocks/hero/hero.js': HERO_JS,
                'blocks/cards/cards.js': CARDS_JS,
                'scripts/aem.js': 'x',
            },
        });
        fileOps.repoArchive.downloadRepoContents.mockRejectedValue(new Error('HTTP 503'));
        const record = installed({
            // `gone` has no folder in the storefront: the SC deleted it by hand.
            blockIds: ['cards', 'gone', 'hero'],
            addedEntries: {
                definition: ['gone'],
                sectionFilter: ['cards', 'gone', 'hero'],
                filters: [],
                models: ['hero', 'hero-item'],
                htmlExamples: ['gone', 'hero'],
            },
        });
        const project = edsProject({ installedBlockLibraries: [record] });

        const outcome = await applyBlockLibraryUninstall({ project, library: record }, makeDeps());

        expect(outcome.leftBlocks).toEqual([
            { id: 'cards', reason: 'unverified' },
            { id: 'hero', reason: 'unverified' },
        ]);
        // A failure that may pass: the next save offers the removal again.
        expect(project.installedBlockLibraries).toEqual([
            {
                ...record,
                blockIds: ['cards', 'hero'],
                addedEntries: {
                    definition: [],
                    sectionFilter: ['cards', 'hero'],
                    filters: [],
                    models: ['hero', 'hero-item'],
                    htmlExamples: ['hero'],
                },
            },
        ]);
        expect(findUnselectedInstalledBlockLibraries(project)).toHaveLength(1);
    });

    it('drops the record when the only block left is one another selected library provides', async () => {
        repos({
            'me/demo-storefront': { 'blocks/cards/cards.js': CARDS_JS },
            [`${DEMO_TEAM.source.owner}/${DEMO_TEAM.source.repo}`]: { 'blocks/cards/cards.js': 'theirs' },
        });
        const record = installed({ blockIds: ['cards'] });
        const other = installed({ name: DEMO_TEAM.name, source: DEMO_TEAM.source, blockIds: [] });
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            installedBlockLibraries: [other, record],
        });

        await applyBlockLibraryUninstall({ project, library: record }, makeDeps());

        expect(project.installedBlockLibraries).toEqual([other]);
    });

    it('drops the record when an authoring entry the SC changed is all that stayed', async () => {
        repos({ 'me/demo-storefront': { 'blocks/hero/hero.js': HERO_JS } });
        const changed = JSON.stringify([{ id: 'hero', fields: [{ name: 'ours' }] }], null, 2);
        fileOps.getFileContent.mockImplementation(async (_o: string, _r: string, path: string) =>
            path === 'component-models.json' ? { content: changed, sha: 's', path, encoding: 'utf-8' } : null,
        );
        libraryAtCommit({
            'blocks/hero/hero.js': HERO_JS,
            'component-models.json': JSON.stringify([{ id: 'hero', fields: [] }]),
        });
        const record = installed({
            addedEntries: { definition: [], sectionFilter: [], filters: [], models: ['hero'] },
        });
        const project = edsProject({ installedBlockLibraries: [record] });

        const outcome = await applyBlockLibraryUninstall({ project, library: record }, makeDeps());

        expect(outcome.leftEntries).toEqual([{ file: 'component-models.json', id: 'hero' }]);
        expect(project.installedBlockLibraries).toStrictEqual([]);
    });

    it('leaves a block another selected, installed library also provides', async () => {
        repos({
            'me/demo-storefront': { 'blocks/hero/hero.js': HERO_JS, 'blocks/cards/cards.js': CARDS_JS },
            [`${DEMO_TEAM.source.owner}/${DEMO_TEAM.source.repo}`]: { 'blocks/cards/cards.js': 'theirs' },
        });
        const record = installed({ blockIds: ['cards', 'hero'] });
        const other = installed({ name: DEMO_TEAM.name, source: DEMO_TEAM.source, blockIds: [] });
        const project = edsProject({
            selectedBlockLibraries: ['demo-team-blocks'],
            installedBlockLibraries: [other, record],
        });

        const outcome = await applyBlockLibraryUninstall({ project, library: record }, makeDeps());

        // The other library is read where it lives: its own repository and branch.
        expect(fileOps.listRepoFiles).toHaveBeenCalledWith(
            DEMO_TEAM.source.owner,
            DEMO_TEAM.source.repo,
            DEMO_TEAM.source.branch,
        );
        const [, , , entries] = fileOps.commitTreeToBranch.mock.calls[0];
        expect(entries).toEqual([{ path: 'blocks/hero/hero.js', mode: '100644', type: 'blob', sha: null }]);
        expect(outcome.leftBlocks).toEqual([
            { id: 'cards', reason: 'shared', sharedWith: DEMO_TEAM.name },
        ]);
    });

    it('does not count a library that is itself being removed as a reason to keep a block', async () => {
        repos({
            'me/demo-storefront': { 'blocks/hero/hero.js': HERO_JS },
            [`${DEMO_TEAM.source.owner}/${DEMO_TEAM.source.repo}`]: { 'blocks/hero/hero.js': 'theirs' },
        });
        const record = installed();
        const alsoUnselected = installed({ name: DEMO_TEAM.name, source: DEMO_TEAM.source, blockIds: [] });
        const project = edsProject({ installedBlockLibraries: [alsoUnselected, record] });

        const outcome = await applyBlockLibraryUninstall({ project, library: record }, makeDeps());

        expect(outcome.removedBlockIds).toEqual(['hero']);
    });

    it('says so when DA.live could not be updated, and still records the removal', async () => {
        repos({ 'me/demo-storefront': { 'blocks/hero/hero.js': HERO_JS } });
        daLive.removeBlockFromLibrary.mockRejectedValue(new Error('token expired'));
        const record = installed({
            addedEntries: { definition: ['hero'], sectionFilter: [], filters: [], models: [] },
        });
        const project = edsProject({ installedBlockLibraries: [record] });

        const outcome = await applyBlockLibraryUninstall({ project, library: record }, makeDeps());

        expect(outcome.daLiveError).toBe('token expired');
        expect(project.installedBlockLibraries).toStrictEqual([]);
    });

    it('says so when there is no DA.live session to update the block list with', async () => {
        repos({ 'me/demo-storefront': { 'blocks/hero/hero.js': HERO_JS } });
        const record = installed({
            addedEntries: { definition: ['hero'], sectionFilter: [], filters: [], models: [] },
        });
        const project = edsProject({ installedBlockLibraries: [record] });

        const outcome = await applyBlockLibraryUninstall(
            { project, library: record },
            makeDeps({ daLive: undefined }),
        );

        expect(outcome.daLiveError).toBe('not signed in to DA.live');
    });

    it('puts the record back in memory when saving it fails', async () => {
        repos({ 'me/demo-storefront': { 'blocks/hero/hero.js': HERO_JS } });
        const record = installed();
        const project = edsProject({ installedBlockLibraries: [record] });
        const stateManager = createMockStateManager({
            saveProject: jest.fn().mockRejectedValue(new Error('disk full')),
        });

        await expect(
            applyBlockLibraryUninstall({ project, library: record }, makeDeps({ stateManager })),
        ).rejects.toThrow('disk full');
        expect(project.installedBlockLibraries).toEqual([record]);
    });

    it('refuses a project whose storefront has no GitHub repository', async () => {
        const record = installed();
        const project = edsProject({ installedBlockLibraries: [record], componentInstances: {} });

        await expect(
            applyBlockLibraryUninstall({ project, library: record }, makeDeps()),
        ).rejects.toThrow(/no GitHub repo/);
        expect(fileOps.commitTreeToBranch).not.toHaveBeenCalled();
    });
});

describe('describeUninstallOutcome', () => {
    const base = { name: 'Acme Blocks', removedBlockIds: [], leftBlocks: [], leftEntries: [] };

    it('says how many blocks were removed', () => {
        expect(describeUninstallOutcome({ ...base, removedBlockIds: ['a', 'b'] }, 'demo')).toBe(
            'Removed 2 blocks that Acme Blocks added to demo.',
        );
        expect(describeUninstallOutcome({ ...base, removedBlockIds: ['a'] }, 'demo')).toBe(
            'Removed 1 block that Acme Blocks added to demo.',
        );
    });

    it('says there was nothing to remove when the blocks were already gone', () => {
        expect(describeUninstallOutcome(base, 'demo')).toBe(
            'Acme Blocks had no blocks left to remove from demo.',
        );
    });

    it('names every block left in place with its reason', () => {
        const text = describeUninstallOutcome(
            {
                ...base,
                removedBlockIds: ['a'],
                leftBlocks: [
                    { id: 'hero', reason: 'changed' },
                    { id: 'cards', reason: 'shared', sharedWith: 'Other Blocks' },
                    { id: 'tabs', reason: 'unverified' },
                ],
            },
            'demo',
        );

        expect(text).toBe(
            'Removed 1 block that Acme Blocks added to demo. Left 3 in place: ' +
                'hero (changed since it was added), cards (also in Other Blocks), ' +
                'tabs (could not be compared with the library).',
        );
    });

    it('names an authoring entry left in place, and says when DA.live was not updated', () => {
        const text = describeUninstallOutcome(
            {
                ...base,
                removedBlockIds: ['a'],
                leftEntries: [{ file: 'component-models.json', id: 'hero' }],
                daLiveError: 'not signed in to DA.live',
            },
            'demo',
        );

        expect(text).toBe(
            'Removed 1 block that Acme Blocks added to demo. ' +
                'Left 1 authoring entry changed by hand: hero (component-models.json). ' +
                'The removed blocks were not taken off DA.live (not signed in to DA.live).',
        );
    });
});
