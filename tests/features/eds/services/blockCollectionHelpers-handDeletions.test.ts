/**
 * Block Collection Helpers — hand deletions and file layout (EDS-36).
 *
 * An entry the extension added to one of the three authoring files, and the SC
 * then deleted, is not put back by the next install or update; the result says
 * it was left out. Each file is written back in its own indentation.
 *
 * What these read is the tree handed to `commitTreeToBranch` — the content that
 * would reach GitHub — not a summary the installer reports about itself.
 * Fixture files come from the shared builders, which mirror the shapes the
 * installer parses.
 */

import { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
import type { BlockLibraryEntry } from '@/features/eds/services/blockCollectionHelpers';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { GitHubTreeInput } from '@/features/eds/services/types';
import type { AddedComponentEntries } from '@/types/blockLibraries';
import type { AddonSource } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';
import {
    createBlockFileEntries,
    createComponentDef,
    createComponentFilters,
    createComponentModels,
    createDestComponentDef,
    createDestComponentFilters,
    createDestComponentModels,
    setupBlockCollectionMocks,
} from './blockCollectionHelpers.testUtils';

const SOURCE: AddonSource = { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' };
const LIBRARY_NAME = 'Isle5 Blocks';

/** The library: three blocks; `tabs` brings a filter entry of its own. */
const SOURCE_FILES: Record<string, string> = {
    'component-definition.json': createComponentDef([
        { title: 'Hero CTA', id: 'hero-cta' },
        { title: 'Newsletter', id: 'newsletter' },
    ]),
    'component-filters.json': createComponentFilters(
        ['hero-cta', 'newsletter', 'tabs'],
        [{ id: 'tabs', components: ['tabs-item'] }],
    ),
    'component-models.json': createComponentModels([{ id: 'hero-cta' }, { id: 'newsletter' }]),
};

/** What an earlier install recorded: hero-cta in three files, the tabs filter. */
const PREVIOUSLY_ADDED: AddedComponentEntries = {
    definition: ['hero-cta'],
    sectionFilter: ['hero-cta'],
    filters: ['tabs'],
    models: ['hero-cta'],
};

type Indent = number | string | undefined;

/** The storefront's three files as the SC left them, in the given indentation. */
function destFiles(indent: Indent): Record<string, string> {
    const relayout = (text: string): string => JSON.stringify(JSON.parse(text), null, indent);
    return {
        'component-definition.json': relayout(createDestComponentDef()),
        'component-filters.json': relayout(createDestComponentFilters()),
        'component-models.json': relayout(createDestComponentModels()),
    };
}

/** What a test changes about the two repositories; the rest is the defaults above. */
interface PrimeOptions {
    /** The library's three files. */
    source?: Record<string, string>;
    /** Block folders the storefront has. */
    storefrontBlocks?: string[];
}

function prime(
    mock: jest.Mocked<GitHubFileOperations>,
    dest: Record<string, string>,
    { source = SOURCE_FILES, storefrontBlocks = [] }: PrimeOptions = {},
): void {
    mock.listRepoFiles
        .mockResolvedValueOnce(createBlockFileEntries(storefrontBlocks))
        .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter', 'tabs']));
    mock.getBlobContent.mockResolvedValue('export default function() {}');
    mock.getFileContent.mockImplementation(async (owner: string, _repo: string, path: string) => {
        const content = owner === SOURCE.owner ? source[path] : dest[path];
        return content === undefined ? null : { content, sha: 'sha', path, encoding: 'base64' };
    });
    mock.getBranchInfo.mockResolvedValue({ treeSha: 'tree-sha', commitSha: 'source-commit' });
    mock.createTree.mockResolvedValue('new-tree-sha');
    mock.createCommit.mockResolvedValue('new-commit-sha');
    mock.updateBranchRef.mockResolvedValue(undefined);
}

/** The storefront files after the merge, built from the SC's files by hand. */
function expectedFiles(
    dest: Record<string, string>,
    indent: Indent,
    added: { definition: string[]; section: string[]; filters: Array<{ id: string; components: string[] }>; models: string[] },
): Record<string, string> {
    const def = JSON.parse(dest['component-definition.json']);
    def.groups[0].components.push(
        ...added.definition.map((id) => JSON.parse(SOURCE_FILES['component-definition.json'])
            .groups[0].components.find((c: { id: string }) => c.id === id)),
    );
    const filters = JSON.parse(dest['component-filters.json']);
    filters.find((f: { id: string }) => f.id === 'section').components.push(...added.section);
    filters.push(...added.filters);
    const models = [
        ...JSON.parse(dest['component-models.json']),
        ...added.models.map((id) => JSON.parse(SOURCE_FILES['component-models.json'])
            .find((m: { id: string }) => m.id === id)),
    ];
    return {
        'component-definition.json': JSON.stringify(def, null, indent),
        'component-filters.json': JSON.stringify(filters, null, indent),
        'component-models.json': JSON.stringify(models, null, indent),
    };
}

/** The three authoring files in the tree handed to the commit, by path. */
function committedFiles(mock: jest.Mocked<GitHubFileOperations>): Record<string, string | undefined> {
    expect(mock.commitTreeToBranch).toHaveBeenCalledTimes(1);
    const [owner, repo, branch, tree] = mock.commitTreeToBranch.mock.calls[0] as [
        string, string, string, GitHubTreeInput[], string,
    ];
    expect([owner, repo, branch]).toEqual(['dest-owner', 'dest-repo', 'main']);
    const byPath = (path: string) => tree.find((e) => e.path === path)?.content;
    return {
        'component-definition.json': byPath('component-definition.json'),
        'component-filters.json': byPath('component-filters.json'),
        'component-models.json': byPath('component-models.json'),
    };
}

describe('installBlockCollections — entries removed by hand (EDS-36)', () => {
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
    });

    function install(library: BlockLibraryEntry) {
        return installBlockCollections(
            mockGithubFileOps, 'dest-owner', 'dest-repo', [library], mockLogger,
        );
    }

    it('does not put back an entry it added before that the SC deleted, and says so', async () => {
        const dest = destFiles(2);
        prime(mockGithubFileOps, dest);

        const result = await install({
            source: SOURCE, name: LIBRARY_NAME, addedEntries: PREVIOUSLY_ADDED,
        });

        expect(result.success).toBe(true);
        expect(committedFiles(mockGithubFileOps)).toEqual(
            expectedFiles(dest, 2, {
                definition: ['newsletter'],
                section: ['newsletter', 'tabs'],
                filters: [],
                models: ['newsletter'],
            }),
        );
        expect(result.removedByHand).toEqual([
            { library: LIBRARY_NAME, file: 'component-definition.json', id: 'hero-cta' },
            { library: LIBRARY_NAME, file: 'component-filters.json', id: 'hero-cta' },
            { library: LIBRARY_NAME, file: 'component-filters.json', id: 'tabs' },
            { library: LIBRARY_NAME, file: 'component-models.json', id: 'hero-cta' },
        ]);
    });

    it('adds a library entry it never added before, and records it beside the old ones', async () => {
        prime(mockGithubFileOps, destFiles(2));

        const result = await install({
            source: SOURCE, name: LIBRARY_NAME, addedEntries: PREVIOUSLY_ADDED,
        });

        expect(result.libraryVersions).toEqual([
            expect.objectContaining({
                name: LIBRARY_NAME,
                addedEntries: {
                    definition: ['hero-cta', 'newsletter'],
                    sectionFilter: ['hero-cta', 'newsletter', 'tabs'],
                    filters: ['tabs'],
                    models: ['hero-cta', 'newsletter'],
                },
            }),
        ]);
    });

    it('with no record, adds every missing entry as before and starts the record', async () => {
        const dest = destFiles(2);
        prime(mockGithubFileOps, dest);

        const result = await install({ source: SOURCE, name: LIBRARY_NAME });

        expect(committedFiles(mockGithubFileOps)).toEqual(
            expectedFiles(dest, 2, {
                definition: ['hero-cta', 'newsletter'],
                section: ['hero-cta', 'newsletter', 'tabs'],
                filters: [{ id: 'tabs', components: ['tabs-item'] }],
                models: ['hero-cta', 'newsletter'],
            }),
        );
        expect(result.removedByHand).toStrictEqual([]);
        expect(result.libraryVersions?.[0].addedEntries).toEqual({
            definition: ['hero-cta', 'newsletter'],
            sectionFilter: ['hero-cta', 'newsletter', 'tabs'],
            filters: ['tabs'],
            models: ['hero-cta', 'newsletter'],
        });
    });

    it('never considered an entry whose block folder the storefront still has (true before EDS-36 too)', async () => {
        prime(mockGithubFileOps, destFiles(2));
        // The storefront keeps blocks/hero-cta/; only its entries were deleted.
        mockGithubFileOps.listRepoFiles.mockReset();
        mockGithubFileOps.listRepoFiles
            .mockResolvedValueOnce(createBlockFileEntries(['hero-cta']))
            .mockResolvedValueOnce(createBlockFileEntries(['hero-cta', 'newsletter', 'tabs']));

        await install({ source: SOURCE, name: LIBRARY_NAME });

        const files = committedFiles(mockGithubFileOps);
        expect(Object.values(files).join('\n')).not.toContain('hero-cta');
    });

    it('leaves an entry the SC moved to another group where it is', async () => {
        const moved = JSON.parse(createDestComponentDef());
        moved.groups.push({ id: 'mine', title: 'Mine', components: [{ title: 'Hero CTA', id: 'hero-cta' }] });
        const dest = { ...destFiles(2), 'component-definition.json': JSON.stringify(moved, null, 2) };
        prime(mockGithubFileOps, dest);

        await install({ source: SOURCE, name: LIBRARY_NAME });

        const def = JSON.parse(committedFiles(mockGithubFileOps)['component-definition.json']!);
        const ids = def.groups.flatMap((g: { components: Array<{ id: string }> }) => g.components.map((c) => c.id));
        expect(ids.filter((id: string) => id === 'hero-cta')).toHaveLength(1);
    });
});

