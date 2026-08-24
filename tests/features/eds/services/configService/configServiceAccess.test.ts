/**
 * configServiceAccess tests
 *
 * The admin-role side of the Configuration Service: who holds it, granting it,
 * and the ONE oracle that proves a grant landed (the refused user's own config
 * read flipping 403 → 200).
 *
 * Every endpoint and payload here was live-verified 2026-08-14 against
 * `skukla/bodea-source` — see `.rptc/plans/config-service-admin-grant/research.md`.
 * The shapes in these fixtures are copied from real responses, not invented:
 * inventing them is how a client passes its own tests and fails the service.
 */

import {
    buildCodeSyncSetupUrl,
    ensureSiteAdmin,
    revokeSiteAdmin,
    probeConfigWriteAccess,
    readOrgAdmins,
    readSiteAccess,
} from '@/features/eds/services/configService/configServiceAccess';
import type { Logger } from '@/types/logger';

const logger: Logger = {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

const tokenProvider = { getAccessToken: jest.fn().mockResolvedValue('ims-token') };

/**
 * Real response SHAPE from `GET config/{org}.json` (2026-08-14); the identifiers
 * are synthetic. The shape is what the parser must handle — real addresses and
 * IMS ids would only add PII to a public repo.
 */
const ORG_CONFIG = {
    users: [{ id: 'Xx0FakeImsUserIdForTests', email: 'admin@example.test', roles: ['admin'] }],
    lastModified: '2026-08-14T12:31:56.272Z',
    created: '2026-08-14T12:24:13.748Z',
    version: 6,
};

/** Real response shape from `GET config/{org}/sites/{site}/access/admin.json`. */
const SITE_ACCESS = { role: { admin: ['admin@example.test'] }, requireAuth: 'auto' };

function mockFetchOnce(status: number, body: unknown = {}): void {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: { get: () => null },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    tokenProvider.getAccessToken.mockResolvedValue('ims-token');
    global.fetch = jest.fn();
});

