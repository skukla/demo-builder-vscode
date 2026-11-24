/**
 * MCP Server Tests — get_block_authoring_shape
 *
 * Returns how an author fills a block in, from sources every storefront has
 * (EDS-71 step 5). `component-definition.json` is not one of them: Adobe deleted
 * it from its templates, and the block list follows the code.
 *
 * - Index: the storefront's `blocks/<id>/` folders.
 * - One block: the tables on its example page in the storefront's DA.live block
 *   list (`.da/library/blocks/<id>`), per style variant; else, when there is no
 *   real example, the rows, columns and variants its code reads (as DA.live's
 *   Import Blocks reads them), plus its README.
 *
 * The example pages are written in the shape `blockDoc` writes them, which mirrors
 * DA.live's Import Blocks (adobe/da-live `blocks/config/blocks-import/blocks.js`):
 * `<body><header></header><main>` + one `<div><div class="<id> <variant>">…</div></div>`
 * section per variant + `</main><footer></footer></body>`.
 */

import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
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

const mockReadBlockDocPage = jest.fn();
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        blockLibOps: { readBlockDocPage: mockReadBlockDocPage },
    })),
}));
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest.fn(),
    createDaLiveTokenProvider: jest.fn(),
}));

const TOKENS: { daLiveToken: string | null; githubToken: null } = {
    daLiveToken: 'da-live-token',
    githubToken: null,
};

const CARDS_JS = `export default function decorate(block) {
  [...block.children].forEach((row) => {
    const image = row.children[0];
    const body = row.children[1];
  });
}`;
const CARDS_CSS = '.cards { display: grid; }\n.cards.horizontal { grid-auto-flow: column; }\n';
const CARDS_README = '# Cards\n\nEach row is one card: an image cell, then a text cell.';

const ROW = '<div><div><picture><img src="./media_1.png" alt=""></picture></div><div><p>Card body</p></div></div>';
/** The same row as the example comes back: cleaned as Import Blocks does, an image tag self-closed. */
const ROW_OUT = ROW.replace('alt="">', 'alt="" />');
const CARDS_PAGE =
    '<body><header></header><main>' +
    `<div><div class="cards">${ROW}${ROW}</div></div>` +
    `<div><div class="cards horizontal">${ROW}</div></div>` +
    '</main><footer></footer></body>';
/** What the library build writes when it has no example (`blockDoc` with no examples). */
const CARDS_PLACEHOLDER =
    '<body><header></header><main>' +
    '<div><div class="cards"><div><div><p>Column 1 content</p></div><div><p>Column 2 content</p></div></div></div></div>' +
    '</main><footer></footer></body>';

/** The manifest, the block folders, and the files of `cards`. */
function mockStorefront(
    opts: { folders?: string[]; readme?: boolean; daLive?: boolean } = {},
): void {
    const { folders = ['cards', 'hero', 'commerce-cart'], readme = true, daLive = true } = opts;
    const manifest = {
        name: PROJECT_NAME,
        status: 'ready',
        componentInstances: {
            'eds-storefront': {
                path: STOREFRONT_PATH,
                metadata: daLive ? { daLiveOrg: 'user-org', githubRepo: 'user-org/user-site' } : {},
            },
        },
    };
    const files: Record<string, string> = {
        'blocks/cards/cards.js': CARDS_JS,
        'blocks/cards/cards.css': CARDS_CSS,
        ...(readme ? { 'blocks/cards/README.md': CARDS_README } : {}),
    };
    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        const file = String(p);
        if (file.endsWith('.demo-builder.json')) return Promise.resolve(JSON.stringify(manifest));
        const rel = path.relative(STOREFRONT_PATH, file);
        return rel in files ? Promise.resolve(files[rel]) : Promise.reject(new Error(`ENOENT ${rel}`));
    });
    (fsProm.readdir as jest.Mock).mockResolvedValue([
        ...folders.map((name) => ({ name, isDirectory: () => true })),
        { name: 'README.md', isDirectory: () => false },
    ]);
    (fsProm.stat as jest.Mock).mockImplementation((p: string) => {
        const id = path.basename(String(p));
        return folders.includes(id) ? Promise.resolve({}) : Promise.reject(new Error('ENOENT'));
    });
}

const shape = (blockName?: string, tokens: typeof TOKENS = TOKENS, search?: string) =>
    toolHandlers.getBlockAuthoringShape(PROJECTS_DIR, PROJECT_NAME, blockName, search, tokens);

