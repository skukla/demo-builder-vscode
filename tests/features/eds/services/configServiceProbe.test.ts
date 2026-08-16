/**
 * Configuration Service credential probe.
 *
 * A colleague hit `PUT /config/{org}/sites/{site}.json -> 403` while the SAME
 * IMS token succeeded against `admin.da.live` in the same run. That rules out an
 * expired or malformed token and leaves authorization — but nothing in the logs
 * could tell the two apart, so the case sat open for days.
 *
 * `registerSite`'s own docstring names the likely cause: the Configuration
 * Service assigns the admin role to whoever *installs* the AEM Code Sync GitHub
 * App. A user who did not install it on that repo — because a teammate did, or
 * because an org admin installed it org-wide — can hold a perfectly valid token
 * and still be refused every write.
 *
 * The probe is deliberately READ-ONLY. A diagnostic that PUTs a site config
 * could clobber a live storefront, and there is no safe write test: the only
 * non-mutating write probe would be a PUT that 409s, which stops being safe the
 * moment Adobe changes it to an upsert.
 */

// BYOM is a user setting, so the action leg is off unless a test turns it on.
// Only `resolveByomOverlayUrl` is imported from this module by the probe.
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    resolveByomOverlayUrl: jest.fn(() => undefined),
}));

import { probeConfigService } from '@/features/eds/services/configServiceProbe';
import { resolveByomOverlayUrl } from '@/features/eds/handlers/edsHelpers';

const mockResolveOverlayUrl = resolveByomOverlayUrl as jest.MockedFunction<
    typeof resolveByomOverlayUrl
>;

const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
};
const TOKEN = 'ims-token-value-never-logged';

function tokenProvider() {
    return { getAccessToken: jest.fn().mockResolvedValue(TOKEN) };
}

/**
 * The no-credential case needs its own factory. Passing `undefined` to a
 * defaulted parameter triggers the default, so `tokenProvider(undefined)`
 * quietly handed back a valid token and the test asserted nothing.
 */
function tokenProviderWithNoCredential() {
    return { getAccessToken: jest.fn().mockResolvedValue(undefined) };
}

/** Build a fetch stub keyed on which host the probe is calling. */
function fetchStub(byHost: Record<string, { status: number; headers?: Record<string, string> }>) {
    return jest.fn().mockImplementation((url: string) => {
        const key = Object.keys(byHost).find((k) => url.includes(k));
        if (!key) return Promise.reject(new Error(`unstubbed host: ${url}`));
        const { status, headers = {} } = byHost[key];
        return Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
        });
    });
}

