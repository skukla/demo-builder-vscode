/**
 * MCP Server Tests — promote_block_to_library
 *
 * toolHandlers.promoteBlockToLibrary gives a block in the storefront's code its
 * example and title in the DA.live block list: writes the DA.live doc page,
 * adds or renames the block's sheet row, then commits/pushes/publishes via
 * syncAndPublish and previewAndPublishPage. It does not read or write the
 * storefront's `component-definition.json`: the block list follows the code
 * (EDS-71 step 5), and Adobe's current template has no such file.
 *
 * Shared fs/child_process mocks live in mcpServer.testUtils.ts. DA.live and
 * Helix calls are mocked at the module boundary so the test does not exercise
 * real network I/O.
 */

import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
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

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        blockLibOps: {
            appendBlockToLibrary: mockAppendBlockToLibrary,
            upsertBlockDocPage: mockUpsertBlockDocPage,
        },
    })),
}));
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest.fn(),
    createDaLiveTokenProvider: jest.fn(),
}));

// Mock storefrontSyncService — captures commit/push.
const mockSyncAndPublish = jest.fn();
jest.mock('@/features/eds/services/storefront/storefrontSyncService', () => ({
    syncAndPublish: (...args: unknown[]) => mockSyncAndPublish(...args),
    PushRejectedError: class PushRejectedError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'PushRejectedError';
        }
    },
}));

