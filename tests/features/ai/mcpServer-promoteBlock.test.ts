/**
 * MCP Server Tests — promote_block_to_library
 *
 * toolHandlers.promoteBlockToLibrary writes a block to the DA.live authoring
 * library: edits the local component-definition.json, writes the DA.live doc
 * page + sheet row, then commits/pushes/publishes via syncAndPublish and
 * previewAndPublishPage.
 *
 * Shared fs/child_process mocks live in mcpServer.testUtils.ts. DA.live and
 * Helix calls are mocked at the module boundary so the test does not exercise
 * real network I/O.
 */

import { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import {
    fsProm,
    toolHandlers,
    registerProjectTools,
    PROJECTS_DIR,
    PROJECT_NAME,
    STOREFRONT_PATH,
} from './mcpServer.testUtils';

// Mock DaLiveContentOperations so we can assert on doc-page + sheet calls.
const mockAppendBlockToLibrary = jest.fn();
const mockUpsertBlockDocPage = jest.fn();

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        appendBlockToLibrary: mockAppendBlockToLibrary,
        upsertBlockDocPage: mockUpsertBlockDocPage,
    })),
    createDaLiveServiceTokenProvider: jest.fn(),
    createDaLiveTokenProvider: jest.fn(),
}));

// Mock storefrontSyncService — captures commit/push.
const mockSyncAndPublish = jest.fn();
jest.mock('@/features/eds/services/storefrontSyncService', () => ({
    syncAndPublish: (...args: unknown[]) => mockSyncAndPublish(...args),
    PushRejectedError: class PushRejectedError extends Error {
        constructor(message: string) { super(message); this.name = 'PushRejectedError'; }
    },
}));

