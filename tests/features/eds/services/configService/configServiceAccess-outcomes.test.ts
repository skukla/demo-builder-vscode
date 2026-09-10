/**
 * configServiceAccess — the wire, the classifier, and what "changed" means.
 *
 * The sibling suite covers the module's policies: merge-don't-clobber, refuse
 * the last admin, absent-vs-empty role maps. This one covers the layer
 * underneath them, which a focused mutation run (PL-22, MUT-07) found almost
 * unconstrained: the headers and body actually sent, the masking pattern applied
 * to a server's own words before they reach a dialog, the HTTP-status → outcome
 * mapping, the guards against a body whose shape drifted, and the `changed` flag
 * callers read to decide whether anything happened. `restoreSiteRoles` had no
 * tests at all.
 */

import {
    ensureSiteAdmin,
    probeConfigWriteAccess,
    readOrgAdmins,
    readSiteAccess,
    restoreSiteRoles,
    revokeSiteAdmin,
} from '@/features/eds/services/configService/configServiceAccess';
import {
    fetchCall,
    IMS_TOKEN,
    logger,
    mockFailureBody,
    mockFetchOnce,
    mockUnparseableOnce,
    resetAccessMocks,
    SITE_ACCESS,
    tokenProvider,
} from './configServiceAccess.testUtils';

const ORG = 'skukla';
const SITE = 'bodea-source';
const SITE_ACCESS_URL =
    `https://admin.hlx.page/config/${ORG}/sites/${SITE}/access/admin.json`;

beforeEach(resetAccessMocks);

describe('what goes on the wire', () => {
    it('sends the IMS bearer and no content type on a read', async () => {
        mockFetchOnce(200, SITE_ACCESS);

        await readSiteAccess(tokenProvider, ORG, SITE, logger);

        const [url, init] = fetchCall(0);
        expect(url).toBe(SITE_ACCESS_URL);
        expect(init.method).toBe('GET');
        expect(init.headers).toEqual({ Authorization: `Bearer ${IMS_TOKEN}` });
    });

    it('adds the JSON content type on a write, alongside the bearer', async () => {
        mockFetchOnce(200, SITE_ACCESS); // the read ensureSiteAdmin does first
        mockFetchOnce(200, {}); // the POST

        await ensureSiteAdmin(tokenProvider, ORG, SITE, 'new@example.test', logger);

        const [, init] = fetchCall(1);
        expect(init.headers).toEqual({
            Authorization: `Bearer ${IMS_TOKEN}`,
            'Content-Type': 'application/json',
        });
    });
});

describe('a server error body is masked and bounded before it becomes an error', () => {
    it('masks an address whose domain label is longer than one character', async () => {
        // The pattern has to consume the WHOLE label on each side of the dot. A
        // single-character class there matches nothing in a normal domain, and the
        // address goes out whole into a dialog and the exportable log.
        mockFailureBody('denied for someone@example.test');

        const result = await readSiteAccess(tokenProvider, ORG, SITE, logger);

        expect(result.error).toBe('denied for s****e@example.test');
    });

    it('consumes the whole final label, so it cannot resume mid-address', async () => {
        // A pattern that stopped one character after the dot would restart inside
        // what it just matched and mask a fragment that is not an address.
        mockFailureBody('contact a@b.cd@e.f for access');

        const result = await readSiteAccess(tokenProvider, ORG, SITE, logger);

        expect(result.error).toBe('contact a****@b.cd@e.f for access');
    });

    it('bounds the body at 300 characters', async () => {
        mockFailureBody('x'.repeat(500));

        const result = await readSiteAccess(tokenProvider, ORG, SITE, logger);

        expect(result.error).toHaveLength(300);
    });

    it('carries a transport failure’s own message out', async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network down'));

        const result = await readOrgAdmins(tokenProvider, ORG, logger);

        expect(result).toEqual({ status: 'failed', error: 'Network down' });
    });
});

describe('classifying an HTTP status', () => {
    it.each([
        ['a 3xx is not a success', 300, 'failed'],
        ['a 401 is a refusal no retry can clear', 401, 'not_authorized'],
        ['a 403 is the same', 403, 'not_authorized'],
        ['a 500 is a plain failure, not a missing credential', 500, 'failed'],
    ] as const)('%s', async (_name, status, expected) => {
        mockFetchOnce(status, {});

        const result = await readOrgAdmins(tokenProvider, ORG, logger);

        expect(result.status).toBe(expected);
    });

    it('reports a missing credential as such, without calling the API', async () => {
        tokenProvider.getAccessToken.mockResolvedValue(null);

        const result = await readOrgAdmins(tokenProvider, ORG, logger);

        expect(result.status).toBe('no_credential');
        expect(global.fetch).not.toHaveBeenCalled();
    });
});

