/**
 * EDS drift checker tests.
 *
 * The shape rules themselves are covered by `dataInstallerDrift.test.ts`
 * against the SHARED core (`scripts/lib/driftCore.js`) — re-testing them here
 * would pin the same behavior twice. This suite covers what is EDS-specific:
 * the endpoint table (URLs built from the configured identifiers, per-service
 * auth headers), the behavioural path-encoding probe with its control, the
 * refuse-to-run-half-configured config reader, and the constant pins against
 * the extension source.
 */

 
const {
    endpoints,
    checkPathEncoding,
    readConfig,
    HELIX_ADMIN_URL,
    DA_LIVE_BASE_URL,
} = require('../../scripts/edsDrift.js');

const CFG = {
    owner: 'acme',
    repo: 'acme-storefront',
    daOrg: 'acme-org',
    daSite: 'acme-site',
    githubToken: 'gho_fake-test-token-not-a-secret',
    daToken: 'fake-test-ims-not-a-secret',
};

describe('constants match the extension source', () => {
    // The script duplicates the extension's endpoint constants as literals
    // (it must run without a TS build). These pins are what keep the copies
    // honest — if the source constant moves, this fails and names the pair.
    it('HELIX_ADMIN_URL matches helixApiClient.ts', () => {
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '../../src/features/eds/services/helixApiClient.ts'),
            'utf8'
        );
        expect(source).toContain(`HELIX_ADMIN_URL = '${HELIX_ADMIN_URL}'`);
    });

    it('DA_LIVE_BASE_URL matches daLiveConstants.ts', () => {
        const source = require('fs').readFileSync(
            require('path').join(__dirname, '../../src/features/eds/services/daLiveConstants.ts'),
            'utf8'
        );
        expect(source).toContain(`DA_LIVE_BASE_URL = '${DA_LIVE_BASE_URL}'`);
    });
});

describe('endpoints', () => {
    const table = endpoints(CFG);

    it('pins exactly the four read contracts that have already bitten', () => {
        expect(table.map((e: { action: string }) => e.action)).toEqual([
            'helix-status',
            'config-service-site',
            'config-service-roster',
            'dalive-site-config',
        ]);
    });

    it('builds the helix status URL on the GitHub identity with the x-auth-token header', () => {
        const status = table.find((e: { action: string }) => e.action === 'helix-status');
        expect(status.url).toBe(
            'https://admin.hlx.page/status/acme/acme-storefront/main?editUrl=auto'
        );
        expect(status.headers).toEqual({ 'x-auth-token': CFG.githubToken });
    });

    it('keys the Config Service SITE entry on the REPO name, not the DA.live site name', () => {
        // The lookup-key mixup (DA name instead of repo) caused a silent
        // bulk-publish failure — this is the pin that keeps it fixed.
        const site = table.find((e: { action: string }) => e.action === 'config-service-site');
        expect(site.url).toBe('https://admin.hlx.page/config/acme-org/sites/acme-storefront.json');
        expect(site.url).not.toContain('acme-site');
        expect(site.headers).toEqual({ Authorization: `Bearer ${CFG.daToken}` });
    });

    it('reads the DA.live config at SITE scope (org + site), not org scope', () => {
        const da = table.find((e: { action: string }) => e.action === 'dalive-site-config');
        expect(da.url).toBe('https://admin.da.live/config/acme-org/acme-site/');
    });
});

describe('checkPathEncoding (behavioural probe + control)', () => {
    function fetchReturning(byPath: Record<string, number>) {
        return jest.fn(async (url: string) => {
            const suffix = new URL(url).pathname;
            return { status: byPath[suffix] ?? 200 } as Response;
        });
    }

    it('passes when the root answers 200 and the encoded path 404s', async () => {
        const result = await checkPathEncoding({
            ...CFG,
            fetchImpl: fetchReturning({ '/': 200, '/drift%2Fprobe': 404 }),
        });
        expect(result.ok).toBe(true);
    });

    it('reports MOVED contract when an encoded path is accepted', async () => {
        const result = await checkPathEncoding({
            ...CFG,
            fetchImpl: fetchReturning({ '/': 200, '/drift%2Fprobe': 200 }),
        });
        expect(result.ok).toBe(false);
        expect(result.error).toContain('MOVED');
    });

    it('INVALIDATES the run when the control fails — a 404 would be unreadable', async () => {
        const result = await checkPathEncoding({
            ...CFG,
            fetchImpl: fetchReturning({ '/': 503, '/drift%2Fprobe': 404 }),
        });
        expect(result.ok).toBe(false);
        expect(result.invalidated).toBe(true);
    });

    it('treats a transport error as a failure, never as no-drift', async () => {
        const result = await checkPathEncoding({
            ...CFG,
            fetchImpl: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        });
        expect(result.ok).toBe(false);
        expect(result.invalidated).toBe(true);
    });
});

describe('readConfig', () => {
    const FULL_ENV = {
        EDS_DRIFT_OWNER: 'acme',
        EDS_DRIFT_REPO: 'acme-storefront',
        EDS_DRIFT_DA_ORG: 'acme-org',
        EDS_DRIFT_DA_SITE: 'acme-site',
        EDS_DRIFT_GITHUB_TOKEN: 'gho_fake-test-token-not-a-secret',
        EDS_DRIFT_DA_TOKEN: 'fake-test-ims-not-a-secret',
    };

    it('reads a fully-configured environment', () => {
        expect(readConfig(FULL_ENV)).toEqual(CFG);
    });

    it('refuses to run half-configured, naming EVERY missing variable', () => {
        const partial = { ...FULL_ENV, EDS_DRIFT_DA_TOKEN: '', EDS_DRIFT_REPO: '  ' };
        expect(() => readConfig(partial)).toThrow(/EDS_DRIFT_REPO, EDS_DRIFT_DA_TOKEN/);
    });
});
