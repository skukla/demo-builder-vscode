/**
 * Block Library Component Merge
 *
 * The three builders called directly, with a fake that answers file reads from
 * a map. The install suites (blockCollectionHelpers-*) reach the same code
 * through installBlockCollections; this suite pins what each builder does to a
 * destination file the SC may have edited by hand: it only adds, and an entry
 * already there is kept exactly as it is.
 */

import {
    buildMergedComponentDefinitionMultiSource,
    buildMergedComponentFiltersMultiSource,
    buildMergedComponentModelsMultiSource,
    type FileContentReader,
    type LibraryBlockData,
} from '@/features/eds/services/blockLibraryComponentMerge';
import type { GitHubFileContent } from '@/features/eds/services/types';
import type { AddonSource } from '@/types/demoPackages';

const LIB_A: AddonSource = { owner: 'lib-owner', repo: 'lib-a', branch: 'main' };
const LIB_B: AddonSource = { owner: 'lib-owner', repo: 'lib-b', branch: 'main' };
const DEST_OWNER = 'dest-owner';
const DEST_REPO = 'dest-repo';

type Files = Record<string, unknown>;

/** A reader that answers from `files`, keyed `owner/repo/path`; anything else is absent. */
function readerFor(files: Files): {
    reader: FileContentReader;
    getFileContent: jest.Mock<Promise<GitHubFileContent | null>, [string, string, string]>;
} {
    const getFileContent = jest.fn(
        async (owner: string, repo: string, path: string): Promise<GitHubFileContent | null> => {
            const key = `${owner}/${repo}/${path}`;
            if (!(key in files)) return null;
            const value = files[key];
            const content = typeof value === 'string' ? value : JSON.stringify(value);
            return { content, sha: 'file-sha', path, encoding: 'base64' };
        },
    );
    return { reader: { getFileContent }, getFileContent };
}

function lib(source: AddonSource, blockIds: string[]): LibraryBlockData {
    return { source, blockIds, files: [] };
}

interface DefinitionDoc {
    groups: Array<{ id: string; title?: string; components?: Array<{ id: string }> }>;
}

/** The merged document, failing the test outright when the builder returned null. */
function parsed(merged: string | null): unknown {
    if (merged === null) throw new Error('expected a merged document, got null');
    return JSON.parse(merged);
}

/** The merged component-definition.json, typed for reading its groups. */
function parsedDef(merged: string | null): DefinitionDoc {
    const doc = parsed(merged);
    if (typeof doc !== 'object' || doc === null || !('groups' in doc) || !Array.isArray(doc.groups)) {
        throw new Error('expected a document with groups');
    }
    return { groups: doc.groups };
}

function destKey(path: string): string {
    return `${DEST_OWNER}/${DEST_REPO}/${path}`;
}

function srcKey(source: AddonSource, path: string): string {
    return `${source.owner}/${source.repo}/${path}`;
}

