/**
 * Content-authoring tools — read/write/publish/list/delete a DA.live page, and
 * read it back off the CDN.
 *
 * The load-bearing assertions here are the PATH SPELLINGS: one page is
 * `about.html` to the DA source API, `/about` to Helix preview/publish, and
 * `/about.plain.html` on the CDN. Getting that wrong fails as a 404 at runtime,
 * not as a type error, so every tool asserts what it passed downstream.
 */

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(),
    getDaLiveAuthService: jest.fn(),
}));
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn(),
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getAccessToken: async () => 'da-token' })),
}));
jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn(),
}));
jest.mock('@/types/typeGuards', () => ({
    ...jest.requireActual('@/types/typeGuards'),
    isEdsProject: jest.fn(),
}));
jest.mock('@/features/ai/server/adobeTargetStore', () => ({
    getAdobeTarget: jest.fn(() => ({ orgId: 'org-stored' })),
    runWithAdobeTarget: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { registerContentAuthoringTools } from '@/features/ai/server/contentAuthoringTools';
import { COMPONENT_IDS } from '@/core/constants';
import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import { HelixService } from '@/features/eds/services/helixService';
import { isEdsProject } from '@/types/typeGuards';
import type { HandlerContext } from '@/types/handlers';

const getGitHubServicesMock = getGitHubServices as jest.Mock;
const getDaLiveAuthServiceMock = getDaLiveAuthService as jest.Mock;
const isEdsProjectMock = isEdsProject as unknown as jest.Mock;
const DaLiveContentOperationsMock = DaLiveContentOperations as unknown as jest.Mock;
const HelixServiceMock = HelixService as unknown as jest.Mock;

/** Minimal MCP server double: capture handlers, invoke by name, parse the JSON back. */
function fakeServer() {
    const tools = new Map<string, (args: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    return {
        registerTool(
            name: string,
            _def: unknown,
            handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }>,
        ) {
            tools.set(name, handler);
        },
        names: () => [...tools.keys()],
         
        async call(name: string, args: unknown = {}): Promise<any> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

const EDS_PROJECT = {
    name: 'bodea',
    path: '/p/bodea',
    componentInstances: {
        [COMPONENT_IDS.EDS_STOREFRONT]: {
            metadata: { githubRepo: 'skukla/bodea', daLiveOrg: 'skukla', daLiveSite: 'bodea' },
        },
    },
};

const getCurrentProject = jest.fn();
const ctxFactory = () =>
    ({
        stateManager: { getCurrentProject },
        context: { secrets: {} },
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() },
    }) as unknown as HandlerContext;

// ─── service doubles ─────────────────────────────────────────────────────────

let daOps: {
    listDirectory: jest.Mock;
    createSource: jest.Mock;
    deleteSource: jest.Mock;
};
let helix: {
    previewAndPublishPage: jest.Mock;
    unpublishPage: jest.Mock;
};
let fetchMock: jest.Mock;

const okResponse = (body: string, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => body,
});

function register() {
    const s = fakeServer();
    registerContentAuthoringTools(s, ctxFactory);
    return s;
}

beforeEach(() => {
    jest.clearAllMocks();

    getCurrentProject.mockResolvedValue(EDS_PROJECT);
    isEdsProjectMock.mockReturnValue(true);
    getGitHubServicesMock.mockReturnValue({
        tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
    });
    getDaLiveAuthServiceMock.mockReturnValue({
        isAuthenticated: jest.fn(async () => true),
        getAccessToken: jest.fn(async () => 'da-token'),
    });

    daOps = {
        listDirectory: jest.fn(async () => []),
        createSource: jest.fn(async () => ({ success: true, path: '/about.html' })),
        deleteSource: jest.fn(async () => ({ success: true })),
    };
    DaLiveContentOperationsMock.mockImplementation(() => daOps);

    helix = {
        previewAndPublishPage: jest.fn(async () => undefined),
        unpublishPage: jest.fn(async () => true),
    };
    HelixServiceMock.mockImplementation(() => helix);

    fetchMock = jest.fn(async () => okResponse('<body><main>hi</main></body>'));
    global.fetch = fetchMock as unknown as typeof fetch;
});

// ─── registration ────────────────────────────────────────────────────────────

describe('registerContentAuthoringTools', () => {
    it('registers exactly the six content tools', () => {
        expect(register().names().sort()).toEqual(
            [
                'delete_page',
                'list_content',
                'publish_page',
                'read_page',
                'read_published_page',
                'write_page',
            ].sort(),
        );
    });
});

// ─── shared guards ───────────────────────────────────────────────────────────

describe.each([
    ['read_page', { path: '/about' }],
    ['write_page', { path: '/about', content: '<p>x</p>' }],
    ['publish_page', { path: '/about' }],
    ['list_content', {}],
    ['delete_page', { path: '/about', confirm: true }],
])('%s guards', (tool, args) => {
    it('errors when no project is open', async () => {
        getCurrentProject.mockResolvedValueOnce(undefined);
        expect(await register().call(tool, args)).toMatchObject({
            error: expect.stringMatching(/No current project/i),
        });
    });

    it('errors for a non-EDS project', async () => {
        isEdsProjectMock.mockReturnValueOnce(false);
        expect(await register().call(tool, args)).toMatchObject({
            error: expect.stringMatching(/EDS/),
        });
    });

    it('hands off to DA.live auth when not signed in', async () => {
        getDaLiveAuthServiceMock.mockReturnValueOnce({
            isAuthenticated: jest.fn(async () => false),
            getAccessToken: jest.fn(async () => null),
        });
        expect(await register().call(tool, args)).toMatchObject({ needsAuth: 'dalive' });
    });
});

// ─── read_page ───────────────────────────────────────────────────────────────

describe('read_page', () => {
    it('GETs the DA source URL with the .html extension and the DA.live bearer', async () => {
        const res = await register().call('read_page', { path: '/about' });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://admin.da.live/source/skukla/bodea/about.html');
        expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
            'Bearer da-token',
        );
        expect(res).toMatchObject({ path: '/about', content: '<body><main>hi</main></body>' });
    });

    // The site root is a page too, and its source file is index.html.
    it('maps the site root to index.html', async () => {
        await register().call('read_page', { path: '/' });
        expect(fetchMock.mock.calls[0][0]).toBe('https://admin.da.live/source/skukla/bodea/index.html');
    });

    it('does not double-append .html when the caller already supplied it', async () => {
        await register().call('read_page', { path: '/about.html' });
        expect(fetchMock.mock.calls[0][0]).toBe('https://admin.da.live/source/skukla/bodea/about.html');
    });

    it('reports a 404 as a missing page rather than throwing', async () => {
        fetchMock.mockResolvedValueOnce(okResponse('', 404));
        expect(await register().call('read_page', { path: '/nope' })).toMatchObject({
            error: expect.stringMatching(/not found/i),
        });
    });

    it('requires a path', async () => {
        expect(await register().call('read_page', {})).toMatchObject({
            error: expect.stringMatching(/path is required/i),
        });
    });
});

// ─── write_page ──────────────────────────────────────────────────────────────

describe('write_page', () => {
    it('writes to the DA source path and does not publish by default', async () => {
        const res = await register().call('write_page', { path: '/about', content: '<p>x</p>' });

        expect(daOps.createSource).toHaveBeenCalledWith(
            'skukla',
            'bodea',
            'about.html',
            '<p>x</p>',
            { overwrite: true },
        );
        expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
        expect(res).toMatchObject({ written: true, published: false, path: '/about' });
    });

    // The DA source path carries .html; the Helix web path must NOT.
    it('publishes the WEB path, not the source path, when publish is true', async () => {
        const res = await register().call('write_page', {
            path: '/about',
            content: '<p>x</p>',
            publish: true,
        });

        expect(daOps.createSource).toHaveBeenCalledWith(
            'skukla',
            'bodea',
            'about.html',
            expect.any(String),
            expect.any(Object),
        );
        expect(helix.previewAndPublishPage).toHaveBeenCalledWith('skukla', 'bodea', '/about');
        expect(res).toMatchObject({ written: true, published: true });
    });

    it('does not publish when the write failed', async () => {
        daOps.createSource.mockResolvedValueOnce({ success: false, path: '/about.html', error: 'boom' });

        const res = await register().call('write_page', {
            path: '/about',
            content: '<p>x</p>',
            publish: true,
        });

        expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
        expect(res).toMatchObject({ written: false, error: 'boom' });
    });

    // A publish failure after a successful write must not read as a total failure —
    // the content IS in DA and a later publish_page will pick it up.
    it('reports a publish failure without losing the successful write', async () => {
        helix.previewAndPublishPage.mockRejectedValueOnce(new Error('401 admin'));

        const res = await register().call('write_page', {
            path: '/about',
            content: '<p>x</p>',
            publish: true,
        });

        expect(res).toMatchObject({
            written: true,
            published: false,
            publishError: expect.stringMatching(/401/),
        });
    });

    it('requires GitHub auth only when publishing', async () => {
        getGitHubServicesMock.mockReturnValue({
            tokenService: { validateToken: jest.fn(async () => ({ valid: false })) },
        });

        // Write alone: DA.live is enough.
        expect(
            await register().call('write_page', { path: '/a', content: 'x' }),
        ).toMatchObject({ written: true });

        // Publishing sends x-auth-token, so GitHub is required.
        expect(
            await register().call('write_page', { path: '/a', content: 'x', publish: true }),
        ).toMatchObject({ needsAuth: 'github' });
    });

    it('requires path and content', async () => {
        expect(await register().call('write_page', { path: '/a' })).toMatchObject({
            error: expect.stringMatching(/content is required/i),
        });
    });
});

// ─── publish_page ────────────────────────────────────────────────────────────

describe('publish_page', () => {
    it('previews and publishes the web path', async () => {
        const res = await register().call('publish_page', { path: '/products/shoes' });

        expect(helix.previewAndPublishPage).toHaveBeenCalledWith('skukla', 'bodea', '/products/shoes');
        expect(res).toMatchObject({ published: true, path: '/products/shoes' });
    });

    it('strips a .html suffix the caller supplied', async () => {
        await register().call('publish_page', { path: '/about.html' });
        expect(helix.previewAndPublishPage).toHaveBeenCalledWith('skukla', 'bodea', '/about');
    });

    it('reports the failure rather than throwing', async () => {
        helix.previewAndPublishPage.mockRejectedValueOnce(new Error('403 denied'));
        expect(await register().call('publish_page', { path: '/about' })).toMatchObject({
            published: false,
            error: expect.stringMatching(/403/),
        });
    });

    it('requires GitHub auth', async () => {
        getGitHubServicesMock.mockReturnValueOnce({
            tokenService: { validateToken: jest.fn(async () => ({ valid: false })) },
        });
        expect(await register().call('publish_page', { path: '/about' })).toMatchObject({
            needsAuth: 'github',
        });
    });
});

// ─── list_content ────────────────────────────────────────────────────────────

describe('list_content', () => {
    // DA.live prefixes every entry path with BOTH segments — `/{org}/{site}/…`.
    // Verified against a live listing of skukla/demo-builder-test, which returned
    // `/skukla/demo-builder-test/apparel`. An earlier fixture used a site-only
    // prefix, and the implementation that agreed with it shipped org-prefixed
    // paths no other tool here accepts. Keep these paths in the real shape.
    it('lists the site root by default and strips the full /org/site prefix', async () => {
        daOps.listDirectory.mockResolvedValueOnce([
            { name: 'about', path: '/skukla/bodea/about.html', ext: 'html' },
            { name: 'products', path: '/skukla/bodea/products' },
        ]);

        const res = await register().call('list_content', {});

        expect(daOps.listDirectory).toHaveBeenCalledWith('skukla', 'bodea', '/');
        expect(res.entries).toEqual([
            { name: 'about', type: 'page', path: '/about' },
            { name: 'products', type: 'folder', path: '/products' },
        ]);
    });

    it('strips the prefix for a nested path', async () => {
        daOps.listDirectory.mockResolvedValueOnce([
            { name: 'shoes', path: '/skukla/bodea/products/shoes.html', ext: 'html' },
        ]);

        const res = await register().call('list_content', { path: '/products' });

        expect(res.entries).toEqual([{ name: 'shoes', type: 'page', path: '/products/shoes' }]);
    });

    // A site whose DA name differs from the repo name must strip ITS org+site,
    // not the repo's — the two are independent metadata fields.
    it('leaves a path untouched when it carries no matching prefix', async () => {
        daOps.listDirectory.mockResolvedValueOnce([
            { name: 'stray', path: '/elsewhere/other/stray.html', ext: 'html' },
        ]);

        const res = await register().call('list_content', {});

        expect(res.entries).toEqual([
            { name: 'stray', type: 'page', path: '/elsewhere/other/stray' },
        ]);
    });

    it('lists a subdirectory when given one', async () => {
        await register().call('list_content', { path: '/products' });
        expect(daOps.listDirectory).toHaveBeenCalledWith('skukla', 'bodea', '/products');
    });

    // Non-HTML sources (block data, sheets) are real entries and must not be
    // mislabelled as pages — publishing a JSON as a page is a content-bus error.
    it('labels a non-html file as a file, not a page', async () => {
        daOps.listDirectory.mockResolvedValueOnce([
            { name: 'nav', path: '/skukla/bodea/data/nav.json', ext: 'json' },
        ]);

        const res = await register().call('list_content', { path: '/data' });

        expect(res.entries).toEqual([{ name: 'nav', type: 'file', path: '/data/nav.json' }]);
    });
});

// ─── delete_page ─────────────────────────────────────────────────────────────

describe('delete_page', () => {
    it('refuses without confirm:true and touches nothing', async () => {
        const res = await register().call('delete_page', { path: '/about' });

        expect(res).toMatchObject({ error: expect.stringMatching(/confirm/i) });
        expect(daOps.deleteSource).not.toHaveBeenCalled();
        expect(helix.unpublishPage).not.toHaveBeenCalled();
    });

    it('unpublishes the web path and deletes the source path', async () => {
        const res = await register().call('delete_page', { path: '/about', confirm: true });

        expect(helix.unpublishPage).toHaveBeenCalledWith('skukla', 'bodea', '/about');
        expect(daOps.deleteSource).toHaveBeenCalledWith('skukla', 'bodea', 'about.html');
        expect(res).toMatchObject({ deleted: true, unpublished: true, path: '/about' });
    });

    // Deleting the source first makes the unpublish fail with the documented
    // "delete not allowed while source exists" inverse — order is load-bearing.
    it('unpublishes BEFORE deleting the source', async () => {
        const order: string[] = [];
        helix.unpublishPage.mockImplementationOnce(async () => {
            order.push('unpublish');
            return true;
        });
        daOps.deleteSource.mockImplementationOnce(async () => {
            order.push('delete');
            return { success: true };
        });

        await register().call('delete_page', { path: '/about', confirm: true });

        expect(order).toEqual(['unpublish', 'delete']);
    });

    it('still deletes the source when the unpublish fails', async () => {
        helix.unpublishPage.mockRejectedValueOnce(new Error('already gone'));

        const res = await register().call('delete_page', { path: '/about', confirm: true });

        expect(daOps.deleteSource).toHaveBeenCalled();
        expect(res).toMatchObject({ deleted: true, unpublished: false });
    });
});

// ─── read_published_page ─────────────────────────────────────────────────────

describe('read_published_page', () => {
    it('fetches .plain.html from the live CDN', async () => {
        const res = await register().call('read_published_page', { path: '/about' });

        expect(fetchMock.mock.calls[0][0]).toBe('https://main--bodea--skukla.aem.live/about.plain.html');
        expect(res).toMatchObject({ path: '/about', status: 200 });
    });

    it('maps the site root to index.plain.html', async () => {
        await register().call('read_published_page', { path: '/' });
        expect(fetchMock.mock.calls[0][0]).toBe(
            'https://main--bodea--skukla.aem.live/index.plain.html',
        );
    });

    // The byte-size litmus tells a CDN rejection from a storefront 404, and an
    // agent cannot see response sizes any other way.
    it('reports status and byte size on a 404 so the failing layer is identifiable', async () => {
        fetchMock.mockResolvedValueOnce(okResponse('404 Not Found', 404));

        const res = await register().call('read_published_page', { path: '/nope' });

        expect(res).toMatchObject({ status: 404, bytes: 13, published: false });
    });

    it('needs no auth', async () => {
        getDaLiveAuthServiceMock.mockReturnValue({
            isAuthenticated: jest.fn(async () => false),
            getAccessToken: jest.fn(async () => null),
        });
        getGitHubServicesMock.mockReturnValue({
            tokenService: { validateToken: jest.fn(async () => ({ valid: false })) },
        });

        expect(await register().call('read_published_page', { path: '/about' })).toMatchObject({
            status: 200,
        });
    });

    // A JS string's .length is UTF-16 code units, so a page with any multi-byte
    // character under-reports. Caught live by diffing the tool against curl on a
    // real storefront 404: 5039 vs 5043. A field named "bytes" has to be bytes.
    it('counts BYTES, not characters, on a page with multi-byte content', async () => {
        // 3 ASCII + one 3-byte char + one 4-byte emoji = 3 + 3 + 4 = 10 bytes,
        // but only 3 + 1 + 2 = 6 UTF-16 code units.
        fetchMock.mockResolvedValueOnce(okResponse('abc€🎉', 404));

        const res = await register().call('read_published_page', { path: '/x' });

        expect(res.bytes).toBe(10);
    });
});