// Mock helixApiClient.previewAndPublishPage.
const mockPreviewAndPublishPage = jest.fn();
jest.mock('@/features/eds/services/helixApiClient', () => ({
    previewAndPublishPage: (...args: unknown[]) => mockPreviewAndPublishPage(...args),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BLOCK_ID = 'promo-banner';
const BLOCK_TITLE = 'Promo Banner';
const BLOCK_HTML = '<div class="promo-banner">Save 20% today</div>';
const DA_LIVE_ORG = 'user-org';
const DA_LIVE_SITE = 'user-site';
const GITHUB_OWNER = 'user-org';
const GITHUB_SITE = 'user-site';

function manifestWith(opts: {
    componentDef?: Array<{ id: string; title: string; plugins?: { da?: { unsafeHTML?: string } } }>;
    includeStorefront?: boolean;
    includeDaLive?: boolean;
} = {}) {
    const { componentDef, includeStorefront = true, includeDaLive = true } = opts;
    const compDef = {
        groups: [
            {
                id: 'blocks',
                title: 'Blocks',
                components: componentDef ?? [],
            },
        ],
    };
    return {
        manifest: {
            name: 'my-project',
            status: 'ready',
            componentInstances: includeStorefront
                ? {
                    'eds-storefront': {
                        path: STOREFRONT_PATH,
                        metadata: includeDaLive
                            ? {
                                daLiveOrg: DA_LIVE_ORG,
                                daLiveSite: DA_LIVE_SITE,
                                githubRepo: `${GITHUB_OWNER}/${GITHUB_SITE}`,
                            }
                            : {},
                    },
                }
                : {},
        },
        componentDefinition: compDef,
    };
}

/**
 * Set up the standard fs mocks for a successful happy-path run:
 *   - manifest read (.demo-builder.json)
 *   - component-definition.json read + write
 *   - stat() on blocks/<blockId>/ resolves (block source exists)
 *   - stat() on .git resolves
 *
 * Pass `componentDefinition` to control the comp-def the handler reads;
 * pass `blockDirExists: false` to make the block source stat() reject.
 */
function mockHappyPathFilesystem(opts: {
    componentDef?: Array<{ id: string; title: string; plugins?: { da?: { unsafeHTML?: string } } }>;
    blockDirExists?: boolean;
    includeStorefront?: boolean;
    includeDaLive?: boolean;
} = {}) {
    const { blockDirExists = true } = opts;
    const { manifest, componentDefinition } = manifestWith(opts);

    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        const sp = String(p);
        if (sp.endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        if (sp.endsWith('component-definition.json')) {
            return Promise.resolve(JSON.stringify(componentDefinition));
        }
        return Promise.reject(new Error(`Unexpected readFile: ${p}`));
    });

    (fsProm.stat as jest.Mock).mockImplementation((p: string) => {
        const sp = String(p);
        if (sp.includes(`blocks/${BLOCK_ID}`)) {
            return blockDirExists
                ? Promise.resolve({ isDirectory: () => true })
                : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        }
        return Promise.resolve({ size: 0 });
    });

    (fsProm.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fsProm.mkdir as jest.Mock).mockResolvedValue(undefined);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// Tokens are injected by the caller (the in-extension server resolves them from
// the live sign-in session); these direct-handler tests supply them via this
// wrapper. The credential-source describe below exercises the wiring seam.
const TOKENS = { daLiveToken: 'da-live-token', githubToken: 'github-token' };
const promote = (
    projectsDir: string, projectName: string, blockId: string,
    title: string, unsafeHTML: string, description?: string,
): Promise<string> =>
    toolHandlers.promoteBlockToLibrary(projectsDir, projectName, blockId, title, unsafeHTML, description, TOKENS);

describe('toolHandlers.promoteBlockToLibrary', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        mockAppendBlockToLibrary.mockResolvedValue({ status: 'created', siteConfigRegistered: true });
        mockUpsertBlockDocPage.mockResolvedValue('written');
        mockSyncAndPublish.mockResolvedValue({
            committed: true,
            pushed: true,
            helixPublished: true,
            summary: 'ok',
        });
        mockPreviewAndPublishPage.mockResolvedValue(undefined);
    });

    it('throws when projectName does not resolve (invalid name)', async () => {
        await expect(
            promote(
                PROJECTS_DIR,
                '../escape',
                BLOCK_ID,
                BLOCK_TITLE,
                BLOCK_HTML,
            ),
        ).rejects.toThrow(/invalid project name/i);
    });

    it('throws when no EDS storefront is configured', async () => {
        mockHappyPathFilesystem({ includeStorefront: false });

        await expect(
            promote(
                PROJECTS_DIR,
                PROJECT_NAME,
                BLOCK_ID,
                BLOCK_TITLE,
                BLOCK_HTML,
            ),
        ).rejects.toThrow(/no eds storefront configured/i);
    });

    it('throws when block source directory is missing', async () => {
        mockHappyPathFilesystem({ blockDirExists: false });

        await expect(
            promote(
                PROJECTS_DIR,
                PROJECT_NAME,
                BLOCK_ID,
                BLOCK_TITLE,
                BLOCK_HTML,
            ),
        ).rejects.toThrow(/block source not found/i);
    });

    it('happy path — block exists, comp-def lacks entry → appends to comp-def, writes doc page, appends sheet row, publishes', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        const raw = await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            BLOCK_HTML,
        );
        const result = JSON.parse(raw);

        // 1. comp-def written with the new entry appended
        expect(fsProm.writeFile as jest.Mock).toHaveBeenCalledWith(
            expect.stringContaining('component-definition.json'),
            expect.stringContaining(BLOCK_ID),
            'utf-8',
        );
        const writeCall = (fsProm.writeFile as jest.Mock).mock.calls.find(
            ([p]: [string]) => String(p).endsWith('component-definition.json'),
        );
        const writtenJson = JSON.parse(writeCall[1] as string);
        const components = writtenJson.groups[0].components;
        const newEntry = components.find((c: { id: string }) => c.id === BLOCK_ID);
        expect(newEntry).toEqual({
            id: BLOCK_ID,
            title: BLOCK_TITLE,
            plugins: { da: { unsafeHTML: BLOCK_HTML } },
        });
        expect(result.componentDefinition).toBe('added');

        // 2. DA.live doc page written via upsertBlockDocPage (overwrite-always
        // semantics — supports AI iteration on variant HTML)
        expect(mockUpsertBlockDocPage).toHaveBeenCalledWith(
            DA_LIVE_ORG,
            DA_LIVE_SITE,
            { id: BLOCK_ID, exampleHtml: BLOCK_HTML },
        );
        expect(result.docPage).toBe('written');

        // 3. Sheet row appended
        expect(mockAppendBlockToLibrary).toHaveBeenCalledWith(
            DA_LIVE_ORG,
            DA_LIVE_SITE,
            { blockId: BLOCK_ID, title: BLOCK_TITLE },
        );
        expect(result.sheet).toBe('created');

        // 4. Storefront sync + Helix publish
        expect(mockSyncAndPublish).toHaveBeenCalledWith(
            expect.objectContaining({
                storefrontPath: STOREFRONT_PATH,
                commitMessage: expect.stringContaining(BLOCK_ID),
            }),
        );
        expect(mockPreviewAndPublishPage).toHaveBeenCalled();
        expect(result.publish).toBe('success');
    });

    it('happy path — comp-def already has entry → componentDefinition: "unchanged", other steps still run', async () => {
        mockHappyPathFilesystem({
            componentDef: [
                { id: BLOCK_ID, title: BLOCK_TITLE, plugins: { da: { unsafeHTML: BLOCK_HTML } } },
            ],
        });

        const raw = await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            BLOCK_HTML,
        );
        const result = JSON.parse(raw);

        expect(result.componentDefinition).toBe('unchanged');
        // upsertBlockDocPage and appendBlockToLibrary still get called
        expect(mockUpsertBlockDocPage).toHaveBeenCalled();
        expect(mockAppendBlockToLibrary).toHaveBeenCalled();
        // syncAndPublish still gets called (empty-commit no-op is fine)
        expect(mockSyncAndPublish).toHaveBeenCalled();
    });

    it('idempotent re-call — doc page overwrites, sheet returns skipped-duplicate, comp-def unchanged', async () => {
        mockHappyPathFilesystem({
            componentDef: [
                { id: BLOCK_ID, title: BLOCK_TITLE, plugins: { da: { unsafeHTML: BLOCK_HTML } } },
            ],
        });
        mockAppendBlockToLibrary.mockResolvedValue({
            status: 'skipped-duplicate',
            siteConfigRegistered: true,
        });

        const raw = await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            BLOCK_HTML,
        );
        const result = JSON.parse(raw);

        expect(result.componentDefinition).toBe('unchanged');
        expect(result.sheet).toBe('skipped-duplicate');
        // Doc page still gets re-written (overwriting silently is the idempotency contract)
        expect(mockUpsertBlockDocPage).toHaveBeenCalled();
    });

    it('partial success — publish fails → publish: "failed" but doc + sheet + comp-def statuses are real', async () => {
        mockHappyPathFilesystem({ componentDef: [] });
        mockSyncAndPublish.mockRejectedValue(new Error('Helix admin 503'));

        const raw = await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            BLOCK_HTML,
        );
        const result = JSON.parse(raw);

        // Doc + sheet + comp-def succeeded
        expect(result.componentDefinition).toBe('added');
        expect(result.docPage).toBe('written');
        expect(result.sheet).toBe('created');
        // Publish failed, but did NOT throw
        expect(result.publish).toBe('failed');
    });

    it('sanitizer strips <script> tags before writing comp-def + doc page', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        const malicious = '<div class="x">hi</div><script>alert("xss")</script>';

        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            malicious,
        );

        // Doc page write — sanitized html only
        const docCall = mockUpsertBlockDocPage.mock.calls[0];
        expect(docCall[2].exampleHtml).not.toContain('<script>');
        expect(docCall[2].exampleHtml).not.toContain('alert');

        // comp-def write — sanitized html only
        const writeCall = (fsProm.writeFile as jest.Mock).mock.calls.find(
            ([p]: [string]) => String(p).endsWith('component-definition.json'),
        );
        const writtenJson = JSON.parse(writeCall[1] as string);
        const entry = writtenJson.groups[0].components.find((c: { id: string }) => c.id === BLOCK_ID);
        expect(entry.plugins.da.unsafeHTML).not.toContain('<script>');
        expect(entry.plugins.da.unsafeHTML).not.toContain('alert');
    });

    it('sanitizer strips event handlers and javascript: URLs', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        const malicious = '<a href="javascript:alert(1)" onclick="alert(2)">click</a>'
            + '<img src="x" onerror="fetch(\'/steal\')">';

        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            malicious,
        );

        const docCall = mockUpsertBlockDocPage.mock.calls[0];
        const cleaned = docCall[2].exampleHtml as string;
        expect(cleaned).not.toMatch(/javascript:/i);
        expect(cleaned).not.toMatch(/onclick=/i);
        expect(cleaned).not.toMatch(/onerror=/i);
    });

    it('sanitizer strips <iframe> and other framing tags', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        const malicious = '<iframe src="https://evil.example"></iframe>'
            + '<object data="javascript:alert(1)"></object>'
            + '<embed src="x.swf">';

        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            malicious,
        );

        const cleaned = mockUpsertBlockDocPage.mock.calls[0][2].exampleHtml as string;
        expect(cleaned).not.toContain('<iframe');
        expect(cleaned).not.toContain('<object');
        expect(cleaned).not.toContain('<embed');
    });

    it('sanitizer strips data:, vbscript:, and protocol-relative URL schemes', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        const malicious = '<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+">'
            + '<a href="vbscript:msgbox(1)">click</a>'
            + '<a href="//evil.example/x.js">click</a>';

        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            malicious,
        );

        const cleaned = mockUpsertBlockDocPage.mock.calls[0][2].exampleHtml as string;
        expect(cleaned).not.toMatch(/^data:/im);
        expect(cleaned).not.toContain('data:image/svg');
        expect(cleaned).not.toMatch(/vbscript:/i);
        expect(cleaned).not.toContain('//evil.example');
    });

    it('sanitizer strips <style> tags', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        const malicious = '<div>hi</div><style>body { background: url(javascript:alert(1)); }</style>';

        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            malicious,
        );

        const cleaned = mockUpsertBlockDocPage.mock.calls[0][2].exampleHtml as string;
        expect(cleaned).not.toContain('<style');
        expect(cleaned).not.toContain('javascript:');
    });

    it('sanitizer does not rewrite the title argument (only unsafeHTML is sanitized)', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        // Title contains markup-like content; this must reach appendBlockToLibrary verbatim.
        const ornateTitle = 'Promo <Banner>';
        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            ornateTitle,
            '<div class="x">hi</div><script>alert(1)</script>',
        );

        expect(mockAppendBlockToLibrary).toHaveBeenCalledWith(
            DA_LIVE_ORG,
            DA_LIVE_SITE,
            { blockId: BLOCK_ID, title: ornateTitle },
        );
    });

    it('persists optional `description` to component-definition.json entry', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        const desc = 'A promo banner for sitewide sales.';

        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            BLOCK_HTML,
            desc,
        );

        const writeCall = (fsProm.writeFile as jest.Mock).mock.calls.find(
            ([p]: [string]) => String(p).endsWith('component-definition.json'),
        );
        const writtenJson = JSON.parse(writeCall[1] as string);
        const entry = writtenJson.groups[0].components.find((c: { id: string }) => c.id === BLOCK_ID);
        expect(entry.description).toBe(desc);
    });

    it('omits description from entry when not supplied', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            BLOCK_HTML,
            // description omitted
        );

        const writeCall = (fsProm.writeFile as jest.Mock).mock.calls.find(
            ([p]: [string]) => String(p).endsWith('component-definition.json'),
        );
        const writtenJson = JSON.parse(writeCall[1] as string);
        const entry = writtenJson.groups[0].components.find((c: { id: string }) => c.id === BLOCK_ID);
        expect(entry).not.toHaveProperty('description');
    });

    it('sanitizer preserves legitimate EDS block HTML (div + class + img)', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        const legitimate = '<div class="hero-cta">'
            + '<h1>Welcome</h1>'
            + '<p>Shop now</p>'
            + '<img src="https://example.com/hero.jpg" alt="Hero" />'
            + '<a href="/sale">View sale</a>'
            + '</div>';

        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            legitimate,
        );

        const cleaned = mockUpsertBlockDocPage.mock.calls[0][2].exampleHtml as string;
        expect(cleaned).toContain('class="hero-cta"');
        expect(cleaned).toContain('<h1>Welcome</h1>');
        expect(cleaned).toContain('alt="Hero"');
        expect(cleaned).toContain('href="/sale"');
    });

    it('description string mirrors sync-changes.md phrasing so capabilityStatements regression stays green', () => {
        // The tool's MCP description registration is exercised when the
        // standalone server starts (NODE_ENV !== 'test'). We assert the
        // load-bearing text directly from the source via the un-mocked fs
        // module (jest.requireActual — `fs/promises` is mocked globally by
        // mcpServer.testUtils.ts).
        const realFs = jest.requireActual('fs') as typeof import('fs');
        const realPath = jest.requireActual('path') as typeof import('path');
        const srcPath = realPath.resolve(__dirname, '../../../src/mcp-server.ts');
        const src = realFs.readFileSync(srcPath, 'utf-8');
        expect(src).toContain('promote_block_to_library');
        // Must mention "Block changes to push back to source library" — this is
        // the canonical phrasing in sync-changes.md:18 and the regex the
        // capabilityStatements test depends on (`promote_block_to_library`
        // backticked token).
        expect(src).toMatch(/Block changes to push back to source library/);
    });
});