describe('buildMergedComponentDefinitionMultiSource', () => {
    const DEF = 'component-definition.json';

    async function build(files: Files, libs: LibraryBlockData[]): Promise<string | null> {
        const { reader } = readerFor(files);
        return buildMergedComponentDefinitionMultiSource(reader, DEST_OWNER, DEST_REPO, libs);
    }

    it('adds the library entries and keeps a hand-edited destination entry as it is', async () => {
        const editedHero = { id: 'hero', title: 'Hero (edited by hand)', extra: 'kept' };
        const merged = await build({
            [srcKey(LIB_A, DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [
                { id: 'hero', title: 'Hero from library' },
                { id: 'quote', title: 'Quote' },
            ] }] },
            [destKey(DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [editedHero] }] },
        }, [lib(LIB_A, ['hero', 'quote'])]);

        expect(merged).toBe(JSON.stringify({ groups: [{ id: 'blocks', title: 'Blocks', components: [
            editedHero,
            { id: 'quote', title: 'Quote' },
        ] }] }, null, 2));
    });

    it('takes sub-component entries of an installed block, and only those', async () => {
        const merged = await build({
            [srcKey(LIB_A, DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [
                { id: 'tabs' }, { id: 'tabs-item' }, { id: 'tabsx' }, { id: 'other' },
            ] }] },
            [destKey(DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [] }] },
        }, [lib(LIB_A, ['tabs'])]);

        const ids = parsedDef(merged).groups[0].components?.map(c => c.id);
        expect(ids).toEqual(['tabs', 'tabs-item']);
    });

    it('creates a group the destination does not have, carrying the source title', async () => {
        const merged = await build({
            [srcKey(LIB_A, DEF)]: { groups: [{ id: 'commerce', title: 'Commerce', components: [
                { id: 'cart' },
            ] }] },
            [destKey(DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [{ id: 'hero' }] }] },
        }, [lib(LIB_A, ['cart'])]);

        expect(parsedDef(merged).groups).toEqual([
            { id: 'blocks', title: 'Blocks', components: [{ id: 'hero' }] },
            { id: 'commerce', title: 'Commerce', components: [{ id: 'cart' }] },
        ]);
    });

    it('gives a destination group with no components list the new entries', async () => {
        const merged = await build({
            [srcKey(LIB_A, DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [{ id: 'quote' }] }] },
            [destKey(DEF)]: { groups: [{ id: 'blocks', title: 'Blocks' }] },
        }, [lib(LIB_A, ['quote'])]);

        expect(parsedDef(merged).groups[0].components).toEqual([{ id: 'quote' }]);
    });

    it('lets the first library win when two carry the same entry id', async () => {
        const merged = await build({
            [srcKey(LIB_A, DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [
                { id: 'quote', title: 'From A' },
            ] }] },
            [srcKey(LIB_B, DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [
                { id: 'quote', title: 'From B' },
                { id: 'video', title: 'Video' },
            ] }] },
            [destKey(DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [] }] },
        }, [lib(LIB_A, ['quote']), lib(LIB_B, ['quote', 'video'])]);

        expect(parsedDef(merged).groups[0].components).toEqual([
            { id: 'quote', title: 'From A' },
            { id: 'video', title: 'Video' },
        ]);
    });

    it('fills a missing unsafeHTML from the library and never replaces one already there', async () => {
        const merged = await build({
            [srcKey(LIB_A, DEF)]: { groups: [
                { id: 'empty-group' },
                { id: 'blocks', title: 'Blocks', components: [
                    { id: 'hero', plugins: { da: { unsafeHTML: '<div>library hero</div>' } } },
                    { id: 'cards', plugins: { da: { unsafeHTML: '<div>library cards</div>' } } },
                    { id: 'plain' },
                ] },
            ] },
            [destKey(DEF)]: { groups: [{ id: 'blocks', title: 'Blocks', components: [
                { id: 'hero' },
                { id: 'cards', plugins: { da: { unsafeHTML: '<div>edited by hand</div>' } } },
                { id: 'plain' },
            ] }] },
        }, [lib(LIB_A, ['other'])]);

        expect(parsedDef(merged).groups[0].components).toEqual([
            { id: 'hero', plugins: { da: { unsafeHTML: '<div>library hero</div>' } } },
            { id: 'cards', plugins: { da: { unsafeHTML: '<div>edited by hand</div>' } } },
            { id: 'plain' },
        ]);
    });

    it('fills unsafeHTML into an entry whose plugins object exists without da', async () => {
        const merged = await build({
            [srcKey(LIB_A, DEF)]: { groups: [{ id: 'blocks', components: [
                { id: 'hero', plugins: { da: { unsafeHTML: '<div>h</div>' } } },
            ] }] },
            [destKey(DEF)]: { groups: [{ id: 'blocks', components: [
                { id: 'hero', plugins: { xwalk: { page: true } } },
            ] }] },
        }, [lib(LIB_A, ['nothing-new'])]);

        expect(parsedDef(merged).groups[0].components).toEqual([
            { id: 'hero', plugins: { xwalk: { page: true }, da: { unsafeHTML: '<div>h</div>' } } },
        ]);
    });

    it('returns null when there is nothing to add and nothing to fill', async () => {
        const merged = await build({
            [srcKey(LIB_A, DEF)]: { groups: [{ id: 'blocks', components: [{ id: 'hero' }] }] },
            [destKey(DEF)]: { groups: [{ id: 'blocks', components: [{ id: 'hero' }] }] },
        }, [lib(LIB_A, ['hero'])]);

        expect(merged).toBeNull();
    });

    it('returns null when the destination has no file, or a file with no groups', async () => {
        const source = { [srcKey(LIB_A, DEF)]: { groups: [{ id: 'blocks', components: [{ id: 'quote' }] }] } };

        expect(await build(source, [lib(LIB_A, ['quote'])])).toBeNull();
        expect(await build({ ...source, [destKey(DEF)]: { title: 'no groups' } }, [lib(LIB_A, ['quote'])]))
            .toBeNull();
    });

    it('skips a library with no file or no groups, and still merges the next one', async () => {
        const merged = await build({
            [srcKey(LIB_B, DEF)]: { groups: [{ id: 'blocks', components: [{ id: 'video' }] }] },
            [destKey(DEF)]: { groups: [{ id: 'blocks', components: [] }] },
        }, [lib(LIB_A, ['quote']), lib(LIB_B, ['video'])]);
        const noGroups = await build({
            [srcKey(LIB_A, DEF)]: { title: 'no groups' },
            [destKey(DEF)]: { groups: [{ id: 'blocks', components: [] }] },
        }, [lib(LIB_A, ['quote'])]);

        expect(parsedDef(merged).groups[0].components).toEqual([{ id: 'video' }]);
        expect(noGroups).toBeNull();
    });

    it('reads each library from its own repository and the destination from the storefront', async () => {
        const { reader, getFileContent } = readerFor({});
        await buildMergedComponentDefinitionMultiSource(
            reader, DEST_OWNER, DEST_REPO, [lib(LIB_A, ['a']), lib(LIB_B, ['b'])],
        );

        expect(getFileContent.mock.calls).toEqual([
            [LIB_A.owner, LIB_A.repo, DEF],
            [LIB_B.owner, LIB_B.repo, DEF],
            [DEST_OWNER, DEST_REPO, DEF],
        ]);
    });
});