// Mock helixApiClient.previewAndPublishPage.
const mockPreviewAndPublishPage = jest.fn();
jest.mock('@/features/eds/services/helix/helixApiClient', () => ({
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

function manifestWith(opts: { includeStorefront?: boolean; includeDaLive?: boolean } = {}) {
    const { includeStorefront = true, includeDaLive = true } = opts;
    return {
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
    };
}

/**
 * Set up the standard fs mocks for a successful happy-path run:
 *   - manifest read (.demo-builder.json); any other read rejects, as a storefront
 *     on Adobe's current template has no component-definition.json
 *   - stat() on blocks/<blockId>/ resolves (block source exists)
 *   - stat() on .git resolves
 *
 * Pass `blockDirExists: false` to make the block source stat() reject.
 */
function mockHappyPathFilesystem(
    opts: { blockDirExists?: boolean; includeStorefront?: boolean; includeDaLive?: boolean } = {}
) {
    const { blockDirExists = true } = opts;
    const manifest = manifestWith(opts);

    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        const sp = String(p);
        if (sp.endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        return Promise.reject(Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' }));
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
    projectsDir: string,
    projectName: string,
    blockId: string,
    title: string,
    unsafeHTML: string
): Promise<string> =>
    toolHandlers.promoteBlockToLibrary(projectsDir, projectName, blockId, title, unsafeHTML, TOKENS);

describe('toolHandlers.promoteBlockToLibrary', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        mockAppendBlockToLibrary.mockResolvedValue({
            status: 'created',
            siteConfigRegistered: true,
        });
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
            promote(PROJECTS_DIR, '../escape', BLOCK_ID, BLOCK_TITLE, BLOCK_HTML)
        ).rejects.toThrow(/invalid project name/i);
    });

    it('throws when no EDS storefront is configured', async () => {
        mockHappyPathFilesystem({ includeStorefront: false });

        await expect(
            promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, BLOCK_HTML)
        ).rejects.toThrow(/no eds storefront configured/i);
    });

    it('throws when block source directory is missing', async () => {
        mockHappyPathFilesystem({ blockDirExists: false });

        await expect(
            promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, BLOCK_HTML)
        ).rejects.toThrow(/block source not found/i);
    });

    // The one block-name rule the list builder, remove and the index use: a folder named any
    // other way is never listed, so promoting it would give an example nobody can place.
    it.each(['Promo_Banner', 'promo-', '../promo'])(
        'refuses %s as the block id, before writing anything',
        async (blockId) => {
            mockHappyPathFilesystem();

            await expect(
                promote(PROJECTS_DIR, PROJECT_NAME, blockId, BLOCK_TITLE, BLOCK_HTML)
            ).rejects.toThrow(/not a block name/);
            expect(mockUpsertBlockDocPage).not.toHaveBeenCalled();
        }
    );

    it('happy path — writes the doc page, adds the sheet row, publishes', async () => {
        mockHappyPathFilesystem();

        const raw = await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, BLOCK_HTML);
        const result = JSON.parse(raw);

        // 1. DA.live doc page written via upsertBlockDocPage (overwrite-always
        // semantics — supports AI iteration on variant HTML)
        expect(mockUpsertBlockDocPage).toHaveBeenCalledWith(DA_LIVE_ORG, DA_LIVE_SITE, {
            id: BLOCK_ID,
            exampleHtml: BLOCK_HTML,
        });

        // 2. Sheet row added under the agent's title
        expect(mockAppendBlockToLibrary).toHaveBeenCalledWith(DA_LIVE_ORG, DA_LIVE_SITE, {
            blockId: BLOCK_ID,
            title: BLOCK_TITLE,
        });

        // 3. Storefront sync + Helix publish
        expect(mockSyncAndPublish).toHaveBeenCalledWith(
            expect.objectContaining({
                storefrontPath: STOREFRONT_PATH,
                commitMessage: expect.stringContaining(BLOCK_ID),
            })
        );
        expect(mockPreviewAndPublishPage).toHaveBeenCalled();

        expect(result).toEqual({
            docPage: 'written',
            sheet: 'created',
            publish: 'success',
            details: `Block "${BLOCK_TITLE}" (${BLOCK_ID}) promoted to ${DA_LIVE_ORG}/${DA_LIVE_SITE}`,
        });
    });

    // Adobe deleted component-definition.json from its templates. The block list
    // follows the code now, so promote neither needs the file nor writes one.
    it('never reads or writes component-definition.json', async () => {
        mockHappyPathFilesystem();

        await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, BLOCK_HTML);

        const touched = [
            ...(fsProm.readFile as jest.Mock).mock.calls,
            ...(fsProm.writeFile as jest.Mock).mock.calls,
        ].map(([p]) => String(p));
        expect(touched.filter((p) => p.includes('component-definition'))).toStrictEqual([]);
    });

    it('reports a renamed row when the block was already listed under another title', async () => {
        mockHappyPathFilesystem();
        mockAppendBlockToLibrary.mockResolvedValue({ status: 'renamed', siteConfigRegistered: true });

        const result = JSON.parse(
            await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, BLOCK_HTML)
        );

        expect(result.sheet).toBe('renamed');
    });

    it('idempotent re-call — doc page overwrites, sheet returns skipped-duplicate', async () => {
        mockHappyPathFilesystem();
        mockAppendBlockToLibrary.mockResolvedValue({
            status: 'skipped-duplicate',
            siteConfigRegistered: true,
        });

        const raw = await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, BLOCK_HTML);
        const result = JSON.parse(raw);

        expect(result.sheet).toBe('skipped-duplicate');
        // Doc page still gets re-written (overwriting silently is the idempotency contract)
        expect(mockUpsertBlockDocPage).toHaveBeenCalled();
    });

    it('partial success — publish fails → publish: "failed" but doc + sheet statuses are real', async () => {
        mockHappyPathFilesystem();
        mockSyncAndPublish.mockRejectedValue(new Error('Helix admin 503'));

        const raw = await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, BLOCK_HTML);
        const result = JSON.parse(raw);

        expect(result.docPage).toBe('written');
        expect(result.sheet).toBe('created');
        // Publish failed, but did NOT throw
        expect(result.publish).toBe('failed');
    });

    it('sanitizer strips <script> tags before writing the doc page', async () => {
        mockHappyPathFilesystem();

        const malicious = '<div class="x">hi</div><script>alert("xss")</script>';

        await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, malicious);

        const docCall = mockUpsertBlockDocPage.mock.calls[0];
        expect(docCall[2].exampleHtml).not.toContain('<script>');
        expect(docCall[2].exampleHtml).not.toContain('alert');
    });

    it('sanitizer strips event handlers and javascript: URLs', async () => {
        mockHappyPathFilesystem();

        const malicious =
            '<a href="javascript:alert(1)" onclick="alert(2)">click</a>' +
            '<img src="x" onerror="fetch(\'/steal\')">';

        await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, malicious);

        const docCall = mockUpsertBlockDocPage.mock.calls[0];
        const cleaned = docCall[2].exampleHtml as string;
        expect(cleaned).not.toMatch(/javascript:/i);
        expect(cleaned).not.toMatch(/onclick=/i);
        expect(cleaned).not.toMatch(/onerror=/i);
    });

    it('sanitizer strips <iframe> and other framing tags', async () => {
        mockHappyPathFilesystem();

        const malicious =
            '<iframe src="https://evil.example"></iframe>' +
            '<object data="javascript:alert(1)"></object>' +
            '<embed src="x.swf">';

        await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, malicious);

        const cleaned = mockUpsertBlockDocPage.mock.calls[0][2].exampleHtml as string;
        expect(cleaned).not.toContain('<iframe');
        expect(cleaned).not.toContain('<object');
        expect(cleaned).not.toContain('<embed');
    });

    it('sanitizer strips data:, vbscript:, and protocol-relative URL schemes', async () => {
        mockHappyPathFilesystem();

        const malicious =
            '<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+">' +
            '<a href="vbscript:msgbox(1)">click</a>' +
            '<a href="//evil.example/x.js">click</a>';

        await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, malicious);

        const cleaned = mockUpsertBlockDocPage.mock.calls[0][2].exampleHtml as string;
        expect(cleaned).not.toMatch(/^data:/im);
        expect(cleaned).not.toContain('data:image/svg');
        expect(cleaned).not.toMatch(/vbscript:/i);
        expect(cleaned).not.toContain('//evil.example');
    });

    it('sanitizer strips <style> tags', async () => {
        mockHappyPathFilesystem();

        const malicious =
            '<div>hi</div><style>body { background: url(javascript:alert(1)); }</style>';

        await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, malicious);

        const cleaned = mockUpsertBlockDocPage.mock.calls[0][2].exampleHtml as string;
        expect(cleaned).not.toContain('<style');
        expect(cleaned).not.toContain('javascript:');
    });

    it('sanitizer does not rewrite the title argument (only unsafeHTML is sanitized)', async () => {
        mockHappyPathFilesystem();

        // Title contains markup-like content; this must reach appendBlockToLibrary verbatim.
        const ornateTitle = 'Promo <Banner>';
        await promote(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            ornateTitle,
            '<div class="x">hi</div><script>alert(1)</script>'
        );

        expect(mockAppendBlockToLibrary).toHaveBeenCalledWith(DA_LIVE_ORG, DA_LIVE_SITE, {
            blockId: BLOCK_ID,
            title: ornateTitle,
        });
    });

    it('sanitizer preserves legitimate EDS block HTML (div + class + img)', async () => {
        mockHappyPathFilesystem();

        const legitimate =
            '<div class="hero-cta">' +
            '<h1>Welcome</h1>' +
            '<p>Shop now</p>' +
            '<img src="https://example.com/hero.jpg" alt="Hero" />' +
            '<a href="/sale">View sale</a>' +
            '</div>';

        await promote(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID, BLOCK_TITLE, legitimate);

        const cleaned = mockUpsertBlockDocPage.mock.calls[0][2].exampleHtml as string;
        expect(cleaned).toContain('class="hero-cta"');
        expect(cleaned).toContain('<h1>Welcome</h1>');
        expect(cleaned).toContain('alt="Hero"');
        expect(cleaned).toContain('href="/sale"');
    });

    it('description string mirrors sync-changes.md phrasing', () => {
        // The tool's MCP description registration is exercised when the
        // standalone server starts (NODE_ENV !== 'test'). We assert the
        // load-bearing text directly from the source via the un-mocked fs
        // module (jest.requireActual — `fs/promises` is mocked globally by
        // mcpServer.testUtils.ts).
        const realFs = jest.requireActual('fs');
        const realPath = jest.requireActual('path');
        const srcPath = realPath.resolve(__dirname, '../../../src/mcp-server.ts');
        const src = realFs.readFileSync(srcPath, 'utf-8');
        expect(src).toContain('promote_block_to_library');
        // Must say "this site's own DA.live block library" — the canonical
        // phrasing in the generated sync-changes.md skill, so the tool description
        // and the skill describe the operation the same way. And neither may claim
        // the block is saved for reuse: it was "push back to source library" until
        // 2026-10-13, which read as exactly that.
        expect(src).toMatch(/this site's own DA\.live block library/);
        const skill = realFs.readFileSync(
            realPath.resolve(__dirname, '../../../src/features/project-creation/templates/skills/sync-changes.md'),
            'utf-8',
        );
        expect(skill).toMatch(/this site's own DA\.live block library/);
        expect(src + skill).not.toMatch(/push back to source library/);
    });
});