describe('readOrgAdmins', () => {
    it('returns the org roster emails that hold the admin role', async () => {
        mockFetchOnce(200, ORG_CONFIG);

        const result = await readOrgAdmins(tokenProvider, 'skukla', logger);

        expect(result.status).toBe('ok');
        expect(result.admins).toEqual(['admin@example.test']);
    });

    it('reads the ORG config, not an access sub-path (the roster IS the org config)', async () => {
        // config/{org}/access/admin.json 404s — verified 2026-08-14. Getting this
        // wrong reports "no admins" for every healthy org.
        mockFetchOnce(200, ORG_CONFIG);

        await readOrgAdmins(tokenProvider, 'skukla', logger);

        expect(global.fetch).toHaveBeenCalledWith(
            'https://admin.hlx.page/config/skukla.json',
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('reports 403 as not-authorized rather than an empty roster', async () => {
        // An empty list would read as "this org has no admins", which is a
        // different (and much scarier) claim than "you cannot see them".
        mockFetchOnce(403);

        const result = await readOrgAdmins(tokenProvider, 'leahrayard', logger);

        expect(result.status).toBe('not_authorized');
        expect(result.admins).toBeUndefined();
    });

    it('treats a user with no admin role as not an admin', async () => {
        mockFetchOnce(200, {
            users: [{ email: 'viewer@adobe.com', roles: ['config'] }],
        });

        const result = await readOrgAdmins(tokenProvider, 'skukla', logger);

        expect(result.admins).toEqual([]);
    });
});

describe('readSiteAccess', () => {
    it('returns the site-level role map', async () => {
        mockFetchOnce(200, SITE_ACCESS);

        const result = await readSiteAccess(tokenProvider, 'skukla', 'bodea-source', logger);

        expect(result.status).toBe('ok');
        expect(result.roles).toEqual({ admin: ['admin@example.test'] });
    });

    it('reports an EMPTY role map as ok, not as a failure', async () => {
        // Verified: bodea-source served `{role:{}}` while its owner had full
        // access via the org roster. Empty here is normal, not broken.
        mockFetchOnce(200, { role: {}, requireAuth: 'auto' });

        const result = await readSiteAccess(tokenProvider, 'skukla', 'bodea-source', logger);

        expect(result.status).toBe('ok');
        expect(result.roles).toEqual({});
    });
});

describe('the grant wire format (through ensureSiteAdmin)', () => {
    // `grantSiteAdmin` is module-private: it REPLACES the role list, so it is
    // reachable only through the read-merge wrappers. The payload shape below is
    // the one verified against the live service on 2026-08-14 and is what these
    // assertions exist to pin — driving it through the wrapper keeps that
    // coverage without re-exporting the footgun.
    it('POSTs the verified payload shape and reports success', async () => {
        mockFetchOnce(200, { role: { admin: [] }, requireAuth: 'auto' });
        mockFetchOnce(200, {});

        const result = await ensureSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'new@adobe.com',
            logger,
        );

        expect(result.status).toBe('ok');
        const writeCall = (global.fetch as jest.Mock).mock.calls[1];
        expect(writeCall[0]).toBe(
            'https://admin.hlx.page/config/skukla/sites/bodea-source/access/admin.json',
        );
        expect(writeCall[1].method).toBe('POST');
        expect(JSON.parse(writeCall[1].body)).toEqual({ role: { admin: ['new@adobe.com'] } });
    });

    it('classifies a 403 on the WRITE as not_authorized — the caller is no admin either', async () => {
        // Measured 2026-08-14: the access endpoint is behind the SAME gate as the
        // config read, so a refused caller cannot grant. Never a retryable error.
        mockFetchOnce(200, { role: { admin: ['a@adobe.com'] }, requireAuth: 'auto' });
        mockFetchOnce(403);

        const result = await ensureSiteAdmin(
            tokenProvider,
            'leahrayard',
            'leah-b2b-demo',
            'teammate@example.test',
            logger,
        );

        expect(result.status).toBe('not_authorized');
    });

    it('reports missing credentials without calling the API', async () => {
        tokenProvider.getAccessToken.mockResolvedValue(null);

        const result = await ensureSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'a@b.com',
            logger,
        );

        expect(result.status).toBe('no_credential');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('probeConfigWriteAccess — the oracle', () => {
    it('reports granted when the site config reads 200', async () => {
        mockFetchOnce(200, { version: 6 });

        const result = await probeConfigWriteAccess(
            tokenProvider,
            'skukla',
            'bodea-source',
            logger,
        );

        expect(result).toBe('granted');
    });

    it('reports refused on 403 — the exact signal the recovery flow polls', async () => {
        mockFetchOnce(403);

        const result = await probeConfigWriteAccess(
            tokenProvider,
            'leahrayard',
            'leah-b2b-demo',
            logger,
        );

        expect(result).toBe('refused');
    });

    /**
     * 401 and 403 both mean "you did not get in", and the module's own docblock
     * already says folding them "is right for deciding whether to retry but wrong
     * for choosing a remedy: an expired session needs a re-auth, not a 'grant
     * yourself the admin role' deep link and ~135s of propagation retries."
     *
     * The oracle discarded the status, so no remedy-choosing caller could tell
     * them apart. Measured 2026-08-16: the same identity on the same project was
     * told it "holds no admin role" at 19:53 and "admin access confirmed" at
     * 23:28, having changed nothing but re-authenticating. The role was never
     * missing.
     */
    it('reports unauthenticated on 401 — a refused session, not a missing role', async () => {
        mockFetchOnce(401);

        const result = await probeConfigWriteAccess(
            tokenProvider,
            'leahrayard',
            'leah-b2b-demo',
            logger,
        );

        expect(result).toBe('unauthenticated');
    });

    it('reports unknown on a transport failure, never granted', async () => {
        // A network blip must not read as success — this value gates a claim we
        // make to the user about whether their access is fixed.
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));

        const result = await probeConfigWriteAccess(
            tokenProvider,
            'skukla',
            'bodea-source',
            logger,
        );

        expect(result).toBe('unknown');
    });

    it('uses GET only — a diagnostic must never mutate a live site config', async () => {
        mockFetchOnce(200, {});

        await probeConfigWriteAccess(tokenProvider, 'skukla', 'bodea-source', logger);

        expect(global.fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ method: 'GET' }),
        );
    });
});

describe('buildCodeSyncSetupUrl', () => {
    it('builds the observed setup deep link with every param the tool reads', () => {
        // Observed verbatim 2026-08-14 on skukla/bodea-source. The tool reads
        // org/site/url/user; omitting `url` drops the content source and the
        // Content step lands empty.
        const url = buildCodeSyncSetupUrl({
            owner: 'leahrayard',
            repo: 'leah-b2b-demo',
            contentSourceUrl: 'https://content.da.live/leahrayard/leah-b2b-demo/',
            userEmail: 'teammate@example.test',
        });

        const parsed = new URL(url);
        expect(parsed.origin + parsed.pathname).toBe('https://tools.aem.live/bot/setup');
        expect(parsed.searchParams.get('org')).toBe('leahrayard');
        expect(parsed.searchParams.get('site')).toBe('leah-b2b-demo');
        expect(parsed.searchParams.get('url')).toBe(
            'https://content.da.live/leahrayard/leah-b2b-demo/',
        );
        expect(parsed.searchParams.get('user')).toBe('teammate@example.test');
    });

    it('omits an absent email rather than sending the string "undefined"', () => {
        const url = buildCodeSyncSetupUrl({
            owner: 'skukla',
            repo: 'bodea-source',
            contentSourceUrl: 'https://content.da.live/skukla/bodea-source/',
        });

        expect(new URL(url).searchParams.get('user')).toBe('');
    });
});

/**
 * ensureSiteAdmin / revokeSiteAdmin — the read-merge-write pair.
 *
 * `grantSiteAdmin` REPLACES the role list, which makes it unsafe to call with a
 * single email: doing so silently removes every other admin. These wrap it with
 * a read first, so the caller states an intent ("this person should be an
 * admin") rather than a whole new list.
 */
describe('ensureSiteAdmin', () => {
    it('MERGES into the existing admin list — never clobbers other admins', async () => {
        // The trap this function exists for. A bare grant of one email would
        // leave the site with exactly that one admin and no trace of the rest.
        mockFetchOnce(200, { role: { admin: ['existing@adobe.com'] }, requireAuth: 'auto' });
        mockFetchOnce(200, {});

        const result = await ensureSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'new@adobe.com',
            logger,
        );

        expect(result.status).toBe('ok');
        const writeCall = (global.fetch as jest.Mock).mock.calls[1];
        expect(JSON.parse(writeCall[1].body)).toEqual({
            role: { admin: ['existing@adobe.com', 'new@adobe.com'] },
        });
    });

    it('is a no-op when the user already holds the role (no needless write)', async () => {
        mockFetchOnce(200, { role: { admin: ['already@adobe.com'] }, requireAuth: 'auto' });

        const result = await ensureSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'already@adobe.com',
            logger,
        );

        expect(result.status).toBe('ok');
        expect(result.changed).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('compares emails case-insensitively (IMS and GitHub disagree on case)', async () => {
        mockFetchOnce(200, { role: { admin: ['Already@Adobe.com'] }, requireAuth: 'auto' });

        const result = await ensureSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'already@adobe.com',
            logger,
        );

        expect(result.changed).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('seeds the role on a site that has none yet', async () => {
        mockFetchOnce(200, { role: {}, requireAuth: 'auto' });
        mockFetchOnce(200, {});

        const result = await ensureSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'first@adobe.com',
            logger,
        );

        expect(result.status).toBe('ok');
        expect(result.changed).toBe(true);
        const writeCall = (global.fetch as jest.Mock).mock.calls[1];
        expect(JSON.parse(writeCall[1].body)).toEqual({ role: { admin: ['first@adobe.com'] } });
    });

    it('does NOT write when the current list cannot be read', async () => {
        // Writing blind here is exactly the clobber this wrapper prevents.
        mockFetchOnce(403);

        const result = await ensureSiteAdmin(
            tokenProvider,
            'leahrayard',
            'leah-b2b-demo',
            'teammate@example.test',
            logger,
        );

        expect(result.status).toBe('not_authorized');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

describe('revokeSiteAdmin', () => {
    it('removes only the named user and keeps the rest', async () => {
        mockFetchOnce(200, {
            role: { admin: ['keep@adobe.com', 'drop@adobe.com'] },
            requireAuth: 'auto',
        });
        mockFetchOnce(200, {});

        const result = await revokeSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'drop@adobe.com',
            logger,
        );

        expect(result.status).toBe('ok');
        const writeCall = (global.fetch as jest.Mock).mock.calls[1];
        expect(JSON.parse(writeCall[1].body)).toEqual({ role: { admin: ['keep@adobe.com'] } });
    });

    it('refuses to remove the LAST admin — that would strand the site', async () => {
        // Nobody could grant it back: the access endpoint requires the very role
        // being removed. This is unrecoverable in-app, so it must not be possible.
        mockFetchOnce(200, { role: { admin: ['only@adobe.com'] }, requireAuth: 'auto' });

        const result = await revokeSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'only@adobe.com',
            logger,
        );

        expect(result.status).toBe('invalid');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when the user does not hold the role', async () => {
        mockFetchOnce(200, { role: { admin: ['other@adobe.com'] }, requireAuth: 'auto' });

        const result = await revokeSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'absent@adobe.com',
            logger,
        );

        expect(result.changed).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

describe('readSiteAccess — absent vs empty role map (silent-clobber guard)', () => {
    it('reports an ABSENT role key as a FAILED read, not as an empty map', async () => {
        // A 200 whose shape drifted must not read as "this site has no admins":
        // ensureSiteAdmin would then write a one-element list and drop everyone.
        //
        // Signalled through the status rather than a missing `roles` value —
        // encoding it in the value made consumers responsible for remembering a
        // convention, and two of four forgot (verify-loop iteration 2).
        mockFetchOnce(200, { requireAuth: 'auto' });

        const result = await readSiteAccess(tokenProvider, 'skukla', 'bodea-source', logger);

        expect(result.status).toBe('failed');
        expect(result.roles).toBeUndefined();
    });

    it('still reports an EMPTY role map as {} — that is a healthy site', async () => {
        mockFetchOnce(200, { role: {}, requireAuth: 'auto' });

        const result = await readSiteAccess(tokenProvider, 'skukla', 'bodea-source', logger);

        expect(result.roles).toEqual({});
    });

    it('ensureSiteAdmin REFUSES to write when the role key is absent', async () => {
        mockFetchOnce(200, { requireAuth: 'auto' });

        const result = await ensureSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'new@adobe.com',
            logger,
        );

        expect(result.status).toBe('failed');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('revokeSiteAdmin REFUSES to write when the role key is absent', async () => {
        mockFetchOnce(200, { requireAuth: 'auto' });

        const result = await revokeSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'gone@adobe.com',
            logger,
        );

        expect(result.status).toBe('failed');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

/**
 * A freshly registered site has NO access doc.
 *
 * Measured 2026-08-14 against the live service with two throwaway sites: after
 * `PUT /config/{org}/sites/{site}.json` → 201, `GET .../access/admin.json`
 * returns 404 and the site config carries no `access` key at all. The doc is
 * created by the setup tool's Users step — or by our own POST, which returns 200
 * and creates it.
 *
 * This is the case the admin pin exists for, and treating 404 as an unreadable
 * response made it a silent no-op on every new site.
 */
describe('a site with no access doc yet (404)', () => {
    it('reads as an EMPTY role map, not a failure', async () => {
        mockFetchOnce(404);

        const result = await readSiteAccess(tokenProvider, 'skukla', 'fresh-site', logger);

        expect(result.status).toBe('ok');
        expect(result.roles).toEqual({});
    });

    it('lets ensureSiteAdmin SEED the role — writing cannot clobber what does not exist', async () => {
        mockFetchOnce(404);
        mockFetchOnce(200, { role: { admin: ['first@adobe.com'] }, requireAuth: 'auto' });

        const result = await ensureSiteAdmin(
            tokenProvider,
            'skukla',
            'fresh-site',
            'first@adobe.com',
            logger,
        );

        expect(result.status).toBe('ok');
        expect(result.changed).toBe(true);
        const writeCall = (global.fetch as jest.Mock).mock.calls[1];
        expect(JSON.parse(writeCall[1].body)).toEqual({ role: { admin: ['first@adobe.com'] } });
    });

    it('still REFUSES to write on a 200 whose shape drifted', async () => {
        // 404 is safe because the resource definitively does not exist. A 200 we
        // cannot interpret is not — that one could be hiding real admins.
        mockFetchOnce(200, { requireAuth: 'auto' });

        const result = await ensureSiteAdmin(
            tokenProvider,
            'skukla',
            'bodea-source',
            'new@adobe.com',
            logger,
        );

        expect(result.status).toBe('failed');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('revokeSiteAdmin is a no-op when no access doc exists', async () => {
        mockFetchOnce(404);

        const result = await revokeSiteAdmin(
            tokenProvider,
            'skukla',
            'fresh-site',
            'nobody@adobe.com',
            logger,
        );

        expect(result.status).toBe('ok');
        expect(result.changed).toBe(false);
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

/**
 * Masking of third-party response bodies.
 *
 * `maskEmailsIn` is module-private, so it is pinned through the only thing that
 * reaches it: the `error` a non-OK response carries out. Both cases below are
 * REGRESSIONS that shipped and were caught in the verify loop — a naive version
 * of this code is one refactor away, and the failure is silent.
 */
describe('response bodies are masked before they become an error', () => {
    /** A non-OK body whose `text()` is arbitrary free text, as a real service returns. */
    function mockFailureBody(text: string): void {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 403,
            json: async () => ({}),
            text: async () => text,
            headers: { get: () => null },
        });
    }

    it('masks EVERY address in a comma-separated list', async () => {
        // The greedy pattern matched 'a@x.test,b' as ONE address, masked that,
        // and left the second address entirely intact.
        mockFailureBody('{"error":"denied for alpha@x.test,bravo@y.test"}');

        const result = await readSiteAccess(tokenProvider, 'org', 'site', logger);

        expect(result.error).not.toContain('alpha@x.test');
        expect(result.error).not.toContain('bravo@y.test');
    });

    it('masks before truncating, so an address at the 300-char cut cannot survive', async () => {
        // The cut must land INSIDE the domain: 284 padding + 'averylongname@x.'
        // is exactly 300, so slicing first leaves 'averylongname@x.' — which the
        // pattern cannot match (no character after the dot), sending the local
        // part out WHOLE into a dialog and the exportable log. A naive padding
        // just truncates the name away and proves nothing.
        mockFailureBody(`${'x'.repeat(284)}averylongname@x.test trailing`);

        const result = await readSiteAccess(tokenProvider, 'org', 'site', logger);

        expect(result.error).not.toContain('averylongname');
    });

    it('still reports the server\'s own words, masked rather than dropped', async () => {
        mockFailureBody('{"message":"site is locked"}');

        const result = await readSiteAccess(tokenProvider, 'org', 'site', logger);

        expect(result.error).toContain('site is locked');
    });
});