describe('buildMergedComponentFiltersMultiSource', () => {
    const FILTERS = 'component-filters.json';

    async function build(files: Files, libs: LibraryBlockData[]): Promise<string | null> {
        const { reader } = readerFor(files);
        return buildMergedComponentFiltersMultiSource(reader, DEST_OWNER, DEST_REPO, libs);
    }

    it('appends installed blocks to the section list and their sub-filters, keeping a hand-edited one', async () => {
        const editedTabs = { id: 'tabs', components: ['tabs-item', 'added-by-hand'] };
        const merged = await build({
            [srcKey(LIB_A, FILTERS)]: [
                { id: 'main', components: ['section', 'not-a-block'] },
                { id: 'section', components: ['hero', 'tabs', 'quote', 'not-installed'] },
                { id: 'tabs', components: ['tabs-item'] },
                { id: 'quote', components: ['quote-line'] },
                { id: 'not-installed', components: ['x'] },
            ],
            [destKey(FILTERS)]: [
                { id: 'main', components: ['section'] },
                { id: 'section', components: ['hero'] },
                editedTabs,
            ],
        }, [lib(LIB_A, ['hero', 'tabs', 'quote', 'main'])]);

        expect(merged).toBe(JSON.stringify([
            { id: 'main', components: ['section'] },
            { id: 'section', components: ['hero', 'tabs', 'quote'] },
            editedTabs,
            { id: 'quote', components: ['quote-line'] },
        ], null, 2));
    });

    it('lets the first library win for a section id and a sub-filter both carry', async () => {
        const merged = await build({
            [srcKey(LIB_A, FILTERS)]: [
                { id: 'section', components: ['tabs'] },
                { id: 'tabs', components: ['from-a'] },
            ],
            [srcKey(LIB_B, FILTERS)]: [
                { id: 'section', components: ['tabs'] },
                { id: 'tabs', components: ['from-b'] },
            ],
            [destKey(FILTERS)]: [{ id: 'section', components: [] }],
        }, [lib(LIB_A, ['tabs']), lib(LIB_B, ['tabs'])]);

        expect(parsed(merged)).toEqual([
            { id: 'section', components: ['tabs'] },
            { id: 'tabs', components: ['from-a'] },
        ]);
    });

    it('still appends sub-filters when the destination has no section filter', async () => {
        const merged = await build({
            [srcKey(LIB_A, FILTERS)]: [
                { id: 'section', components: ['tabs'] },
                { id: 'tabs', components: ['tabs-item'] },
            ],
            [destKey(FILTERS)]: [{ id: 'main', components: ['section'] }],
        }, [lib(LIB_A, ['tabs'])]);

        expect(parsed(merged)).toEqual([
            { id: 'main', components: ['section'] },
            { id: 'tabs', components: ['tabs-item'] },
        ]);
    });

    it('takes no section ids from a library that has no section filter', async () => {
        const merged = await build({
            [srcKey(LIB_A, FILTERS)]: [{ id: 'tabs', components: ['tabs-item'] }],
            [destKey(FILTERS)]: [{ id: 'section', components: ['hero'] }],
        }, [lib(LIB_A, ['tabs'])]);

        expect(parsed(merged)).toEqual([
            { id: 'section', components: ['hero'] },
            { id: 'tabs', components: ['tabs-item'] },
        ]);
    });

    it('does not read the destination when the libraries offer nothing', async () => {
        const { reader, getFileContent } = readerFor({
            [srcKey(LIB_A, FILTERS)]: [{ id: 'section', components: ['other'] }],
            [destKey(FILTERS)]: [{ id: 'section', components: [] }],
        });

        const merged = await buildMergedComponentFiltersMultiSource(
            reader, DEST_OWNER, DEST_REPO, [lib(LIB_A, ['hero']), lib(LIB_B, ['quote'])],
        );

        expect(merged).toBeNull();
        expect(getFileContent.mock.calls).toEqual([
            [LIB_A.owner, LIB_A.repo, FILTERS],
            [LIB_B.owner, LIB_B.repo, FILTERS],
        ]);
    });

    it('returns null when the destination has no file', async () => {
        const merged = await build({
            [srcKey(LIB_A, FILTERS)]: [{ id: 'section', components: ['hero'] }],
        }, [lib(LIB_A, ['hero'])]);

        expect(merged).toBeNull();
    });

    it('returns null when everything the library offers is already there', async () => {
        const merged = await build({
            [srcKey(LIB_A, FILTERS)]: [
                { id: 'section', components: ['tabs'] },
                { id: 'tabs', components: ['tabs-item'] },
            ],
            [destKey(FILTERS)]: [
                { id: 'section', components: ['tabs'] },
                { id: 'tabs', components: ['tabs-item'] },
            ],
        }, [lib(LIB_A, ['tabs'])]);

        expect(merged).toBeNull();
    });
});