describe('probeConfigService', () => {
    const org = 'skukla';
    const site = 'b2b-tester';
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        originalFetch = globalThis.fetch;
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it('reports no credential when the token provider has none', async () => {
        const result = await probeConfigService(
            tokenProviderWithNoCredential(),
            org,
            site,
            logger as never
        );

        expect(result.token.present).toBe(false);
        expect(result.verdict).toMatch(/sign in/i);
    });

    it('treats a null credential as absent, the way the real provider returns it', async () => {
        // DaLiveAuthService resolves null, not undefined. A probe that only
        // handled undefined would sail past this and probe with "Bearer null".
        const provider = { getAccessToken: jest.fn().mockResolvedValue(null) };

        const result = await probeConfigService(provider, org, site, logger as never);

        expect(result.token.present).toBe(false);
        expect(result.verdict).toMatch(/sign in/i);
    });

    it('never puts the token in the result', async () => {
        // The probe's output is meant to be pasted into a ticket.
        globalThis.fetch = fetchStub({
            'admin.hlx.page': { status: 200 },
            'admin.da.live': { status: 200 },
        }) as never;

        const result = await probeConfigService(tokenProvider(), org, site, logger as never);

        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it('issues only GET requests', async () => {
        // A diagnostic must not mutate. If this ever fails, the probe has grown
        // a write and can clobber a live storefront's site config.
        const stub = fetchStub({
            'admin.hlx.page': { status: 200 },
            'admin.da.live': { status: 200 },
        });
        globalThis.fetch = stub as never;

        await probeConfigService(tokenProvider(), org, site, logger as never);

        for (const [, init] of stub.mock.calls) {
            expect((init?.method ?? 'GET').toUpperCase()).toBe('GET');
        }
    });

    it('captures the status, x-error and x-invocation-id the service returned', async () => {
        globalThis.fetch = fetchStub({
            'admin.hlx.page': {
                status: 403,
                headers: { 'x-error': '[admin] forbidden', 'x-invocation-id': 'abc-123' },
            },
            'admin.da.live': { status: 200 },
        }) as never;

        const result = await probeConfigService(tokenProvider(), org, site, logger as never);

        expect(result.configService?.httpStatus).toBe(403);
        expect(result.configService?.xError).toBe('[admin] forbidden');
        expect(result.configService?.invocationId).toBe('abc-123');
    });

    it('names the admin-role cause when the token works elsewhere but config is 403', async () => {
        // The decisive combination: DA.live accepts the credential, the
        // Configuration Service refuses it. Not expiry, not a malformed token.
        globalThis.fetch = fetchStub({
            'admin.hlx.page': { status: 403 },
            'admin.da.live': { status: 200 },
        }) as never;

        const result = await probeConfigService(tokenProvider(), org, site, logger as never);

        expect(result.daLive?.httpStatus).toBe(200);
        expect(result.verdict).toMatch(/install/i);
        expect(result.verdict).toMatch(/not a token problem|credential is valid/i);
    });

    it('calls an expired-or-rejected credential what it is on a 401', async () => {
        globalThis.fetch = fetchStub({
            'admin.hlx.page': { status: 401 },
            'admin.da.live': { status: 401 },
        }) as never;

        const result = await probeConfigService(tokenProvider(), org, site, logger as never);

        expect(result.verdict).toMatch(/sign in|credential/i);
        expect(result.verdict).not.toMatch(/install the AEM Code Sync/i);
    });

    it('reports a healthy config read plainly', async () => {
        globalThis.fetch = fetchStub({
            'admin.hlx.page': { status: 200 },
            'admin.da.live': { status: 200 },
        }) as never;

        const result = await probeConfigService(tokenProvider(), org, site, logger as never);

        expect(result.configService?.httpStatus).toBe(200);
        expect(result.verdict).toMatch(/no problem|healthy|can read/i);
    });

    it('distinguishes an unregistered site from a refused one', async () => {
        // 404 means the site was never registered — a different remedy entirely
        // from being refused, and it must not read as a permission problem.
        globalThis.fetch = fetchStub({
            'admin.hlx.page': { status: 404 },
            'admin.da.live': { status: 200 },
        }) as never;

        const result = await probeConfigService(tokenProvider(), org, site, logger as never);

        expect(result.verdict).toMatch(/not registered|no site config/i);
        expect(result.verdict).not.toMatch(/forbidden|refused/i);
    });

    it('survives one unreachable host without losing the other leg', async () => {
        globalThis.fetch = jest.fn().mockImplementation((url: string) => {
            if (url.includes('admin.da.live')) return Promise.reject(new Error('ENOTFOUND'));
            return Promise.resolve({
                ok: true,
                status: 200,
                headers: { get: () => null },
            });
        }) as never;

        const result = await probeConfigService(tokenProvider(), org, site, logger as never);

        expect(result.configService?.httpStatus).toBe(200);
        expect(result.daLive?.error).toContain('ENOTFOUND');
    });

    it('keeps the verdict short enough to paste', async () => {
        globalThis.fetch = fetchStub({
            'admin.hlx.page': { status: 403 },
            'admin.da.live': { status: 200 },
        }) as never;

        const result = await probeConfigService(tokenProvider(), org, site, logger as never);

        expect(result.verdict.length).toBeLessThan(400);
    });
});

/**
 * The org-roster leg. It exists to turn "ask an admin" into a NAME, and its
 * absence is itself the finding — a roster you cannot read means there is nobody
 * to ask, which is what makes the Code Sync setup flow the only way in.
 *
 * Restored after a `git checkout` during the 2026-08-14 verify loop discarded
 * this session's uncommitted additions to this file.
 */
describe('probeConfigService — org roster leg', () => {
    const org = 'skukla';
    const site = 'b2b-tester';
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        originalFetch = globalThis.fetch;
    });
    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    /** Config read 403, DA.live 200 (so the credential is provably valid), roster configurable. */
    function stubWithRoster(roster: { status: number; body?: unknown }) {
        globalThis.fetch = jest.fn().mockImplementation((url: string) => {
            const reply = (status: number, body?: unknown) =>
                Promise.resolve({
                    ok: status >= 200 && status < 300,
                    status,
                    headers: { get: () => null },
                    json: async () => body,
                });
            if (url.includes('admin.da.live')) return reply(200);
            if (url.includes(`/config/${org}.json`)) return reply(roster.status, roster.body);
            return reply(403);
        }) as unknown as typeof globalThis.fetch;
    }

    it('names the org admins in the verdict, MASKED', async () => {
        stubWithRoster({
            status: 200,
            body: { users: [{ email: 'owner@example.test', roles: ['admin'] }] },
        });

        const result = await probeConfigService(
            { getAccessToken: jest.fn().mockResolvedValue(TOKEN) },
            org,
            site,
            logger as never
        );

        expect(result.orgAdmins?.status).toBe('ok');
        // Recognisable, not published — the report is pasted into tickets.
        expect(result.verdict).toContain('o****r@example.test');
        expect(result.verdict).not.toContain('owner@example.test');
    });

    it('treats an unreadable roster as the finding, not a gap', async () => {
        stubWithRoster({ status: 403 });

        const result = await probeConfigService(
            { getAccessToken: jest.fn().mockResolvedValue(TOKEN) },
            org,
            site,
            logger as never
        );

        expect(result.orgAdmins?.status).toBe('not_authorized');
        expect(result.verdict).toMatch(/No org admin is visible/i);
        expect(result.verdict).toContain('tools.aem.live/bot/setup');
    });
});