describe('bodies whose shape is not what the parser expects', () => {
    it('reads a null org config as an empty roster rather than throwing', async () => {
        mockFetchOnce(200, null);

        await expect(readOrgAdmins(tokenProvider, ORG, logger)).resolves.toEqual({
            status: 'ok',
            admins: [],
        });
    });

    it('reads an org config with no users key as an empty roster', async () => {
        mockFetchOnce(200, { version: 6 });

        await expect(readOrgAdmins(tokenProvider, ORG, logger)).resolves.toEqual({
            status: 'ok',
            admins: [],
        });
    });

    it('treats a roster entry carrying no roles at all as not an admin', async () => {
        mockFetchOnce(200, { users: [{ email: 'norole@example.test' }] });

        await expect(readOrgAdmins(tokenProvider, ORG, logger)).resolves.toEqual({
            status: 'ok',
            admins: [],
        });
    });

    it('reads a null site access body as unreadable, not as an empty role map', async () => {
        // The distinction the read-merge wrappers depend on: an empty map is a
        // healthy site, an unreadable one must never be written over.
        mockFetchOnce(200, null);

        await expect(readSiteAccess(tokenProvider, ORG, SITE, logger)).resolves.toEqual({
            status: 'failed',
            error: 'site access response had no role map',
        });
    });
});

describe('probeConfigWriteAccess — the oracle reads only the status', () => {
    it('reports granted for a 200 whose body is not JSON at all', async () => {
        // Forcing a parse here made a readable site report "access indeterminate",
        // which is the one answer that must never be produced by our own client.
        mockUnparseableOnce(200);

        expect(await probeConfigWriteAccess(tokenProvider, ORG, SITE, logger)).toBe('granted');
    });

    it('reports a 3xx as indeterminate, never as granted', async () => {
        mockFetchOnce(300, {});

        expect(await probeConfigWriteAccess(tokenProvider, ORG, SITE, logger)).toBe('unknown');
    });
});

describe('the changed flag callers read', () => {
    it('is false when the grant is refused — nothing was written', async () => {
        mockFetchOnce(200, SITE_ACCESS);
        mockFetchOnce(403, {});

        const result = await ensureSiteAdmin(tokenProvider, ORG, SITE, 'new@example.test', logger);

        expect(result).toEqual({
            status: 'not_authorized',
            error: expect.any(String),
            changed: false,
        });
    });

    it('is true when a revoke lands', async () => {
        mockFetchOnce(200, { role: { admin: ['a@example.test', 'b@example.test'] } });
        mockFetchOnce(200, {});

        const result = await revokeSiteAdmin(tokenProvider, ORG, SITE, 'b@example.test', logger);

        expect(result.status).toBe('ok');
        expect(result.changed).toBe(true);
    });

    it('is false when the revoke write itself is refused', async () => {
        mockFetchOnce(200, { role: { admin: ['a@example.test', 'b@example.test'] } });
        mockFetchOnce(403, {});

        const result = await revokeSiteAdmin(tokenProvider, ORG, SITE, 'b@example.test', logger);

        expect(result.status).toBe('not_authorized');
        expect(result.changed).toBe(false);
    });

    it('refuses the last-admin removal in its own words, without issuing a write', async () => {
        mockFetchOnce(200, { role: { admin: ['only@example.test'] } });

        const result = await revokeSiteAdmin(tokenProvider, ORG, SITE, 'only@example.test', logger);

        expect(result).toEqual({ status: 'invalid', error: 'cannot remove the last admin' });
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});

describe('restoreSiteRoles', () => {
    const ROLES = { admin: ['a@example.test', 'b@example.test'] };

    it('POSTs the captured role map back verbatim, to the site access doc', async () => {
        mockFetchOnce(200, {});

        await restoreSiteRoles(tokenProvider, ORG, SITE, ROLES, logger);

        const [url, init] = fetchCall(0);
        expect(url).toBe(SITE_ACCESS_URL);
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body as string)).toEqual({ role: ROLES });
    });

    it('carries a refusal out rather than reporting a restore that did not happen', async () => {
        mockFailureBody('no admin role', 403);

        const result = await restoreSiteRoles(tokenProvider, ORG, SITE, ROLES, logger);

        expect(result).toEqual({ status: 'not_authorized', error: 'no admin role' });
    });
});
