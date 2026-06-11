/**
 * MCP Server Tests — remove_block_from_library
 *
 * toolHandlers.removeBlockFromLibrary is the inverse of promoteBlockToLibrary:
 * it removes the block's component-definition.json entry, deletes the DA.live
 * doc page + sheet row (via DaLiveContentOperations.removeBlockFromLibrary),
 * then commits/pushes the removal via syncAndPublish and unpublishes the doc
 * page via helixApiClient.unpublishPage.
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

// Mock DaLiveContentOperations so we can assert on the teardown call.
const mockRemoveBlockFromLibrary = jest.fn();

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        removeBlockFromLibrary: mockRemoveBlockFromLibrary,
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

// Mock helixApiClient — captures unpublish.
const mockUnpublishPage = jest.fn();
const mockPreviewAndPublishPage = jest.fn();
jest.mock('@/features/eds/services/helixApiClient', () => ({
    previewAndPublishPage: (...args: unknown[]) => mockPreviewAndPublishPage(...args),
    unpublishPage: (...args: unknown[]) => mockUnpublishPage(...args),
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
    const compDef = {
        groups: [
            {
                id: 'blocks',
                title: 'Blocks',
                components: [
                    { id: BLOCK_ID, title: BLOCK_TITLE, plugins: { da: { unsafeHTML: BLOCK_HTML } } },
                ],
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
 * Set up the standard fs mocks: manifest read + component-definition.json read
 * + write. Pass `componentDef` to control the comp-def the handler reads.
 */
function mockFilesystem(opts: {
    componentDef?: Array<{ id: string; title: string; plugins?: { da?: { unsafeHTML?: string } } }>;
    includeStorefront?: boolean;
    includeDaLive?: boolean;
} = {}) {
    const { manifest, componentDefinition } = manifestWith(opts);
    const compDef = opts.componentDef
        ? { groups: [{ id: 'blocks', title: 'Blocks', components: opts.componentDef }] }
        : componentDefinition;

    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        const sp = String(p);
        if (sp.endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        if (sp.endsWith('component-definition.json')) {
            return Promise.resolve(JSON.stringify(compDef));
        }
        return Promise.reject(new Error(`Unexpected readFile: ${p}`));
    });

    (fsProm.stat as jest.Mock).mockResolvedValue({ size: 0 });
    (fsProm.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fsProm.mkdir as jest.Mock).mockResolvedValue(undefined);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const TOKENS = { daLiveToken: 'da-live-token', githubToken: 'github-token' };
const remove = (
    projectsDir: string, projectName: string, blockId: string,
): Promise<string> =>
    toolHandlers.removeBlockFromLibrary(projectsDir, projectName, blockId, TOKENS);

describe('toolHandlers.removeBlockFromLibrary', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        mockRemoveBlockFromLibrary.mockResolvedValue({ docPage: 'deleted', sheet: 'removed' });
        mockSyncAndPublish.mockResolvedValue({
            committed: true, pushed: true, helixPublished: true, summary: 'ok',
        });
        mockUnpublishPage.mockResolvedValue(true);
    });

    it('throws when projectName does not resolve (invalid name)', async () => {
        await expect(remove(PROJECTS_DIR, '../escape', BLOCK_ID)).rejects.toThrow(/invalid project name/i);
    });

    it('throws when no EDS storefront is configured', async () => {
        mockFilesystem({ includeStorefront: false });

        await expect(remove(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID)).rejects.toThrow(/no eds storefront configured/i);
    });

    it('happy path — comp-def removed, doc page deleted, sheet removed, unpublish success', async () => {
        mockFilesystem();

        const raw = await remove(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID);
        const result = JSON.parse(raw);

        // 1. comp-def rewritten WITHOUT the entry
        expect(fsProm.writeFile as jest.Mock).toHaveBeenCalledWith(
            expect.stringContaining('component-definition.json'),
            expect.any(String),
            'utf-8',
        );
        const writeCall = (fsProm.writeFile as jest.Mock).mock.calls.find(
            ([p]: [string]) => String(p).endsWith('component-definition.json'),
        );
        const writtenJson = JSON.parse(writeCall[1] as string);
        const entry = writtenJson.groups[0].components.find((c: { id: string }) => c.id === BLOCK_ID);
        expect(entry).toBeUndefined();
        expect(result.componentDefinition).toBe('removed');

        // 2. DA.live teardown
        expect(mockRemoveBlockFromLibrary).toHaveBeenCalledWith(
            DA_LIVE_ORG, DA_LIVE_SITE, { blockId: BLOCK_ID },
        );
        expect(result.docPage).toBe('deleted');
        expect(result.sheet).toBe('removed');

        // 3. Storefront removal commit/push
        expect(mockSyncAndPublish).toHaveBeenCalledWith(
            expect.objectContaining({
                storefrontPath: STOREFRONT_PATH,
                commitMessage: expect.stringContaining(BLOCK_ID),
            }),
        );
        // 4. Unpublish the doc page
        expect(mockUnpublishPage).toHaveBeenCalledWith(
            GITHUB_OWNER,
            GITHUB_SITE,
            `/.da/library/blocks/${BLOCK_ID}`,
            'main',
            // daLiveToken pre-resolved into the content-source-authorization header value.
            { githubToken: 'github-token', contentSourceAuthorization: 'Bearer da-live-token' },
        );
        expect(result.unpublish).toBe('success');
    });

    it('idempotent — block already absent → componentDefinition/docPage/sheet absent, no throw', async () => {
        mockFilesystem({ componentDef: [] }); // comp-def has no matching entry
        mockRemoveBlockFromLibrary.mockResolvedValue({ docPage: 'absent', sheet: 'absent' });

        const raw = await remove(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID);
        const result = JSON.parse(raw);

        expect(result.componentDefinition).toBe('absent');
        expect(result.docPage).toBe('absent');
        expect(result.sheet).toBe('absent');
        // comp-def write skipped because nothing changed
        const writeCall = (fsProm.writeFile as jest.Mock).mock.calls.find(
            ([p]: [string]) => String(p).endsWith('component-definition.json'),
        );
        expect(writeCall).toBeUndefined();
    });

    it('partial — unpublish throws → unpublish reported partial, teardown statuses real, no throw', async () => {
        mockFilesystem();
        mockUnpublishPage.mockRejectedValue(new Error('Helix admin 503'));

        const raw = await remove(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID);
        const result = JSON.parse(raw);

        expect(result.componentDefinition).toBe('removed');
        expect(result.docPage).toBe('deleted');
        expect(result.sheet).toBe('removed');
        expect(result.unpublish).toBe('partial');
    });

    it('failed — storefront push throws → unpublish reported failed, no throw', async () => {
        mockFilesystem();
        mockSyncAndPublish.mockRejectedValue(new Error('push rejected'));

        const raw = await remove(PROJECTS_DIR, PROJECT_NAME, BLOCK_ID);
        const result = JSON.parse(raw);

        expect(result.unpublish).toBe('failed');
        // Unpublish never attempted when the push failed.
        expect(mockUnpublishPage).not.toHaveBeenCalled();
    });
});