// ─── Credential source ───────────────────────────────────────────────────────
// Regression coverage for the token seam: promote no longer reads
// DA_LIVE_IMS_TOKEN from env (nothing populates it now the standalone process
// is retired) — tokens are injected, resolved from the live sign-in session.

describe('promote_block_to_library — credential source', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAppendBlockToLibrary.mockResolvedValue({
            status: 'created',
            siteConfigRegistered: true,
        });
        mockUpsertBlockDocPage.mockResolvedValue('written');
        mockSyncAndPublish.mockResolvedValue({
            committed: true,
            pushed: true,
            helixPublished: true,
            summary: 'ok',
        });
        mockPreviewAndPublishPage.mockResolvedValue(undefined);
    });

    it('uses the injected DA.live + GitHub tokens', async () => {
        mockHappyPathFilesystem();

        await toolHandlers.promoteBlockToLibrary(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            BLOCK_HTML,
            { daLiveToken: 'injected-da', githubToken: 'injected-gh' }
        );

        // DA.live ops constructed with a provider yielding the injected token.
        const tokenProvider = (DaLiveContentOperations as unknown as jest.Mock).mock.calls[0][0];
        await expect(tokenProvider.getAccessToken()).resolves.toBe('injected-da');
        // Both tokens flow through to the storefront commit/publish step.
        expect(mockSyncAndPublish).toHaveBeenCalledWith(
            expect.objectContaining({ githubToken: 'injected-gh', daLiveToken: 'injected-da' })
        );
    });

    it('answers with a sign-in marker when DA.live is not signed in, and writes nothing', async () => {
        /**
         * Two behaviours, one cause, both changed on 2026-09-01.
         *
         * It used to THROW — an MCP error the caller cannot branch on, for the
         * most ordinary state an agent is in. And the check ran AFTER the first
         * write, so a signed-out caller got the error with the storefront
         * already changed on disk: a half-done promotion nobody asked for and
         * nothing would finish.
         *
         * The write assertions are the load-bearing ones. A rejected promise
         * says nothing about what happened before it.
         */
        mockHappyPathFilesystem();

        const raw = await toolHandlers.promoteBlockToLibrary(
            PROJECTS_DIR,
            PROJECT_NAME,
            BLOCK_ID,
            BLOCK_TITLE,
            BLOCK_HTML,
            { daLiveToken: null, githubToken: null }
        );

        expect(JSON.parse(raw)).toEqual({
            error: expect.stringContaining('sign_in(provider:"dalive"'),
            needsAuth: 'dalive',
        });
        expect(fsProm.writeFile as jest.Mock).not.toHaveBeenCalled();
        expect(mockUpsertBlockDocPage).not.toHaveBeenCalled();
        expect(mockSyncAndPublish).not.toHaveBeenCalled();
    });

    /** Register the real tools against a stub server and hand back the promote tool. */
    function registerPromoteTool() {
        mockHappyPathFilesystem();
        const credentials = {
            getDaLiveToken: jest.fn().mockResolvedValue('live-da'),
            getGitHubToken: jest.fn().mockResolvedValue('live-gh'),
        };
        const handlers = new Map<string, (args: unknown) => Promise<unknown>>();
        registerProjectTools(
            {
                registerTool: (name: string, _s: unknown, h: (a: unknown) => Promise<unknown>) =>
                    handlers.set(name, h),
            },
            PROJECTS_DIR,
            credentials
        );
        return { credentials, promote: handlers.get('promote_block_to_library')! };
    }

    const PROMOTE_ARGS = {
        projectName: PROJECT_NAME,
        blockId: BLOCK_ID,
        title: BLOCK_TITLE,
        unsafeHTML: BLOCK_HTML,
    };

    it('registerProjectTools threads the credential provider into the promote tool', async () => {
        const { credentials, promote } = registerPromoteTool();

        await promote({ ...PROMOTE_ARGS, confirm: true });

        expect(credentials.getDaLiveToken).toHaveBeenCalled();
        expect(credentials.getGitHubToken).toHaveBeenCalled();
        const tokenProvider = (DaLiveContentOperations as unknown as jest.Mock).mock.calls[0][0];
        await expect(tokenProvider.getAccessToken()).resolves.toBe('live-da');
        expect(mockSyncAndPublish).toHaveBeenCalledWith(
            expect.objectContaining({ githubToken: 'live-gh', daLiveToken: 'live-da' })
        );
    });

    // The gate matches remove_block_from_library's. Promote commits, pushes and
    // publishes to a live site, so "it only adds things" does not make it safe.
    it('refuses without confirm:true, and does nothing at all', async () => {
        const { credentials, promote } = registerPromoteTool();

        const res = (await promote(PROMOTE_ARGS)) as { content: { text: string }[] };

        expect(JSON.parse(res.content[0].text)).toMatchObject({ destructive: true });
        // Not merely "returned an error" — no credential was fetched and nothing
        // was written or published.
        expect(credentials.getDaLiveToken).not.toHaveBeenCalled();
        expect(credentials.getGitHubToken).not.toHaveBeenCalled();
        expect(mockSyncAndPublish).not.toHaveBeenCalled();
        expect(mockUpsertBlockDocPage).not.toHaveBeenCalled();
        expect(mockAppendBlockToLibrary).not.toHaveBeenCalled();
    });
});
