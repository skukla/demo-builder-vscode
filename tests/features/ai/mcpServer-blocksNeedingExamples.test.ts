/**
 * MCP Server Tests — list_blocks_needing_examples (EDS-71 step 4c)
 *
 * The blocks in the storefront's code whose DA.live example page is still Demo Builder's (a
 * code-shaped placeholder or an old stub) or missing, each with what an agent needs to draft
 * one: its title, the table shape its code reads (`analyzeBlockCode`) and a README excerpt.
 * Signed in to DA.live it reads each page; otherwise it answers the list the last block list
 * build recorded on the project, and says so.
 *
 * DA.live is mocked at the module boundary; the filesystem through mcpServer.testUtils.
 */

import { DaLiveAuthError } from '@/features/eds/services/types';
import {
    fsProm,
    path,
    toolHandlers,
    PROJECTS_DIR,
    PROJECT_NAME,
    STOREFRONT_PATH,
} from './mcpServer.testUtils';
import { expectWithinCeiling } from './server/responseCeilings';

const mockReadBlockDocPage = jest.fn();
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        blockLibOps: { readBlockDocPage: mockReadBlockDocPage },
    })),
}));

const doc = (inner: string): string =>
    `<body><header></header><main>${inner}</main><footer></footer></body>`;
/** What the library build writes for a block with no example (`blockDoc` placeholder). */
const PLACEHOLDER = doc('<div><div class="carousel"><div><div><p>Column 1 content</p></div>'
    + '<div><p>Column 2 content</p></div></div></div></div>');
/** The old `generateStubDocPages` page: one cell holding the block's title. */
const OLD_STUB = doc('<div><div class="hero"><div><div><p>Hero</p></div></div></div></div>');
const AUTHORED = doc('<div><div class="cards"><div><div><p>Summer picks</p></div></div></div></div>');

const FOLDERS = ['cards', 'carousel', 'hero', 'tabs', 'Not_A_Block'];
const FILES: Record<string, string> = {
    'blocks/carousel/carousel.js':
        'export default function decorate(block) { [...block.children].forEach((row) => row.children[1]); }',
    'blocks/carousel/carousel.css': '.carousel.dark { color: #000 }',
    'blocks/carousel/README.md': `# Carousel\n\nRotating banner. ${'x'.repeat(2_000)}`,
};

const TOKENS = { daLiveToken: 'da-live-token', githubToken: null };

function mockProject(stored?: string[]): void {
    const manifest = {
        name: PROJECT_NAME,
        componentInstances: {
            'eds-storefront': {
                path: STOREFRONT_PATH,
                metadata: {
                    daLiveOrg: 'user-org',
                    githubRepo: 'user-org/user-site',
                    ...(stored ? { blocksNeedingExamples: stored } : {}),
                },
            },
        },
    };
    (fsProm.readFile as jest.Mock).mockImplementation(async (p: string) => {
        const file = String(p);
        if (file.endsWith('.demo-builder.json')) return JSON.stringify(manifest);
        const relative = path.relative(STOREFRONT_PATH, file);
        if (FILES[relative] !== undefined) return FILES[relative];
        throw Object.assign(new Error(`ENOENT: ${file}`), { code: 'ENOENT' });
    });
    (fsProm.readdir as jest.Mock).mockResolvedValue(
        FOLDERS.map((name) => ({ name, isDirectory: () => true })),
    );
}

const PAGES: Record<string, string | undefined> = {
    cards: AUTHORED,
    carousel: PLACEHOLDER,
    hero: OLD_STUB,
    tabs: undefined,
};

const list = async (tokens?: typeof TOKENS, offset?: number, limit?: number) =>
    JSON.parse(await toolHandlers.listBlocksNeedingExamples(
        PROJECTS_DIR, PROJECT_NAME, offset, limit, tokens,
    ));

beforeEach(() => {
    jest.clearAllMocks();
    mockReadBlockDocPage.mockImplementation(async (_o: string, _s: string, id: string) => PAGES[id]);
});

