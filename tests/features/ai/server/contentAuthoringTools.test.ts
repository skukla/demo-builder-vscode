/**
 * Content-authoring tools — read/write/publish/list/delete a DA.live page, and
 * read it back off the CDN.
 *
 * The load-bearing assertions here are the PATH SPELLINGS: one page is
 * `about.html` to the DA source API, `/about` to Helix preview/publish, and
 * `/about.plain.html` on the CDN. Getting that wrong fails as a 404 at runtime,
 * not as a type error, so every tool asserts what it passed downstream.
 */

import type { HelixService } from '@/features/eds/services/helix/helixService';
import {
    DaLiveContentOperationsMock,
    HelixServiceMock,
    getCurrentProject,
    getDaLiveAuthServiceMock,
    getGitHubServicesMock,
    isEdsProjectMock,
    registerContentAuthoringTools,
    fakeServer,
} from './contentAuthoringTools.testUtils';
import { COMPONENT_IDS } from '@/core/constants';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

// `selectedStack` must start with "eds-": the module now uses the shared
// getEdsRepoParts/getEdsDaLiveTarget getters, whose INTERNAL isEdsProject call
// resolves to the real implementation even though the SUT's own call is mocked.
// Mocking the getters instead would stop testing the coordinate extraction.
const EDS_PROJECT = {
    name: 'bodea',
    path: '/p/bodea',
    selectedStack: 'eds-commerce',
    componentInstances: {
        [COMPONENT_IDS.EDS_STOREFRONT]: {
            metadata: { githubRepo: 'skukla/bodea', daLiveOrg: 'skukla', daLiveSite: 'bodea' },
        },
    },
};

const ctxFactory = () =>
    createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject }),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
        logger: createMockLogger(),
    });

// ─── service doubles ─────────────────────────────────────────────────────────

let daOps: {
    listDirectory: jest.Mock;
    createSource: jest.Mock;
    deleteSource: jest.Mock;
    readSource: jest.Mock;
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
    registerContentAuthoringTools(s, ctxFactory, HelixServiceMock);
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
        readSource: jest.fn(async () => ({
            status: 200,
            body: '<body><main>hi</main></body>',
            bytes: 28,
            truncated: false,
        })),
    };
    DaLiveContentOperationsMock.mockImplementation(() => daOps);

    helix = {
        previewAndPublishPage: jest.fn(async () => undefined),
        unpublishPage: jest.fn(async () => true),
    };
    // The fake is partial by design — these two methods are all these tools call.
    // Cast at the boundary, once, per ADR-016: the builder still answers the real type.
    HelixServiceMock.mockImplementation(() => helix as unknown as HelixService);

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
            ].sort()
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

// ─── path containment (the control the whole module rests on) ────────────────

// These tools expose no org/site arguments SPECIFICALLY so an agent cannot reach
// another site. A `..` segment defeats that entirely: the URL parser collapses
// it, so /source/skukla/bodea/../../victim/site/index.html resolves to
// /source/victim/site/index.html and is sent with the user's DA.live bearer.
// Verified by execution 2026-08-16, and missed by the first version of this suite.
describe('path containment', () => {
    const ESCAPES = [
        '../../victimorg/victimsite/index.html',
        '/../../victimorg/victimsite/index',
        '/products/../../../other/site/page',
        '/./../../elsewhere',
        '/%2e%2e/%2e%2e/victim/site', // percent-encoded traversal
        'https://evil.example/page', // absolute URL
        '//evil.example/page', // protocol-relative
        '\\..\\..\\victim', // backslash separators
    ];

    it.each(ESCAPES)('read_page refuses %s and makes no request', async (bad) => {
        const res = await register().call('read_page', { path: bad });
        expect(res.error).toMatch(/simple page path/i);
        expect(daOps.listDirectory).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(ESCAPES)('write_page refuses %s and writes nothing', async (bad) => {
        const res = await register().call('write_page', { path: bad, content: '<p>x</p>' });
        expect(res.error).toMatch(/simple page path/i);
        expect(daOps.createSource).not.toHaveBeenCalled();
    });

    it.each(ESCAPES)('publish_page refuses %s and publishes nothing', async (bad) => {
        const res = await register().call('publish_page', { path: bad });
        expect(res.error).toMatch(/simple page path/i);
        expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
    });

    it.each(ESCAPES)('delete_page refuses %s before the confirm gate', async (bad) => {
        const res = await register().call('delete_page', { path: bad, confirm: true });
        expect(res.error).toMatch(/simple page path/i);
        expect(helix.unpublishPage).not.toHaveBeenCalled();
        expect(daOps.deleteSource).not.toHaveBeenCalled();
    });

    // list_content took its directory straight into the /list/{org}/{site}/ URL
    // with no guard at all — a read is not exempt.
    it.each(ESCAPES)('list_content refuses %s', async (bad) => {
        const res = await register().call('list_content', { path: bad });
        expect(res.error).toMatch(/simple page path/i);
        expect(daOps.listDirectory).not.toHaveBeenCalled();
    });

    it('still accepts ordinary paths, including a legitimate dot in a filename', async () => {
        expect(await register().call('read_page', { path: '/about' })).not.toHaveProperty('error');
        expect(await register().call('list_content', { path: '/products' })).not.toHaveProperty(
            'error'
        );
    });
});

// ─── coordinate validation (SSRF) ────────────────────────────────────────────

describe('storefront coordinate validation', () => {
    // .demo-builder.json is writable through update_project_config, which
    // validates content only for .env, and getCurrentProject() re-reads it from
    // disk on every call — so a tampered value takes effect on the next call.
    // `a@internal.example?/b` would otherwise yield
    // https://main--b--a@internal.example?.aem.live → host internal.example.
    it.each([
        ['a@internal.example?/b', 'userinfo/host injection'],
        ['../../x/y', 'traversal'],
        ['a b/c', 'space'],
        ['a/b#frag', 'fragment'],
    ])('refuses githubRepo %s (%s)', async (githubRepo) => {
        getCurrentProject.mockResolvedValue({
            ...EDS_PROJECT,
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: { metadata: { githubRepo } },
            },
        });

        const res = await register().call('read_published_page', { path: '/about' });

        expect(res.error).toMatch(/metadata/i);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses a malformed daLiveOrg even when the repo is fine', async () => {
        getCurrentProject.mockResolvedValue({
            ...EDS_PROJECT,
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: {
                    metadata: { githubRepo: 'skukla/bodea', daLiveOrg: '../evil', daLiveSite: 'x' },
                },
            },
        });

        expect(await register().call('read_page', { path: '/about' })).toMatchObject({
            error: expect.stringMatching(/metadata/i),
        });
    });
});

