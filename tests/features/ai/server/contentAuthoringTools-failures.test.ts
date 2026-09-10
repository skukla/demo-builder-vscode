/**
 * Content-authoring tools — the answers they give when something goes wrong,
 * and the boundaries of the checks that decide.
 *
 * These tools are an agent's only account of what happened: there is no console
 * to read and no stack trace to inspect, so every failure has to come back as a
 * structured body. Each collaborator here can reject (the DA.live service, the
 * Helix service, `fetch`), and until this suite existed none of those catch
 * arms had ever run.
 *
 * The rest pins the boundaries the path and status checks turn on — a status of
 * exactly 300, a body of exactly the read cap, a trailing slash, a bare `%`.
 * Each is a single character away from the value the module already handles,
 * which is where an off-by-one in a guard hides.
 */

import {
    DaLiveOpsDouble,
    EDS_PROJECT,
    HelixDouble,
    createDaLiveServiceTokenProviderMock,
    ctxFactory,
    fakeServer,
    getCurrentProject,
    getGitHubServicesMock,
    okResponse,
    register,
    registerContentAuthoringTools,
    setupContentAuthoring,
} from './contentAuthoringTools.testUtils';
import { COMPONENT_IDS } from '@/core/constants';

let daOps: DaLiveOpsDouble;
let helix: HelixDouble;
let fetchMock: jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    ({ daOps, helix, fetchMock } = setupContentAuthoring());
});

/** The same project with different storefront metadata. */
function withMetadata(metadata: Record<string, string>): void {
    getCurrentProject.mockResolvedValue({
        ...EDS_PROJECT,
        componentInstances: { [COMPONENT_IDS.EDS_STOREFRONT]: { metadata } },
    });
}

// ─── coordinates ─────────────────────────────────────────────────────────────

describe('storefront coordinates', () => {
    it('reports missing repo metadata rather than throwing on it', async () => {
        withMetadata({ daLiveOrg: 'skukla', daLiveSite: 'bodea' });

        const res = await register().call('read_page', { path: '/about' });

        expect(res.error).toMatch(/metadata/i);
        expect(daOps.readSource).not.toHaveBeenCalled();
    });

    // The DA.live site name and the GitHub repo name are independent: a project
    // can publish `skukla/bodea` into the DA site `bodea-demo`. Falling back to
    // the repo name only applies when DA.live metadata is absent.
    it('prefers the recorded DA.live site over the repo name', async () => {
        withMetadata({ githubRepo: 'skukla/bodea', daLiveOrg: 'acme', daLiveSite: 'bodea-demo' });

        await register().call('read_page', { path: '/about' });

        expect(daOps.readSource).toHaveBeenCalledWith('acme', 'bodea-demo', 'about.html');
    });

    it('falls back to the repo coordinates when DA.live metadata is absent', async () => {
        withMetadata({ githubRepo: 'skukla/bodea' });

        await register().call('read_page', { path: '/about' });

        expect(daOps.readSource).toHaveBeenCalledWith('skukla', 'bodea', 'about.html');
    });
});

// ─── path normalisation ──────────────────────────────────────────────────────

describe('path normalisation', () => {
    it('accepts a path with no leading slash', async () => {
        const res = await register().call('read_page', { path: 'about' });

        expect(daOps.readSource).toHaveBeenCalledWith('skukla', 'bodea', 'about.html');
        expect(res).toMatchObject({ path: '/about' });
    });

    it('drops a trailing slash from a directory path', async () => {
        await register().call('list_content', { path: '/products/' });

        expect(daOps.listDirectory).toHaveBeenCalledWith('skukla', 'bodea', '/products');
    });

    it('leaves the site root alone', async () => {
        await register().call('list_content', { path: '/' });

        expect(daOps.listDirectory).toHaveBeenCalledWith('skukla', 'bodea', '/');
    });

    // A colon only restructures a URL when it forms a SCHEME at the start.
    // Rejecting it anywhere in the path would refuse legitimate page names.
    it('accepts a colon inside a page name', async () => {
        await register().call('read_page', { path: '/blog/q1:recap' });

        expect(daOps.readSource).toHaveBeenCalledWith('skukla', 'bodea', 'blog/q1:recap.html');
    });

    // `.` segments are as dangerous as `..` once a URL parser normalises them,
    // and ESCAPES only ever pairs the two.
    it('refuses a single-dot segment on its own', async () => {
        const res = await register().call('read_page', { path: '/products/./shoes' });

        expect(res.error).toMatch(/simple page path/i);
        expect(daOps.readSource).not.toHaveBeenCalled();
    });

    // A lone `%` is not valid percent-encoding, so decodeURIComponent throws.
    // The traversal check runs on the DECODED path, so a throw there must refuse
    // the path — not escape the tool.
    it('refuses a path that cannot be percent-decoded', async () => {
        const res = await register().call('read_page', { path: '/about%' });

        expect(res.error).toMatch(/simple page path/i);
        expect(daOps.readSource).not.toHaveBeenCalled();
    });
});