describe('list_blocks_needing_examples — signed in to DA.live', () => {
    it("lists the blocks whose page is Demo Builder's or missing, read from the storefront's site", async () => {
        mockProject();

        const out = await list(TOKENS);

        expect(out.source).toBe('da-live');
        expect(out.blocks.map((b: { id: string; page: string }) => [b.id, b.page])).toEqual([
            ['carousel', 'placeholder'],
            ['hero', 'old-stub'],
            ['tabs', 'none'],
        ]);
        expect(out.total).toBe(3);
        // Read from the storefront's own DA.live site, the site its repository names.
        expect(mockReadBlockDocPage).toHaveBeenCalledWith('user-org', 'user-site', 'carousel');
    });

    it('gives each block its title, the table shape its code reads, and a short README', async () => {
        mockProject();

        const carousel = (await list(TOKENS)).blocks[0];

        expect(carousel).toMatchObject({
            id: 'carousel',
            title: 'Carousel',
            code: { rows: 2, columns: 2, variants: ['dark'] },
        });
        expect(carousel.readme).toMatch(/^# Carousel\n\nRotating banner\./);
        expect(carousel.readme.length).toBeLessThan(600);
        expect(carousel.readme).toMatch(/\[truncated\]$/);
    });

    it('pages the list and says how many more there are', async () => {
        mockProject();

        const out = await list(TOKENS, 1, 1);

        expect(out.blocks.map((b: { id: string }) => b.id)).toEqual(['hero']);
        expect(out.count).toBe(1);
        expect(out.total).toBe(3);
        expect(out.more).toMatch(/^1 more/);
    });

    it('leaves out a block whose page could not be read, and says how many', async () => {
        mockProject();
        mockReadBlockDocPage.mockImplementation(async (_o: string, _s: string, id: string) => {
            if (id === 'hero') throw new Error('503');
            return PAGES[id];
        });

        const out = await list(TOKENS);

        expect(out.blocks.map((b: { id: string }) => b.id)).toEqual(['carousel', 'tabs']);
        expect(out.unreadable).toBe(1);
    });

    it('answers the recorded list when the DA.live sign-in has expired', async () => {
        mockProject(['tabs']);
        mockReadBlockDocPage.mockRejectedValue(new DaLiveAuthError('expired'));

        const out = await list(TOKENS);

        expect(out.source).toBe('recorded');
        expect(out.blocks.map((b: { id: string }) => b.id)).toEqual(['tabs']);
        expect(out.note).toMatch(/DA\.live/);
    });

    it('stays within its response ceiling for a large storefront', async () => {
        mockProject();
        (fsProm.readdir as jest.Mock).mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({
            name: `block-${i}`, isDirectory: () => true,
        })));
        (fsProm.readFile as jest.Mock).mockImplementation(async (p: string) => {
            if (String(p).endsWith('.demo-builder.json')) return JSON.stringify({ componentInstances: {
                'eds-storefront': { path: STOREFRONT_PATH, metadata: { daLiveOrg: 'o', daLiveSite: 's' } },
            } });
            return 'r'.repeat(20_000);
        });
        mockReadBlockDocPage.mockResolvedValue(undefined);

        const raw = await toolHandlers.listBlocksNeedingExamples(
            PROJECTS_DIR, PROJECT_NAME, undefined, 25, TOKENS,
        );

        expectWithinCeiling('list_blocks_needing_examples', raw);
        expect(JSON.parse(raw).total).toBe(200);
    });
});

describe('list_blocks_needing_examples — not signed in', () => {
    it('answers the list the last build recorded, only blocks the code still has, and says so', async () => {
        mockProject(['carousel', 'gone-block']);

        const out = await list(undefined);

        expect(out.source).toBe('recorded');
        expect(out.blocks.map((b: { id: string }) => b.id)).toEqual(['carousel']);
        expect(out.blocks[0]).not.toHaveProperty('page');
        expect(out.note).toMatch(/sign in to DA\.live/i);
        expect(mockReadBlockDocPage).not.toHaveBeenCalled();
    });

    it('answers an empty list for a project with no record', async () => {
        mockProject();

        const out = await list(undefined);

        expect(out.blocks).toStrictEqual([]);
        expect(out.total).toBe(0);
    });
});
