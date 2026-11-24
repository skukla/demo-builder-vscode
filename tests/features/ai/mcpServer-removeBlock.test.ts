/**
 * MCP Server Tests — remove_block_from_library
 *
 * toolHandlers.removeBlockFromLibrary removes a block from the storefront. The
 * DA.live block list follows the storefront's code (EDS-71 step 5, owner
 * 2026-11-23: one rule, no hide list), so removing a block is deleting its code:
 * it deletes `blocks/<blockId>/` in the storefront checkout, deletes the DA.live
 * doc page + sheet row (via DaLiveContentOperations.blockLibOps.removeBlockFromLibrary),
 * then commits/pushes the deletion via syncAndPublish and unpublishes the doc
 * page via helixApiClient.unpublishPage. Restoring the code undoes it.
 *
 * Shared fs/child_process mocks live in mcpServer.testUtils.ts. DA.live and
 * Helix calls are mocked at the module boundary so the test does not exercise
 * real network I/O.
 */

import { DaLiveContentOperations } from '@/features/eds/services/daLive/daLiveContentOperations';
import {
    fsProm,
    path,
    toolHandlers,
    registerProjectTools,
    PROJECTS_DIR,
    PROJECT_NAME,
    STOREFRONT_PATH,
} from './mcpServer.testUtils';

// Mock DaLiveContentOperations so we can assert on the teardown call.
const mockRemoveBlockFromLibrary = jest.fn();

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        blockLibOps: { removeBlockFromLibrary: mockRemoveBlockFromLibrary },
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
        constructor(message: string) { super(message); this.name = 'PushRejectedError'; }
    },
}));