/**
 * The action-key leg.
 *
 * `keyCount` counts keys on the SITE. This leg asks the shared PDP action
 * whether its own stored copy still decrypts — the only check that catches an
 * `ENCRYPTION_KEY` mismatch, since it is the only one reading a blob written by
 * an earlier deploy. A write-then-read inside the register call would use the
 * same master key both ways and round-trip cleanly while every older key rotted.
 */
describe('probeConfigService — action key leg', () => {
    const org = 'skukla';
    const site = 'b2b-tester';
    const OVERLAY = 'https://ns.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';
    let originalFetch: typeof globalThis.fetch;

    /** Config-service hosts answer 200; the action answers whatever is passed. */
    function stub(action: { status: number; body?: unknown } | 'reject') {
        return jest.fn().mockImplementation((url: string) => {
            if (url.includes('register-publish-key')) {
                if (action === 'reject') return Promise.reject(new Error('socket hang up'));
                return Promise.resolve({
                    ok: action.status >= 200 && action.status < 300,
                    status: action.status,
                    headers: { get: () => null },
                    json: () => Promise.resolve(action.body),
                });
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                headers: { get: () => null },
                json: () => Promise.resolve({}),
            });
        });
    }

    beforeEach(() => {
        jest.clearAllMocks();
        originalFetch = globalThis.fetch;
        mockResolveOverlayUrl.mockReturnValue(OVERLAY);
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    const run = () =>
        probeConfigService(
            { getAccessToken: jest.fn().mockResolvedValue(TOKEN) },
            org,
            site,
            logger as never
        );

    it('reports the action holding a readable key', async () => {
        globalThis.fetch = stub({ status: 200, body: { registered: true } }) as never;

        const result = await run();

        expect(result.pdpPublishing?.actionKey).toEqual({ registered: true });
    });

    it('reports the action holding NO readable key', async () => {
        globalThis.fetch = stub({ status: 200, body: { registered: false } }) as never;

        const result = await run();

        expect(result.pdpPublishing?.actionKey).toEqual({ registered: false });
    });

    it('asks about the right site', async () => {
        const fetchMock = stub({ status: 200, body: { registered: true } });
        globalThis.fetch = fetchMock as never;

        await run();

        const called = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(called.some((u) => u.includes(`org=${org}`) && u.includes(`site=${site}`))).toBe(
            true
        );
    });

    it('reads with a GET, never a write', async () => {
        const fetchMock = stub({ status: 200, body: { registered: true } });
        globalThis.fetch = fetchMock as never;

        await run();

        for (const [, init] of fetchMock.mock.calls) {
            expect((init?.method ?? 'GET').toUpperCase()).toBe('GET');
        }
    });

    it('records an unreachable action as an error, not as "no key"', async () => {
        // Reporting `registered: false` here would send someone to re-register a
        // key that is probably fine, and hide that the action never answered.
        globalThis.fetch = stub('reject') as never;

        const result = await run();

        expect(result.pdpPublishing?.actionKey?.registered).toBeUndefined();
        expect(result.pdpPublishing?.actionKey?.error).toMatch(/socket hang up/);
    });

    it('records a non-2xx from the action as an error', async () => {
        globalThis.fetch = stub({ status: 401 }) as never;

        const result = await run();

        expect(result.pdpPublishing?.actionKey?.error).toBe('HTTP 401');
    });

    it('skips the leg entirely when BYOM is off', async () => {
        mockResolveOverlayUrl.mockReturnValue(undefined);
        const fetchMock = stub({ status: 200, body: { registered: true } });
        globalThis.fetch = fetchMock as never;

        const result = await run();

        expect(result.pdpPublishing?.actionKey).toBeUndefined();
        const called = fetchMock.mock.calls.map((c) => String(c[0]));
        expect(called.some((u) => u.includes('register-publish-key'))).toBe(false);
    });
});