// ─── Credential source ───────────────────────────────────────────────────────

describe('remove_block_from_library — credential source', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRemoveBlockFromLibrary.mockResolvedValue({ docPage: 'deleted', sheet: 'removed' });
        mockSyncAndPublish.mockResolvedValue({ committed: true, pushed: true, helixPublished: true, summary: 'ok' });
        mockUnpublishPage.mockResolvedValue(true);
    });

    it('uses the injected DA.live + GitHub tokens', async () => {
        mockFilesystem();

        await toolHandlers.removeBlockFromLibrary(
            PROJECTS_DIR, PROJECT_NAME, BLOCK_ID,
            { daLiveToken: 'injected-da', githubToken: 'injected-gh' },
        );

        const tokenProvider = (DaLiveContentOperations as unknown as jest.Mock).mock.calls[0][0];
        await expect(tokenProvider.getAccessToken()).resolves.toBe('injected-da');
        expect(mockSyncAndPublish).toHaveBeenCalledWith(
            expect.objectContaining({ githubToken: 'injected-gh', daLiveToken: 'injected-da' }),
        );
    });

    it('throws when no DA.live token is supplied (user not signed in)', async () => {
        mockFilesystem();

        await expect(
            toolHandlers.removeBlockFromLibrary(
                PROJECTS_DIR, PROJECT_NAME, BLOCK_ID,
                { daLiveToken: null, githubToken: null },
            ),
        ).rejects.toThrow(/DA\.live token unavailable/i);
    });
});

// ─── Confirm gate ──────────────────────────────────────────────────────────

describe('remove_block_from_library — confirm gate (registerProjectTools)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRemoveBlockFromLibrary.mockResolvedValue({ docPage: 'deleted', sheet: 'removed' });
        mockSyncAndPublish.mockResolvedValue({ committed: true, pushed: true, helixPublished: true, summary: 'ok' });
        mockUnpublishPage.mockResolvedValue(true);
    });

    function registerAndGetHandler(): {
        handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }>;
        credentials: { getDaLiveToken: jest.Mock; getGitHubToken: jest.Mock };
    } {
        const credentials = {
            getDaLiveToken: jest.fn().mockResolvedValue('live-da'),
            getGitHubToken: jest.fn().mockResolvedValue('live-gh'),
        };
        const handlers = new Map<string, (args: unknown) => Promise<{ content: Array<{ text: string }> }>>();
        const server = {
            registerTool: (name: string, _s: unknown, h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>) =>
                handlers.set(name, h),
        };
        registerProjectTools(server, PROJECTS_DIR, credentials);
        return { handler: handlers.get('remove_block_from_library')!, credentials };
    }

    it('returns the destructive error and does NOT act when confirm is missing', async () => {
        mockFilesystem();
        const { handler, credentials } = registerAndGetHandler();

        const res = await handler({ projectName: PROJECT_NAME, blockId: BLOCK_ID });
        const parsed = JSON.parse(res.content[0].text);

        expect(parsed.destructive).toBe(true);
        expect(parsed.error).toMatch(/confirm:true/i);
        // No side effects — handler not invoked, no credentials resolved.
        expect(mockRemoveBlockFromLibrary).not.toHaveBeenCalled();
        expect(mockSyncAndPublish).not.toHaveBeenCalled();
        expect(credentials.getDaLiveToken).not.toHaveBeenCalled();
    });

    it('performs the removal and threads credentials when confirm:true', async () => {
        mockFilesystem();
        const { handler, credentials } = registerAndGetHandler();

        const res = await handler({ projectName: PROJECT_NAME, blockId: BLOCK_ID, confirm: true });
        const parsed = JSON.parse(res.content[0].text);

        expect(parsed.componentDefinition).toBe('removed');
        expect(credentials.getDaLiveToken).toHaveBeenCalled();
        expect(credentials.getGitHubToken).toHaveBeenCalled();
        const tokenProvider = (DaLiveContentOperations as unknown as jest.Mock).mock.calls[0][0];
        await expect(tokenProvider.getAccessToken()).resolves.toBe('live-da');
    });
});
