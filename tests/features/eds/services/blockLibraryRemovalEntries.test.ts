/**
 * removeAddedEntries (EDS-39) — taking a library's entries back out of the
 * storefront's three authoring files.
 *
 * The rule under test is the one the whole removal rests on: an entry leaves
 * its file only when it is still exactly what the library added. Anything the
 * SC changed stays and is named; anything already gone is simply no longer
 * tracked.
 */

import { removeAddedEntries } from '@/features/eds/services/blockLibraryRemovalEntries';
import type { AddedComponentEntries } from '@/types/blockLibraries';

const HERO = { title: 'Hero', id: 'hero', plugins: { da: { unsafeHTML: '<div class="hero"></div>' } } };
const TABS = { title: 'Tabs', id: 'tabs' };
const TEMPLATE_ENTRY = { title: 'Columns', id: 'columns' };

const HERO_MODEL = { id: 'hero', fields: [{ name: 'title', component: 'text' }] };
const TABS_MODEL = { id: 'tabs', fields: [] };
const TABS_FILTER = { id: 'tabs', components: ['tabs-item'] };

function ids(overrides: Partial<AddedComponentEntries> = {}): AddedComponentEntries {
    return { definition: [], sectionFilter: [], filters: [], models: [], ...overrides };
}

function definition(...components: object[]): string {
    return JSON.stringify({ groups: [{ id: 'blocks', title: 'Blocks', components }] }, null, 2);
}

function contentOf(result: ReturnType<typeof removeAddedEntries>, path: string): unknown {
    const file = result.files.find((f) => f.path === path);
    if (!file) throw new Error(`${path} was not rewritten`);
    return JSON.parse(file.content);
}

describe('removeAddedEntries', () => {
    it('takes out a definition entry that is still as the library added it, and nothing else', () => {
        const result = removeAddedEntries(
            ids({ definition: ['hero'] }),
            { 'component-definition.json': definition(TEMPLATE_ENTRY, HERO, TABS) },
            { 'component-definition.json': definition(HERO, TABS) },
        );

        expect(contentOf(result, 'component-definition.json')).toEqual({
            groups: [{ id: 'blocks', title: 'Blocks', components: [TEMPLATE_ENTRY, TABS] }],
        });
        expect(result.cleared.definition).toEqual(['hero']);
        expect(result.left).toStrictEqual([]);
    });

    it('leaves a definition entry the SC changed, names it, and does not rewrite the file', () => {
        const edited = { ...HERO, title: 'Our Hero' };
        const result = removeAddedEntries(
            ids({ definition: ['hero'] }),
            { 'component-definition.json': definition(edited) },
            { 'component-definition.json': definition(HERO) },
        );

        expect(result.files).toStrictEqual([]);
        expect(result.cleared.definition).toStrictEqual([]);
        expect(result.left).toEqual([{ file: 'component-definition.json', id: 'hero' }]);
    });

    it('stops tracking an entry the SC already deleted, without writing anything', () => {
        const result = removeAddedEntries(
            ids({ definition: ['hero'], models: ['hero'] }),
            {
                'component-definition.json': definition(TEMPLATE_ENTRY),
                'component-models.json': null,
            },
            { 'component-definition.json': definition(HERO) },
        );

        expect(result.files).toStrictEqual([]);
        expect(result.cleared.definition).toEqual(['hero']);
        expect(result.cleared.models).toEqual(['hero']);
        expect(result.left).toStrictEqual([]);
    });

    it('leaves an entry in place when the library copy cannot be read', () => {
        const result = removeAddedEntries(
            ids({ definition: ['hero'] }),
            { 'component-definition.json': definition(HERO) },
            {},
        );

        expect(result.files).toStrictEqual([]);
        expect(result.left).toEqual([{ file: 'component-definition.json', id: 'hero' }]);
    });

    it('takes a block id out of the section filter and removes an unchanged filter entry', () => {
        const storefront = JSON.stringify([
            { id: 'main', components: ['section'] },
            { id: 'section', components: ['columns', 'hero', 'tabs'] },
            TABS_FILTER,
        ]);
        const library = JSON.stringify([{ id: 'section', components: ['hero', 'tabs'] }, TABS_FILTER]);

        const result = removeAddedEntries(
            ids({ sectionFilter: ['hero', 'tabs'], filters: ['tabs'] }),
            { 'component-filters.json': storefront },
            { 'component-filters.json': library },
        );

        expect(contentOf(result, 'component-filters.json')).toEqual([
            { id: 'main', components: ['section'] },
            { id: 'section', components: ['columns'] },
        ]);
        expect(result.cleared.sectionFilter).toEqual(['hero', 'tabs']);
        expect(result.cleared.filters).toEqual(['tabs']);
    });

    it('leaves a filter entry the SC changed while still removing the section ids', () => {
        const storefront = JSON.stringify([
            { id: 'section', components: ['tabs'] },
            { id: 'tabs', components: ['tabs-item', 'our-own-item'] },
        ]);
        const library = JSON.stringify([{ id: 'section', components: ['tabs'] }, TABS_FILTER]);

        const result = removeAddedEntries(
            ids({ sectionFilter: ['tabs'], filters: ['tabs'] }),
            { 'component-filters.json': storefront },
            { 'component-filters.json': library },
        );

        expect(contentOf(result, 'component-filters.json')).toEqual([
            { id: 'section', components: [] },
            { id: 'tabs', components: ['tabs-item', 'our-own-item'] },
        ]);
        expect(result.cleared.filters).toStrictEqual([]);
        expect(result.left).toEqual([{ file: 'component-filters.json', id: 'tabs' }]);
    });

    it('removes an unchanged model and leaves a changed one', () => {
        const editedTabs = { id: 'tabs', fields: [{ name: 'added-by-hand', component: 'text' }] };
        const result = removeAddedEntries(
            ids({ models: ['hero', 'tabs'] }),
            { 'component-models.json': JSON.stringify([HERO_MODEL, editedTabs]) },
            { 'component-models.json': JSON.stringify([HERO_MODEL, TABS_MODEL]) },
        );

        expect(contentOf(result, 'component-models.json')).toEqual([editedTabs]);
        expect(result.cleared.models).toEqual(['hero']);
        expect(result.left).toEqual([{ file: 'component-models.json', id: 'tabs' }]);
    });

    it('writes a file back in the indentation it already had', () => {
        const fourSpaces = `${JSON.stringify([HERO_MODEL, TABS_MODEL], null, 4)}\n`;
        const result = removeAddedEntries(
            ids({ models: ['hero'] }),
            { 'component-models.json': fourSpaces },
            { 'component-models.json': JSON.stringify([HERO_MODEL]) },
        );

        expect(result.files).toEqual([
            {
                path: 'component-models.json',
                content: `${JSON.stringify([TABS_MODEL], null, 4)}\n`,
            },
        ]);
    });

    it('leaves every entry in a file it cannot parse', () => {
        const result = removeAddedEntries(
            ids({ models: ['hero'] }),
            { 'component-models.json': '{ not json' },
            { 'component-models.json': JSON.stringify([HERO_MODEL]) },
        );

        expect(result.files).toStrictEqual([]);
        expect(result.left).toEqual([{ file: 'component-models.json', id: 'hero' }]);
    });
});