// ─── read_page ───────────────────────────────────────────────────────────────

describe('read_page failures', () => {
    it('reports a non-404 error status with the status itself', async () => {
        daOps.readSource.mockResolvedValueOnce({ status: 500, body: '', bytes: 0 });

        expect(await register().call('read_page', { path: '/about' })).toEqual({
            error: 'Failed to read page: HTTP 500',
            path: '/about',
        });
    });

    // 300 is the boundary of the success window. A `>` in place of `>=` would
    // let it through as a page whose body is a redirect notice.
    it('treats the 3xx boundary as a failure, not a page', async () => {
        daOps.readSource.mockResolvedValueOnce({ status: 300, body: 'moved', bytes: 5 });

        expect(await register().call('read_page', { path: '/about' })).toEqual({
            error: 'Failed to read page: HTTP 300',
            path: '/about',
        });
    });

    // Below the window is as much a failure as above it: a 1xx is a protocol
    // signal, not a page body.
    it('treats a sub-200 status as a failure too', async () => {
        daOps.readSource.mockResolvedValueOnce({ status: 100, body: '', bytes: 0 });

        expect(await register().call('read_page', { path: '/about' })).toEqual({
            error: 'Failed to read page: HTTP 100',
            path: '/about',
        });
    });

    it('accepts the top of the 2xx window', async () => {
        daOps.readSource.mockResolvedValueOnce({ status: 299, body: '<p>x</p>', bytes: 8 });

        expect(await register().call('read_page', { path: '/about' })).toMatchObject({
            content: '<p>x</p>',
        });
    });

    it('reports a rejected read as an error on the page it was reading', async () => {
        daOps.readSource.mockRejectedValueOnce(new Error('socket hang up'));

        expect(await register().call('read_page', { path: '/about' })).toEqual({
            error: 'socket hang up',
            path: '/about',
        });
    });
});

// ─── write_page ──────────────────────────────────────────────────────────────

describe('write_page failures', () => {
    it('treats empty content as no content', async () => {
        const res = await register().call('write_page', { path: '/about', content: '' });

        expect(res.error).toMatch(/content is required/i);
        expect(daOps.createSource).not.toHaveBeenCalled();
    });

    it('reports a rejected write without claiming it landed', async () => {
        daOps.createSource.mockRejectedValueOnce(new Error('403 from DA admin'));

        expect(
            await register().call('write_page', { path: '/about', content: '<p>x</p>' })
        ).toEqual({ written: false, path: '/about', error: '403 from DA admin' });
    });
});

// ─── list_content ────────────────────────────────────────────────────────────

describe('list_content edges', () => {
    it('reports a rejected listing against the directory it asked for', async () => {
        daOps.listDirectory.mockRejectedValueOnce(new Error('404 from DA admin'));

        expect(await register().call('list_content', { path: '/products' })).toEqual({
            path: '/products',
            error: '404 from DA admin',
        });
    });

    // DA.live returns the directory itself as an entry, whose path IS the
    // /org/site prefix with nothing after it. Stripping it naively yields '',
    // which no other tool here accepts.
    it('maps the site directory itself to the root path', async () => {
        daOps.listDirectory.mockResolvedValueOnce([{ name: 'bodea', path: '/skukla/bodea' }]);

        const res = await register().call('list_content', {});

        expect(res.entries).toEqual([{ name: 'bodea', type: 'folder', path: '/' }]);
    });

    // Entry paths come from an external service, so they are not assumed clean.
    it('normalises an entry path that carries trailing whitespace', async () => {
        daOps.listDirectory.mockResolvedValueOnce([
            { name: 'about', path: '/skukla/bodea/about.html ', ext: 'html' },
        ]);

        const res = await register().call('list_content', {});

        expect(res.entries).toEqual([{ name: 'about', type: 'page', path: '/about' }]);
    });
});