// ─── read_page ───────────────────────────────────────────────────────────────

describe('read_page', () => {
    // Goes through the service rather than a hand-rolled fetch, so it inherits
    // the retry/429 handling, the timeout and the size cap. `sourceExists` was
    // already making this exact GET.
    it('reads through DaLiveContentOperations with the .html source path', async () => {
        const res = await register().call('read_page', { path: '/about' });

        expect(daOps.readSource).toHaveBeenCalledWith('skukla', 'bodea', 'about.html');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(res).toMatchObject({ path: '/about', content: '<body><main>hi</main></body>' });
    });

    // The site root is a page too, and its source file is index.html.
    it('maps the site root to index.html', async () => {
        await register().call('read_page', { path: '/' });
        expect(daOps.readSource).toHaveBeenCalledWith('skukla', 'bodea', 'index.html');
    });

    it('does not double-append .html when the caller already supplied it', async () => {
        await register().call('read_page', { path: '/about.html' });
        expect(daOps.readSource).toHaveBeenCalledWith('skukla', 'bodea', 'about.html');
    });

    it('reports a 404 as a missing page rather than throwing', async () => {
        daOps.readSource.mockResolvedValueOnce({
            status: 404,
            body: '',
            bytes: 0,
            truncated: false,
        });
        expect(await register().call('read_page', { path: '/nope' })).toMatchObject({
            error: expect.stringMatching(/not found/i),
        });
    });

    it('surfaces truncation so an agent knows the body is partial', async () => {
        daOps.readSource.mockResolvedValueOnce({
            status: 200,
            body: 'x'.repeat(100),
            bytes: 999_999,
            truncated: true,
        });
        expect(await register().call('read_page', { path: '/big' })).toMatchObject({
            truncated: true,
            bytes: 999_999,
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
            { overwrite: true }
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
            expect.any(Object)
        );
        expect(helix.previewAndPublishPage).toHaveBeenCalledWith('skukla', 'bodea', '/about');
        expect(res).toMatchObject({ written: true, published: true });
    });

    it('does not publish when the write failed', async () => {
        daOps.createSource.mockResolvedValueOnce({
            success: false,
            path: '/about.html',
            error: 'boom',
        });

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
        expect(await register().call('write_page', { path: '/a', content: 'x' })).toMatchObject({
            written: true,
        });

        // Publishing sends x-auth-token, so GitHub is required.
        expect(
            await register().call('write_page', { path: '/a', content: 'x', publish: true })
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

        expect(helix.previewAndPublishPage).toHaveBeenCalledWith(
            'skukla',
            'bodea',
            '/products/shoes'
        );
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

    // Deleting the source after a FAILED unpublish leaves a page live on the CDN
    // with its content gone — the one unrecoverable outcome. Abort instead.
    it('does NOT delete the source when the unpublish throws', async () => {
        helix.unpublishPage.mockRejectedValueOnce(new Error('403 denied'));

        const res = await register().call('delete_page', { path: '/about', confirm: true });

        expect(daOps.deleteSource).not.toHaveBeenCalled();
        expect(res).toMatchObject({
            deleted: false,
            unpublished: false,
            error: expect.stringMatching(/403/),
        });
    });

    // unpublishPage returns false (not throws) on 401/403, so the falsy result
    // needs the same treatment as the throw.
    it('does NOT delete the source when the unpublish returns false', async () => {
        helix.unpublishPage.mockResolvedValueOnce(false);

        const res = await register().call('delete_page', { path: '/about', confirm: true });

        expect(daOps.deleteSource).not.toHaveBeenCalled();
        expect(res).toMatchObject({ deleted: false, unpublished: false });
        expect(res.error).toMatch(/left in place/i);
    });
});

// ─── read_published_page ─────────────────────────────────────────────────────

describe('read_published_page', () => {
    it('fetches .plain.html from the live CDN, with a timeout', async () => {
        const res = await register().call('read_published_page', { path: '/about' });

        expect(fetchMock.mock.calls[0][0]).toBe(
            'https://main--bodea--skukla.aem.live/about.plain.html'
        );
        // Every other CDN read in the codebase bounds itself; an MCP call has no
        // client-side cancel, so a hung socket would hang the agent's turn.
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ signal: expect.anything() });
        expect(res).toMatchObject({ path: '/about', status: 200 });
    });

    it('maps the site root to index.plain.html', async () => {
        await register().call('read_published_page', { path: '/' });
        expect(fetchMock.mock.calls[0][0]).toBe(
            'https://main--bodea--skukla.aem.live/index.plain.html'
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