// Mock helixApiClient — captures unpublish.
const mockUnpublishPage = jest.fn();
const mockPreviewAndPublishPage = jest.fn();
jest.mock('@/features/eds/services/helix/helixApiClient', () => ({
    previewAndPublishPage: (...args: unknown[]) => mockPreviewAndPublishPage(...args),
    unpublishPage: (...args: unknown[]) => mockUnpublishPage(...args),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BLOCK_ID = 'promo-banner';
const BLOCK_DIR = path.join(STOREFRONT_PATH, 'blocks', BLOCK_ID);
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

const ENOENT = (): Error => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

/**
 * The standard fs mocks: the manifest read, and the block's code folder present
 * (`codeFolder: false` makes it already gone). Any other read rejects, as a
 * storefront on Adobe's current template has no component-definition.json.
 */
function mockFilesystem(opts: {
    includeStorefront?: boolean;
    includeDaLive?: boolean;
    codeFolder?: boolean;
} = {}) {
    const manifest = manifestWith(opts);
    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        if (String(p).endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        return Promise.reject(ENOENT());
    });
    (fsProm.lstat as jest.Mock).mockImplementation(() =>
        opts.codeFolder === false
            ? Promise.reject(ENOENT())
            : Promise.resolve({ isDirectory: () => true }),
    );
    (fsProm.rm as jest.Mock).mockResolvedValue(undefined);
    (fsProm.stat as jest.Mock).mockResolvedValue({ size: 0 });
}

const TOKENS = { daLiveToken: 'da-live-token', githubToken: 'github-token' };
const remove = (projectName: string, blockId: string): Promise<string> =>
    toolHandlers.removeBlockFromLibrary(PROJECTS_DIR, projectName, blockId, TOKENS);

function resetMocks(): void {
    jest.clearAllMocks();
    mockRemoveBlockFromLibrary.mockResolvedValue({ docPage: 'deleted', sheet: 'removed' });
    mockSyncAndPublish.mockResolvedValue({
        committed: true, pushed: true, helixPublished: true, summary: 'ok',
    });
    mockUnpublishPage.mockResolvedValue(true);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('toolHandlers.removeBlockFromLibrary', () => {
    beforeEach(resetMocks);

    it('throws when projectName does not resolve (invalid name)', async () => {
        await expect(remove('../escape', BLOCK_ID)).rejects.toThrow(/invalid project name/i);
    });

    it('throws when no EDS storefront is configured', async () => {
        mockFilesystem({ includeStorefront: false });

        await expect(remove(PROJECT_NAME, BLOCK_ID)).rejects.toThrow(/no eds storefront configured/i);
    });

    it('happy path — removes the page and row, then deletes the code folder, pushes, unpublishes', async () => {
        mockFilesystem();

        const result = JSON.parse(await remove(PROJECT_NAME, BLOCK_ID));

        // 1. The block's code folder, and only that folder, deleted
        expect(fsProm.rm).toHaveBeenCalledTimes(1);
        expect(fsProm.rm).toHaveBeenCalledWith(BLOCK_DIR, { recursive: true });
        // 2. DA.live teardown
        expect(mockRemoveBlockFromLibrary).toHaveBeenCalledWith(
            DA_LIVE_ORG, DA_LIVE_SITE, { blockId: BLOCK_ID },
        );
        // 3. The deletion committed and pushed
        expect(mockSyncAndPublish).toHaveBeenCalledWith(
            expect.objectContaining({
                storefrontPath: STOREFRONT_PATH,
                commitMessage: expect.stringContaining(BLOCK_ID),
            }),
        );
        // 4. The doc page unpublished
        expect(mockUnpublishPage).toHaveBeenCalledWith(
            GITHUB_OWNER,
            GITHUB_SITE,
            `/.da/library/blocks/${BLOCK_ID}`,
            'main',
            { githubToken: 'github-token', daLiveToken: 'da-live-token' },
        );
        expect(result).toEqual({
            codeFolder: 'deleted',
            docPage: 'deleted',
            sheet: 'removed',
            unpublish: 'success',
            details: expect.stringContaining(BLOCK_ID),
        });
    });

    // The code is gone before the push runs, so the commit carries the deletion.
    it('deletes the code folder before committing and pushing', async () => {
        mockFilesystem();

        await remove(PROJECT_NAME, BLOCK_ID);

        const rmOrder = (fsProm.rm as jest.Mock).mock.invocationCallOrder[0];
        const pushOrder = mockSyncAndPublish.mock.invocationCallOrder[0];
        expect(rmOrder).toBeLessThan(pushOrder);
    });

    it('never touches component-definition.json', async () => {
        mockFilesystem();

        await remove(PROJECT_NAME, BLOCK_ID);

        const touched = [
            ...(fsProm.readFile as jest.Mock).mock.calls,
            ...(fsProm.writeFile as jest.Mock).mock.calls,
        ].map(([p]) => String(p));
        expect(touched.filter((p) => p.includes('component-definition'))).toStrictEqual([]);
    });

    it('idempotent — a block already gone everywhere is absent, not a failure', async () => {
        mockFilesystem({ codeFolder: false });
        mockRemoveBlockFromLibrary.mockResolvedValue({ docPage: 'absent', sheet: 'absent' });

        const result = JSON.parse(await remove(PROJECT_NAME, BLOCK_ID));

        expect(result.codeFolder).toBe('absent');
        expect(result.docPage).toBe('absent');
        expect(result.sheet).toBe('absent');
        expect(fsProm.rm).not.toHaveBeenCalled();
    });

    it.each([
        ['a parent path', '..'],
        ['a nested path', 'promo/../../x'],
        ['an absolute path', '/etc'],
        ['a backslash path', 'promo\\..'],
        ['upper case', 'Promo-Banner'],
        ['an empty name', ''],
    ])('refuses %s as the block id, before changing anything', async (_label, blockId) => {
        mockFilesystem();

        await expect(remove(PROJECT_NAME, blockId)).rejects.toThrow(/not a block name/);

        expect(fsProm.rm).not.toHaveBeenCalled();
        expect(mockRemoveBlockFromLibrary).not.toHaveBeenCalled();
        expect(mockSyncAndPublish).not.toHaveBeenCalled();
    });

    // DA.live goes first: its failures (an expired sign-in, a sheet that cannot be read or
    // rewritten) throw before the code is touched, so the code is never left deleted and
    // unpushed with the block still in the list.
    it('removes the page and row before deleting the code', async () => {
        mockFilesystem();

        await remove(PROJECT_NAME, BLOCK_ID);

        const daLiveOrder = mockRemoveBlockFromLibrary.mock.invocationCallOrder[0];
        const rmOrder = (fsProm.rm as jest.Mock).mock.invocationCallOrder[0];
        expect(daLiveOrder).toBeLessThan(rmOrder);
    });

    it.each([
        ['an expired sign-in', new Error('Authentication expired. Please log in again.')],
        ['a sheet that cannot be rewritten', new Error('Failed to rewrite block library sheet: 500')],
    ])('throws on %s from DA.live, with the code untouched', async (_label, error) => {
        mockFilesystem();
        mockRemoveBlockFromLibrary.mockRejectedValue(error);

        await expect(remove(PROJECT_NAME, BLOCK_ID)).rejects.toThrow(error.message);

        expect(fsProm.rm).not.toHaveBeenCalled();
        expect(mockSyncAndPublish).not.toHaveBeenCalled();
    });

    // Once DA.live has changed, a failure is reported, not thrown away. The code staying is
    // self-healing: the next Refresh Blocks lists the block again from it.
    it('reports a code folder that cannot be deleted, after DA.live changed, without throwing', async () => {
        mockFilesystem();
        (fsProm.rm as jest.Mock).mockRejectedValue(
            Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
        );

        const result = JSON.parse(await remove(PROJECT_NAME, BLOCK_ID));

        expect(result).toMatchObject({
            codeFolder: 'failed',
            docPage: 'deleted',
            sheet: 'removed',
            unpublish: 'success',
        });
        expect(result.note).toMatch(/EACCES/);
        expect(result.note).toMatch(/Refresh Blocks lists it again/);
    });

    it('partial — unpublish throws → unpublish reported partial, teardown statuses real, no throw', async () => {
        mockFilesystem();
        mockUnpublishPage.mockRejectedValue(new Error('Helix admin 503'));

        const result = JSON.parse(await remove(PROJECT_NAME, BLOCK_ID));

        expect(result.codeFolder).toBe('deleted');
        expect(result.docPage).toBe('deleted');
        expect(result.sheet).toBe('removed');
        expect(result.unpublish).toBe('partial');
    });

    it('failed — storefront push throws → unpublish reported failed, no throw', async () => {
        mockFilesystem();
        mockSyncAndPublish.mockRejectedValue(new Error('push rejected'));

        const result = JSON.parse(await remove(PROJECT_NAME, BLOCK_ID));

        expect(result.unpublish).toBe('failed');
        // Unpublish never attempted when the push failed.
        expect(mockUnpublishPage).not.toHaveBeenCalled();
    });
});

// ─── Credential source ───────────────────────────────────────────────────────

describe('remove_block_from_library — credential source', () => {
    beforeEach(resetMocks);

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

    it('answers with a sign-in marker when DA.live is not signed in, and deletes nothing', async () => {
        // Was a throw until 2026-09-01. A missing credential is the caller's
        // normal state, not an exception — and an MCP error is not something an
        // agent can branch on. `needsAuth` says which sign-in to offer, in a
        // field rather than a sentence. The code must survive the refusal: a
        // block whose code went with no DA.live teardown would leave its page.
        mockFilesystem();

        const raw = await toolHandlers.removeBlockFromLibrary(
            PROJECTS_DIR, PROJECT_NAME, BLOCK_ID,
            { daLiveToken: null, githubToken: null },
        );

        expect(JSON.parse(raw)).toEqual({
            error: expect.stringContaining('sign_in(provider:"dalive"'),
            needsAuth: 'dalive',
        });
        expect(fsProm.rm).not.toHaveBeenCalled();
    });
});

// ─── Confirm gate ──────────────────────────────────────────────────────────

describe('remove_block_from_library — confirm gate (registerProjectTools)', () => {
    beforeEach(resetMocks);

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
        expect(parsed.error).toMatch(/deletes the block's code/);
        // No side effects — handler not invoked, no credentials resolved.
        expect(fsProm.rm).not.toHaveBeenCalled();
        expect(mockRemoveBlockFromLibrary).not.toHaveBeenCalled();
        expect(mockSyncAndPublish).not.toHaveBeenCalled();
        expect(credentials.getDaLiveToken).not.toHaveBeenCalled();
    });

    it('performs the removal and threads credentials when confirm:true', async () => {
        mockFilesystem();
        const { handler, credentials } = registerAndGetHandler();

        const res = await handler({ projectName: PROJECT_NAME, blockId: BLOCK_ID, confirm: true });
        const parsed = JSON.parse(res.content[0].text);

        expect(parsed.codeFolder).toBe('deleted');
        expect(credentials.getDaLiveToken).toHaveBeenCalled();
        expect(credentials.getGitHubToken).toHaveBeenCalled();
        const tokenProvider = (DaLiveContentOperations as unknown as jest.Mock).mock.calls[0][0];
        await expect(tokenProvider.getAccessToken()).resolves.toBe('live-da');
    });
});
