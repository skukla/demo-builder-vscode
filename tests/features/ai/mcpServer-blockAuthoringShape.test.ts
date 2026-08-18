/**
 * MCP Server Tests — get_block_authoring_shape
 *
 * Returns a block's DA.live authoring shape from the three storefront registry
 * files. FIXTURES ARE COPIED FROM REAL DATA (bodea-template-test, 78 components)
 * — an earlier draft assumed every entry carried `plugins.da.unsafeHTML`, which
 * only 4 of 78 do; the other 74 describe themselves with rows/columns or
 * name/type/fields. Keep these shapes faithful or the suite agrees with a
 * fiction.
 */

import {
    fsProm,
    path,
    toolHandlers,
    PROJECTS_DIR,
    PROJECT_NAME,
    STOREFRONT_PATH,
    mockManifestWithStorefront,
    mockManifestWithoutStorefront,
} from './mcpServer.testUtils';

const COMP_DEF_PATH = path.join(STOREFRONT_PATH, 'component-definition.json');

/**
 * Real registry excerpt. Three authoring conventions appear across the real
 * file and all three are represented here:
 *   - `cards`   → rows/columns (positional table) + a filter naming its children
 *   - `image`   → name/type/fields (key-value with CSS selectors)
 *   - `section` → unsafeHTML (literal markup; only 4 real entries use this)
 */
const DEFINITION = {
    groups: [
        {
            title: 'Default Content',
            components: [
                {
                    title: 'Image',
                    id: 'image',
                    model: 'image',
                    plugins: {
                        da: {
                            name: 'image',
                            type: 'image',
                            fields: [
                                { name: 'imageAlt', selector: 'img[alt]' },
                                { name: 'image', selector: 'img[src]' },
                            ],
                        },
                    },
                },
            ],
        },
        {
            title: 'Sections',
            components: [
                {
                    title: 'Section',
                    id: 'section',
                    filter: 'section',
                    model: 'section',
                    plugins: { da: { unsafeHTML: '<div></div>' } },
                },
            ],
        },
        {
            title: 'Blocks',
            components: [
                {
                    title: 'Cards',
                    id: 'cards',
                    model: 'cards', // deliberately unresolvable — 38 of 78 real entries are
                    filter: 'cards',
                    plugins: { da: { rows: 1, columns: 2 } },
                },
                {
                    title: 'Card',
                    id: 'card',
                    model: 'card',
                    plugins: { da: { rows: 1, columns: 1 } },
                },
                // Real file has entries with no plugins block at all.
                { title: 'Bare', id: 'bare' },
            ],
        },
    ],
};

const MODELS = [
    {
        id: 'card',
        fields: [
            { component: 'reference', valueType: 'string', name: 'image', label: 'Image', multi: false },
            { component: 'text', valueType: 'string', name: 'imageAlt', label: 'Image Alt', multi: false },
            { component: 'richtext', name: 'text', value: '', label: 'Text', valueType: 'string' },
        ],
    },
    { id: 'image', fields: [{ component: 'reference', name: 'image', label: 'Image' }] },
];

const FILTERS = [
    { id: 'cards', components: ['card'] },
    { id: 'section', components: ['text', 'image'] },
];

/** Serve all three registry files (and the manifest) from one readFile mock. */
function mockRegistry(
    overrides: { definition?: unknown; models?: unknown; filters?: unknown } = {},
    storefrontPath = STOREFRONT_PATH,
): void {
    const manifest = {
        name: PROJECT_NAME,
        status: 'ready',
        componentInstances: { 'eds-storefront': { path: storefrontPath } },
    };
    const serve = (value: unknown): Promise<string> =>
        typeof value === 'string' ? Promise.resolve(value) : Promise.resolve(JSON.stringify(value));

    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        const file = String(p);
        if (file.endsWith('.demo-builder.json')) return Promise.resolve(JSON.stringify(manifest));
        if (file.endsWith('component-definition.json')) {
            return serve('definition' in overrides ? overrides.definition : DEFINITION);
        }
        if (file.endsWith('component-models.json')) {
            if ('models' in overrides && overrides.models === undefined) {
                return Promise.reject(new Error('ENOENT'));
            }
            return serve('models' in overrides ? overrides.models : MODELS);
        }
        if (file.endsWith('component-filters.json')) {
            if ('filters' in overrides && overrides.filters === undefined) {
                return Promise.reject(new Error('ENOENT'));
            }
            return serve('filters' in overrides ? overrides.filters : FILTERS);
        }
        return Promise.reject(new Error(`Unexpected readFile: ${file}`));
    });
}

const shape = (blockName?: string) =>
    toolHandlers.getBlockAuthoringShape(PROJECTS_DIR, PROJECT_NAME, blockName);