describe('toolHandlers.getBlockAuthoringShape', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockReadBlockDocPage.mockResolvedValue(undefined);
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

    it('never reads component-definition.json', async () => {
        mockStorefront();

        await shape();
        await shape('cards');

        const reads = (fsProm.readFile as jest.Mock).mock.calls.map(([p]) => String(p));
        expect(reads.filter((p) => p.includes('component-'))).toStrictEqual([]);
    });

    // ─── index mode ──────────────────────────────────────────────────────────

    it("lists the storefront's block folders A to Z, with their titles", async () => {
        mockStorefront();

        expect(JSON.parse(await shape())).toEqual({
            blocks: [
                { id: 'cards', title: 'Cards' },
                { id: 'commerce-cart', title: 'Commerce Cart' },
                { id: 'hero', title: 'Hero' },
            ],
            count: 3,
            total: 3,
        });
    });

    it('filters the index by id or title', async () => {
        mockStorefront();

        const parsed = JSON.parse(await shape(undefined, TOKENS, 'Commerce'));

        expect(parsed.blocks).toEqual([{ id: 'commerce-cart', title: 'Commerce Cart' }]);
        expect(parsed.totalUnfiltered).toBe(3);
    });

    // The same rule the DA.live block list uses (`listableBlockIds`), so the index lists
    // exactly the code blocks the palette lists.
    it('leaves out a folder whose name is not a block name', async () => {
        mockStorefront({ folders: ['cards', 'Old_Cards', 'hero.bak'] });

        expect(JSON.parse(await shape()).blocks).toEqual([{ id: 'cards', title: 'Cards' }]);
    });

    it('lists no blocks for a storefront without a blocks folder', async () => {
        mockStorefront();
        (fsProm.readdir as jest.Mock).mockRejectedValue(new Error('ENOENT'));

        expect(JSON.parse(await shape())).toEqual({ blocks: [], count: 0, total: 0 });
    });

    it('reads nothing from DA.live for the index', async () => {
        mockStorefront();

        await shape();

        expect(DaLiveContentOperations).not.toHaveBeenCalled();
    });

    // ─── detail: the example page ────────────────────────────────────────────

    it("returns the example page's tables, one per style variant, with rows and columns", async () => {
        mockStorefront();
        mockReadBlockDocPage.mockResolvedValue(CARDS_PAGE);

        const parsed = JSON.parse(await shape('cards'));

        expect(mockReadBlockDocPage).toHaveBeenCalledWith('user-org', 'user-site', 'cards');
        expect(parsed).toEqual({
            id: 'cards',
            title: 'Cards',
            source: 'example-page',
            examples: [
                { variant: '', rows: 2, columns: 2, html: `${ROW_OUT}${ROW_OUT}` },
                { variant: 'horizontal', rows: 1, columns: 2, html: ROW_OUT },
            ],
            readme: CARDS_README,
        });
    });

    it('clips a long example table and says so', async () => {
        mockStorefront();
        const long = `<div><div><p>${'x'.repeat(5_000)}</p></div></div>`;
        mockReadBlockDocPage.mockResolvedValue(
            `<body><header></header><main><div><div class="cards">${long}</div></div></main><footer></footer></body>`,
        );

        const [example] = JSON.parse(await shape('cards')).examples;

        expect(example.truncated).toBe(true);
        expect(example.html.length).toBeLessThan(long.length);
        expect(example.rows).toBe(1);
    });

    // ─── detail: the code answers when there is no real example ──────────────

    it("answers from the block's code when it has no example page", async () => {
        mockStorefront();

        expect(JSON.parse(await shape('cards'))).toEqual({
            id: 'cards',
            title: 'Cards',
            source: 'code',
            examplePage: 'none',
            rows: 2,
            columns: 2,
            variants: ['horizontal'],
            readme: CARDS_README,
        });
    });

    it('takes a page Demo Builder generated (an untouched placeholder) as no example', async () => {
        mockStorefront();
        mockReadBlockDocPage.mockResolvedValue(CARDS_PLACEHOLDER);

        const parsed = JSON.parse(await shape('cards'));

        expect(parsed.source).toBe('code');
        expect(parsed.examplePage).toBe('generated');
    });

    it('answers from the code, and says why, when DA.live is not signed in', async () => {
        mockStorefront();

        const parsed = JSON.parse(await shape('cards', { daLiveToken: null, githubToken: null }));

        expect(parsed.source).toBe('code');
        expect(parsed.examplePage).toBe('not-signed-in');
        expect(DaLiveContentOperations).not.toHaveBeenCalled();
    });

    it('answers from the code when the storefront has no DA.live site', async () => {
        mockStorefront({ daLive: false });

        expect(JSON.parse(await shape('cards')).examplePage).toBe('no-da-live-site');
    });

    it('answers from the code when the example page cannot be read', async () => {
        mockStorefront();
        mockReadBlockDocPage.mockRejectedValue(new Error('Doc page for cards not read: 500'));

        expect(JSON.parse(await shape('cards')).examplePage).toBe('unreadable');
    });

    it('leaves the readme out when the block has none', async () => {
        mockStorefront({ readme: false });

        expect(JSON.parse(await shape('cards'))).not.toHaveProperty('readme');
    });

    it('errors for a block with no folder, and names the index call', async () => {
        mockStorefront();

        await expect(shape('carousel')).rejects.toThrow(/no folder under blocks\/.*no blockName/);
    });
});