/** The block files in the tree handed to the commit, by path. */
function committedBlockPaths(mock: jest.Mocked<GitHubFileOperations>): string[] {
    const tree = mock.commitTreeToBranch.mock.calls[0][3] as GitHubTreeInput[];
    return tree.map((e) => e.path).filter((path) => path.startsWith('blocks/'));
}

describe('installBlockCollections — block folders removed by hand (EDS-36)', () => {
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
    });

    function install(library: BlockLibraryEntry) {
        return installBlockCollections(
            mockGithubFileOps, 'dest-owner', 'dest-repo', [library], mockLogger,
        );
    }

    it('does not copy back a folder it added before, nor put back its entries, and says so', async () => {
        const dest = destFiles(2);
        prime(mockGithubFileOps, dest);

        // An earlier install copied hero-cta; the SC has deleted its folder. No
        // entry record, so only the folder rule can keep hero-cta's entries out.
        const result = await install({ source: SOURCE, name: LIBRARY_NAME, blockIds: ['hero-cta'] });

        expect(committedBlockPaths(mockGithubFileOps)).toEqual([
            'blocks/newsletter/newsletter.js',
            'blocks/tabs/tabs.js',
        ]);
        expect(committedFiles(mockGithubFileOps)).toEqual(
            expectedFiles(dest, 2, {
                definition: ['newsletter'],
                section: ['newsletter', 'tabs'],
                filters: [{ id: 'tabs', components: ['tabs-item'] }],
                models: ['newsletter'],
            }),
        );
        expect(result.blockIds).toEqual(['newsletter', 'tabs']);
        expect(result.removedByHand).toEqual([
            { library: LIBRARY_NAME, file: 'block folder blocks/hero-cta', id: 'hero-cta' },
        ]);
    });

    it('leaves a folder the storefront still has alone, whatever the record says', async () => {
        prime(mockGithubFileOps, destFiles(2), { storefrontBlocks: ['hero-cta'] });

        const result = await install({ source: SOURCE, name: LIBRARY_NAME, blockIds: ['hero-cta'] });

        expect(committedBlockPaths(mockGithubFileOps)).not.toContain('blocks/hero-cta/hero-cta.js');
        expect(result.removedByHand).toStrictEqual([]);
    });

    it('commits nothing when every block it would copy was removed by hand, and says so', async () => {
        prime(mockGithubFileOps, destFiles(2));

        const result = await install({
            source: SOURCE, name: LIBRARY_NAME, blockIds: ['hero-cta', 'newsletter', 'tabs'],
        });

        expect(mockGithubFileOps.commitTreeToBranch).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.removedByHand?.map((e) => e.id)).toEqual(['hero-cta', 'newsletter', 'tabs']);
    });
});