describe('toolHandlers.getBlockAuthoringShape', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ─── guards ──────────────────────────────────────────────────────────────

    it('throws when the project has no EDS storefront configured', async () => {
        mockManifestWithoutStorefront();
        await expect(shape('cards')).rejects.toThrow(/No EDS storefront configured/i);
    });

    it('throws when the manifest storefront path escapes the project directory', async () => {
        mockManifestWithStorefront('/somewhere/else');
        await expect(shape('cards')).rejects.toThrow(/escapes allowed directory/i);
    });

    it('throws naming component-definition.json when it cannot be read', async () => {
        mockRegistry({ definition: undefined });
        // `definition: undefined` serves the literal string "undefined" → parse error
        // naming the file; the missing-file path is covered by the next test.
        await expect(shape('cards')).rejects.toThrow(/component-definition\.json/i);
    });

    it('throws naming component-definition.json when it is not valid JSON', async () => {
        mockRegistry({ definition: '{ not json' });
        await expect(shape('cards')).rejects.toThrow(/component-definition\.json/i);
    });

    it('reads component-definition.json from the storefront root', async () => {
        mockRegistry();
        await shape('cards');
        const readPaths = (fsProm.readFile as jest.Mock).mock.calls.map((c) => String(c[0]));
        expect(readPaths).toContain(COMP_DEF_PATH);
    });

    // ─── detail: the three authoring conventions ─────────────────────────────

    // The dominant real convention (51 of 78): a positional table.
    it('returns rows/columns for a positional block, plus the children its filter allows', async () => {
        mockRegistry();

        const parsed = JSON.parse(await shape('cards'));

        expect(parsed).toEqual({
            id: 'cards',
            title: 'Cards',
            authoring: { rows: 1, columns: 2 },
            // Without this an agent sees "2 columns" and authors flat cells — the
            // real content of `cards` is `card` children.
            childComponents: ['card'],
        });
    });

    it('returns name/type/fields for a key-value block', async () => {
        mockRegistry();

        const parsed = JSON.parse(await shape('image'));

        expect(parsed.authoring).toEqual({
            name: 'image',
            type: 'image',
            fields: [
                { name: 'imageAlt', selector: 'img[alt]' },
                { name: 'image', selector: 'img[src]' },
            ],
        });
    });

    it('returns unsafeHTML for a literal-markup block', async () => {
        mockRegistry();

        const parsed = JSON.parse(await shape('section'));

        expect(parsed.authoring).toEqual({ unsafeHTML: '<div></div>' });
        expect(parsed.childComponents).toEqual(['text', 'image']);
    });

    // ─── model resolution ────────────────────────────────────────────────────

    it('resolves the model fields, projected to name/label/component', async () => {
        mockRegistry();

        const parsed = JSON.parse(await shape('card'));

        expect(parsed.fields).toEqual([
            { name: 'image', label: 'Image', component: 'reference' },
            { name: 'imageAlt', label: 'Image Alt', component: 'text' },
            { name: 'text', label: 'Text', component: 'richtext' },
        ]);
    });

    // 38 of 78 real components name a model that has no entry — that is normal,
    // not an error.
    it('omits fields when the named model has no entry', async () => {
        mockRegistry();

        const parsed = JSON.parse(await shape('cards'));

        expect(parsed).not.toHaveProperty('fields');
    });

    it('still answers when component-models.json and component-filters.json are absent', async () => {
        mockRegistry({ models: undefined, filters: undefined });

        const parsed = JSON.parse(await shape('cards'));

        expect(parsed).toEqual({ id: 'cards', title: 'Cards', authoring: { rows: 1, columns: 2 } });
    });

    // ─── missing / bare entries ──────────────────────────────────────────────

    it('errors for an unregistered block and points at get_block_source', async () => {
        mockRegistry();
        // A block can exist on disk and never have been registered — a different
        // problem from a typo, so the message names the next step.
        await expect(shape('carousel')).rejects.toThrow(/get_block_source/);
    });

    it('reports a registered block that declares no authoring shape', async () => {
        mockRegistry();
        await expect(shape('bare')).rejects.toThrow(/bare/);
    });

    // ─── index mode ──────────────────────────────────────────────────────────

    it('lists every registered block across ALL groups with its authoring convention', async () => {
        mockRegistry();

        const parsed = JSON.parse(await shape());

        expect(parsed.blocks).toEqual([
            { id: 'image', title: 'Image', authoring: 'fields' },
            { id: 'section', title: 'Section', authoring: 'html' },
            { id: 'cards', title: 'Cards', authoring: 'table' },
            { id: 'card', title: 'Card', authoring: 'table' },
            { id: 'bare', title: 'Bare', authoring: 'none' },
        ]);
    });

    // The index is the cheap half; carrying markup or field lists would defeat it.
    it('omits markup and field detail from the index', async () => {
        mockRegistry();

        const raw = await shape();

        expect(raw).not.toContain('<div>');
        expect(raw).not.toContain('img[src]');
        expect(raw).not.toContain('columns');
    });

    it('returns an empty list for a definition with no groups', async () => {
        mockRegistry({ definition: {} });

        expect(JSON.parse(await shape())).toEqual({ blocks: [], count: 0, total: 0 });
    });

    it('tolerates a group with no components array', async () => {
        mockRegistry({ definition: { groups: [{ title: 'Empty' }, DEFINITION.groups[1]] } });

        const parsed = JSON.parse(await shape());

        expect(parsed.blocks).toEqual([{ id: 'section', title: 'Section', authoring: 'html' }]);
    });
});