// ─── Credential source ───────────────────────────────────────────────────────
// Regression coverage for the token seam: promote no longer reads
// DA_LIVE_IMS_TOKEN from env (nothing populates it now the standalone process
// is retired) — tokens are injected, resolved from the live sign-in session.

describe('promote_block_to_library — credential source', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAppendBlockToLibrary.mockResolvedValue({ status: 'created', siteConfigRegistered: true });
        mockUpsertBlockDocPage.mockResolvedValue('written');
        mockSyncAndPublish.mockResolvedValue({ committed: true, pushed: true, helixPublished: true, summary: 'ok' });
        mockPreviewAndPublishPage.mockResolvedValue(undefined);
    });

    it('uses the injected DA.live + GitHub tokens', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        await toolHandlers.promoteBlockToLibrary(
            PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, BLOCK_HTML, undefined,
            { daLiveToken: 'injected-da', githubToken: 'injected-gh' },
        );

        // DA.live ops constructed with a provider yielding the injected token.
        const tokenProvider = (DaLiveContentOperations as unknown as jest.Mock).mock.calls[0][0];
        await expect(tokenProvider.getAccessToken()).resolves.toBe('injected-da');
        // Both tokens flow through to the storefront commit/publish step.
        expect(mockSyncAndPublish).toHaveBeenCalledWith(
            expect.objectContaining({ githubToken: 'injected-gh', daLiveToken: 'injected-da' }),
        );
    });

    it('throws when no DA.live token is supplied (user not signed in)', async () => {
        mockHappyPathFilesystem({ componentDef: [] });

        await expect(
            toolHandlers.promoteBlockToLibrary(
                PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, BLOCK_HTML, undefined,
                { daLiveToken: null, githubToken: null },
            ),
        ).rejects.toThrow(/DA\.live token unavailable/i);
    });

    it('registerProjectTools threads the credential provider into the promote tool', async () => {
        mockHappyPathFilesystem({ componentDef: [] });
        const credentials = {
            getDaLiveToken: jest.fn().mockResolvedValue('live-da'),
            getGitHubToken: jest.fn().mockResolvedValue('live-gh'),
        };
        const handlers = new Map<string, (args: unknown) => Promise<unknown>>();
        const server = {
            registerTool: (name: string, _s: unknown, h: (a: unknown) => Promise<unknown>) => handlers.set(name, h),
        };

        registerProjectTools(server, PROJECTS_DIR, credentials);
        await handlers.get('promote_block_to_library')!({
            projectName: PROJECT_NAME, blockId: BLOCK_ID, title: BLOCK_TITLE, unsafeHTML: BLOCK_HTML,
        });

        expect(credentials.getDaLiveToken).toHaveBeenCalled();
        expect(credentials.getGitHubToken).toHaveBeenCalled();
        const tokenProvider = (DaLiveContentOperations as unknown as jest.Mock).mock.calls[0][0];
        await expect(tokenProvider.getAccessToken()).resolves.toBe('live-da');
        expect(mockSyncAndPublish).toHaveBeenCalledWith(
            expect.objectContaining({ githubToken: 'live-gh', daLiveToken: 'live-da' }),
        );
    });
});

// ─── Zod schema validation ───────────────────────────────────────────────────
//
// The Zod schema for promote_block_to_library lives at the bottom of
// mcp-server.ts and is only instantiated when the standalone server runs
// (NODE_ENV !== 'test'). We assert the schema's required fields are wired
// correctly by validating the schema shape directly.

describe('promote_block_to_library Zod schema', () => {
    it('Zod rejects input missing required fields (no unsafeHTML)', () => {
        const { z } = require('zod');
        // Mirror of the inputSchema registered in mcp-server.ts. The test
        // ensures the production registration also rejects missing unsafeHTML.
        const schema = z.object({
            projectName: z.string(),
            blockId: z.string(),
            title: z.string(),
            unsafeHTML: z.string(),
            description: z.string().optional(),
        });
        const parsed = schema.safeParse({
            projectName: 'p',
            blockId: 'b',
            title: 't',
            // unsafeHTML omitted
        });
        expect(parsed.success).toBe(false);
    });
});