describe('installBlockCollections — HTML examples removed by hand (EDS-36)', () => {
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    /** The library, with an HTML example for the storefront's own hero and for hero-cta. */
    const SOURCE_WITH_EXAMPLES: Record<string, string> = {
        ...SOURCE_FILES,
        'component-definition.json': createComponentDef([
            { title: 'Hero', id: 'hero', unsafeHTML: '<div class="hero"></div>' },
            { title: 'Hero CTA', id: 'hero-cta', unsafeHTML: '<div class="hero-cta"></div>' },
            { title: 'Newsletter', id: 'newsletter' },
        ]),
    };

    /** The storefront's definition after pass 1 adds hero-cta and newsletter. */
    function withLibraryEntries(dest: Record<string, string>): { groups: Array<{ components: Array<Record<string, unknown>> }> } {
        const def = JSON.parse(dest['component-definition.json']);
        const sourceComponents = JSON.parse(SOURCE_WITH_EXAMPLES['component-definition.json']).groups[0].components;
        def.groups[0].components.push(sourceComponents[1], sourceComponents[2]);
        return def;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
    });

    function install(library: BlockLibraryEntry) {
        return installBlockCollections(
            mockGithubFileOps, 'dest-owner', 'dest-repo', [library], mockLogger,
        );
    }

    it('does not put back an example it filled before that the SC stripped, and says so', async () => {
        const dest = destFiles(2);
        prime(mockGithubFileOps, dest, { source: SOURCE_WITH_EXAMPLES, storefrontBlocks: ['hero'] });

        const result = await install({
            source: SOURCE,
            name: LIBRARY_NAME,
            addedEntries: { definition: [], sectionFilter: [], filters: [], models: [], htmlExamples: ['hero'] },
        });

        expect(committedFiles(mockGithubFileOps)['component-definition.json']).toBe(
            JSON.stringify(withLibraryEntries(dest), null, 2),
        );
        expect(result.removedByHand).toEqual([
            { library: LIBRARY_NAME, file: 'HTML example in component-definition.json', id: 'hero' },
        ]);
    });

    it('fills an example it never filled, and records it with the examples its own entries brought', async () => {
        const dest = destFiles(2);
        prime(mockGithubFileOps, dest, { source: SOURCE_WITH_EXAMPLES, storefrontBlocks: ['hero'] });

        const result = await install({ source: SOURCE, name: LIBRARY_NAME });

        const expected = withLibraryEntries(dest);
        expected.groups[0].components[0].plugins = { da: { unsafeHTML: '<div class="hero"></div>' } };
        expect(committedFiles(mockGithubFileOps)['component-definition.json']).toBe(
            JSON.stringify(expected, null, 2),
        );
        expect(result.removedByHand).toStrictEqual([]);
        expect(result.libraryVersions?.[0].addedEntries?.htmlExamples).toEqual(['hero-cta', 'hero']);
    });
});

describe('installBlockCollections — each file keeps its own indentation', () => {
    let mockGithubFileOps: jest.Mocked<GitHubFileOperations>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();
        ({ mockLogger, mockGithubFileOps } = setupBlockCollectionMocks());
    });

    it.each([
        ['four spaces', 4],
        ['tabs', '\t'],
        ['two spaces when the file has none (one line)', undefined],
    ])('writes a file indented with %s back the same way', async (_label, indent) => {
        const dest = destFiles(indent);
        prime(mockGithubFileOps, dest);

        await installBlockCollections(
            mockGithubFileOps, 'dest-owner', 'dest-repo',
            [{ source: SOURCE, name: LIBRARY_NAME }], mockLogger,
        );

        expect(committedFiles(mockGithubFileOps)).toEqual(
            expectedFiles(dest, indent ?? 2, {
                definition: ['hero-cta', 'newsletter'],
                section: ['hero-cta', 'newsletter', 'tabs'],
                filters: [{ id: 'tabs', components: ['tabs-item'] }],
                models: ['hero-cta', 'newsletter'],
            }),
        );
    });
});