describe('buildMergedComponentModelsMultiSource', () => {
    const MODELS = 'component-models.json';

    async function build(files: Files, libs: LibraryBlockData[]): Promise<string | null> {
        const { reader } = readerFor(files);
        return buildMergedComponentModelsMultiSource(reader, DEST_OWNER, DEST_REPO, libs);
    }

    it('appends installed models after the destination ones and keeps a hand-edited model', async () => {
        const editedHero = { id: 'hero', fields: [{ name: 'added-by-hand' }] };
        const merged = await build({
            [srcKey(LIB_A, MODELS)]: [
                { id: 'hero', fields: [] },
                { id: 'tabs', fields: [] },
                { id: 'tabs-item', fields: [] },
                { id: 'tabsx', fields: [] },
            ],
            [destKey(MODELS)]: [editedHero],
        }, [lib(LIB_A, ['hero', 'tabs'])]);

        expect(merged).toBe(JSON.stringify([
            editedHero,
            { id: 'tabs', fields: [] },
            { id: 'tabs-item', fields: [] },
        ], null, 2));
    });

    it('lets the first library win when two carry the same model id', async () => {
        const merged = await build({
            [srcKey(LIB_A, MODELS)]: [{ id: 'quote', fields: ['a'] }],
            [srcKey(LIB_B, MODELS)]: [{ id: 'quote', fields: ['b'] }],
            [destKey(MODELS)]: [],
        }, [lib(LIB_A, ['quote']), lib(LIB_B, ['quote'])]);

        expect(parsed(merged)).toEqual([{ id: 'quote', fields: ['a'] }]);
    });

    it('does not read the destination when the libraries offer nothing', async () => {
        const { reader, getFileContent } = readerFor({
            [srcKey(LIB_B, MODELS)]: [{ id: 'other', fields: [] }],
            [destKey(MODELS)]: [],
        });

        const merged = await buildMergedComponentModelsMultiSource(
            reader, DEST_OWNER, DEST_REPO, [lib(LIB_A, ['hero']), lib(LIB_B, ['hero'])],
        );

        expect(merged).toBeNull();
        expect(getFileContent.mock.calls).toEqual([
            [LIB_A.owner, LIB_A.repo, MODELS],
            [LIB_B.owner, LIB_B.repo, MODELS],
        ]);
    });

    it('returns null when the destination has no file', async () => {
        const merged = await build({
            [srcKey(LIB_A, MODELS)]: [{ id: 'hero', fields: [] }],
        }, [lib(LIB_A, ['hero'])]);

        expect(merged).toBeNull();
    });

    it('returns null when every model the library offers is already there', async () => {
        const merged = await build({
            [srcKey(LIB_A, MODELS)]: [{ id: 'hero', fields: ['library'] }],
            [destKey(MODELS)]: [{ id: 'hero', fields: ['edited'] }],
        }, [lib(LIB_A, ['hero'])]);

        expect(merged).toBeNull();
    });
});