// ─── delete_page ─────────────────────────────────────────────────────────────

describe('delete_page failures', () => {
    it('marks the unconfirmed refusal as irreversible so a client can warn', async () => {
        expect(await register().call('delete_page', { path: '/about' })).toMatchObject({
            irreversible: true,
        });
    });

    it('requires GitHub auth — the unpublish sends x-auth-token', async () => {
        getGitHubServicesMock.mockReturnValue({
            tokenService: { validateToken: jest.fn(async () => ({ valid: false })) },
        });

        expect(
            await register().call('delete_page', { path: '/about', confirm: true })
        ).toMatchObject({ needsAuth: 'github' });
        expect(helix.unpublishPage).not.toHaveBeenCalled();
    });

    it('reports a source delete that answered failure, with its reason', async () => {
        daOps.deleteSource.mockResolvedValueOnce({ success: false, error: 'source is locked' });

        expect(await register().call('delete_page', { path: '/about', confirm: true })).toEqual({
            deleted: false,
            unpublished: true,
            path: '/about',
            error: 'source is locked',
        });
    });

    it('reports a rejected source delete, still saying the page was unpublished', async () => {
        daOps.deleteSource.mockRejectedValueOnce(new Error('502 from DA admin'));

        expect(await register().call('delete_page', { path: '/about', confirm: true })).toEqual({
            deleted: false,
            unpublished: true,
            path: '/about',
            error: '502 from DA admin',
        });
    });
});

// ─── the GitHub pre-flight ───────────────────────────────────────────────────

describe('the GitHub pre-flight', () => {
    // A token check that THROWS is not a check that passed. Treating it as one
    // would send the publish without x-auth-token and fail as a 401 later.
    it('treats a throwing token check as unauthenticated', async () => {
        getGitHubServicesMock.mockReturnValue({
            tokenService: {
                validateToken: jest.fn(async () => {
                    throw new Error('keychain unavailable');
                }),
            },
        });

        expect(await register().call('publish_page', { path: '/about' })).toMatchObject({
            needsAuth: 'github',
        });
        expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
    });
});

// ─── read_published_page ─────────────────────────────────────────────────────

describe('read_published_page edges', () => {
    it('reports a rejected fetch against the URL it tried', async () => {
        fetchMock.mockRejectedValueOnce(new Error('ENOTFOUND'));

        expect(await register().call('read_published_page', { path: '/about' })).toEqual({
            path: '/about',
            url: 'https://main--bodea--skukla.aem.live/about.plain.html',
            published: false,
            error: 'ENOTFOUND',
        });
    });

    it('does not flag an ordinary page as truncated', async () => {
        const res = await register().call('read_published_page', { path: '/about' });

        expect(res).not.toHaveProperty('truncated');
    });

    // Exactly at the cap is NOT over it: the whole body is returned and the flag
    // stays off, or an agent is told a complete page is partial.
    it('returns a body of exactly the cap in full, unflagged', async () => {
        const body = 'a'.repeat(30_000);
        fetchMock.mockResolvedValueOnce(okResponse(body));

        const res = await register().call<{ bytes: number; content: string }>(
            'read_published_page',
            { path: '/about' }
        );

        expect(res.bytes).toBe(30_000);
        expect(res.content).toHaveLength(30_000);
        expect(res).not.toHaveProperty('truncated');
    });
});

// ─── production wiring ───────────────────────────────────────────────────────

describe('the default Helix wiring', () => {
    // Every suite in this family injects a Helix double, so the factory the
    // extension actually ships had never been called. It is what binds the
    // DA.live token to a publish; without it the publishing tools reach for a
    // service that was never built.
    it('builds a Helix service from the call context when no factory is injected', async () => {
        const s = fakeServer();
        registerContentAuthoringTools(s, ctxFactory);
        createDaLiveServiceTokenProviderMock.mockClear();

        await s.call('publish_page', { path: '/about' });

        expect(createDaLiveServiceTokenProviderMock).toHaveBeenCalled();
    });
});
