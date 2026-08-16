/**
 * Response-size audit — the file-based tools (`registerProjectTools`).
 *
 * These ten return their response STRING directly, so measuring them needs no
 * server, no socket and no live extension: drive the handler over the mocked
 * filesystem the sibling suites already use, and weigh what comes back.
 *
 * Every payload here is deliberately OVERSIZED relative to a real project — 300
 * projects, a 200-block storefront, 120 registry entries. A ceiling that only
 * holds for a small fixture is not a guard; the two bloat shapes this whole
 * audit found (a list with no page size, a field carried for the dashboard) are
 * invisible until the data is big.
 */

import {
    fsProm,
    toolHandlers,
    PROJECTS_DIR,
    PROJECT_NAME,
    STOREFRONT_PATH,
    path,
} from './mcpServer.testUtils';
import { expectWithinCeiling, RESPONSE_CEILINGS } from './server/responseCeilings';

/** A manifest fat enough to expose a collapse that stops working. */
function bigManifest() {
    return {
        name: PROJECT_NAME,
        status: 'ready',
        selectedStack: 'eds-commerce',
        componentInstances: {
            'eds-storefront': { path: STOREFRONT_PATH, metadata: { githubRepo: 'o/r' } },
        },
        // Each of these is a collapse point in summarizeManifest. If one stops
        // collapsing, the ceiling catches it here rather than in production.
        aiPrompts: Array.from({ length: 40 }, (_, i) => ({
            id: `p${i}`,
            title: `Prompt ${i}`,
            prompt: 'z'.repeat(2000),
        })),
        aiFileHashes: Object.fromEntries(
            Array.from({ length: 120 }, (_, i) => [`generated/file-${i}.md`, 'a'.repeat(64)]),
        ),
        installedBlockLibraries: Array.from({ length: 12 }, (_, i) => ({
            name: `lib-${i}`,
            source: { owner: 'o', repo: `r${i}` },
            blockIds: Array.from({ length: 40 }, (_, j) => `block-${j}`),
        })),
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('file-based tool responses stay within their ceilings', () => {
    it('list_projects — 300 projects', async () => {
        (fsProm.readdir as jest.Mock).mockResolvedValue(
            Array.from({ length: 300 }, (_, i) => ({
                name: `project-${i}`,
                isDirectory: () => true,
            })),
        );
        (fsProm.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({ name: 'p', status: 'ready' }),
        );

        expectWithinCeiling('list_projects', await toolHandlers.listProjects(PROJECTS_DIR));
    });

    it('get_project — a manifest with 40 prompts, 120 file hashes and 12 libraries', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue(JSON.stringify(bigManifest()));

        const out = await toolHandlers.getProject(PROJECTS_DIR, PROJECT_NAME);

        expectWithinCeiling('get_project', out);
        // The ceiling holds because each array is collapsed, not because the
        // fixture is small — assert the collapses directly so a passing ceiling
        // cannot mask one silently regressing.
        expect(out).toContain('40 prompt(s)');
        expect(out).toContain('120 file hash(es)');
        expect(out).not.toContain('z'.repeat(100));
        expect(out).not.toContain('a'.repeat(64));
    });

    it('list_blocks — a 200-block storefront', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({
                name: PROJECT_NAME,
                componentInstances: { 'eds-storefront': { path: STOREFRONT_PATH } },
            }),
        );
        (fsProm.readdir as jest.Mock).mockResolvedValue(
            Array.from({ length: 200 }, (_, i) => ({
                name: `block-name-number-${i}`,
                isDirectory: () => true,
            })),
        );

        expectWithinCeiling('list_blocks', await toolHandlers.listBlocks(PROJECTS_DIR, PROJECT_NAME));
    });

    it('get_block_source — a block directory of 400 files', async () => {
        (fsProm.readFile as jest.Mock).mockResolvedValue(
            JSON.stringify({
                name: PROJECT_NAME,
                componentInstances: { 'eds-storefront': { path: STOREFRONT_PATH } },
            }),
        );
        (fsProm.readdir as jest.Mock).mockResolvedValue(
            Array.from({ length: 400 }, (_, i) => ({
                name: `file-${i}.js`,
                isFile: () => true,
            })),
        );
        (fsProm.stat as jest.Mock).mockResolvedValue({ size: 1234 });

        const out = await toolHandlers.getBlockSource(PROJECTS_DIR, PROJECT_NAME, 'cards');

        expectWithinCeiling('get_block_source', out);
        // Bounded by MAX_BLOCK_FILES (50), not by the fixture happening to be small.
        expect(JSON.parse(out).files).toHaveLength(50);
    });

    it('get_block_authoring_shape — index of a 300-component registry', async () => {
        const components = Array.from({ length: 300 }, (_, i) => ({
            id: `component-${i}`,
            title: `Component number ${i}`,
            plugins: { da: { rows: 1, columns: 2 } },
        }));
        (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
            const f = String(p);
            if (f.endsWith('.demo-builder.json')) {
                return Promise.resolve(
                    JSON.stringify({
                        name: PROJECT_NAME,
                        componentInstances: { 'eds-storefront': { path: STOREFRONT_PATH } },
                    }),
                );
            }
            if (f.endsWith('component-definition.json')) {
                return Promise.resolve(JSON.stringify({ groups: [{ components }] }));
            }
            return Promise.reject(new Error('ENOENT'));
        });

        const out = await toolHandlers.getBlockAuthoringShape(PROJECTS_DIR, PROJECT_NAME);

        expectWithinCeiling('get_block_authoring_shape', out);
        // The index must stay an index: no markup, no selectors, no field lists.
        expect(out).not.toContain('unsafeHTML');
        expect(out).not.toContain('selector');
    });

    it('get_component_config — a large .env is returned verbatim', async () => {
        // This tool exists to return a file; its ceiling is deliberately high.
        // The assertion is that the ceiling is RECORDED, so nobody later mistakes
        // a legitimately large response for a leak.
        (fsProm.readFile as jest.Mock).mockResolvedValue('KEY=value\n'.repeat(1500));
        (fsProm.realpath as jest.Mock).mockImplementation((p: string) => Promise.resolve(p));

        const out = await toolHandlers.getComponentConfig(
            PROJECTS_DIR,
            PROJECT_NAME,
            path.join('components', 'x', '.env'),
        );

        expectWithinCeiling('get_component_config', out);
    });
});

describe('the ceiling table itself', () => {
    it('records a ceiling for every file-based tool', () => {
        for (const tool of [
            'list_projects',
            'get_project',
            'get_component_config',
            'update_project_config',
            'sync_storefront',
            'list_blocks',
            'get_block_source',
            'get_block_authoring_shape',
            'promote_block_to_library',
            'remove_block_from_library',
        ]) {
            expect(RESPONSE_CEILINGS[tool]).toBeDefined();
            expect(RESPONSE_CEILINGS[tool].why).not.toBe('');
        }
    });

    it('refuses a tool with no recorded ceiling', () => {
        // The guard that keeps this table honest: adding a tool without a size
        // is what let get_datapack_activity reach 25KB unnoticed.
        expect(() => expectWithinCeiling('not_a_recorded_tool', '{}')).toThrow(/No response ceiling/);
    });
});
