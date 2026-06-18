/**
 * Per-package content-completeness smoke harness (SCAFFOLD).
 *
 * The regression net for the "silently-dropped content" bug class: drive
 * `copyContentFromSource` against a per-package fixture and assert the copy is
 * complete — the expected runtime surfaces land and the completeness audit
 * reports no dangling references. A deliberately-broken fixture proves the net
 * bites.
 *
 * SCAFFOLD STATUS: fixtures here are SYNTHETIC (minimal hand-written HTML), good
 * enough to exercise the harness and the audit. Replace `PROFILES[*].plainHtml`
 * with real `.plain.html` captures from each package's source site (the live
 * captures being gathered for verification) to make this a faithful net, and add
 * one PROFILE row per demo package (b2b, citisignal, citisignal-b2b, buildright…).
 */

import {
    DaLiveContentOperations,
    type DaLiveContentSource,
    type TokenProvider,
} from '@/features/eds/services/daLiveContentOperations';
import { createPatchReport, getUnapplied } from '@/features/eds/services/patchReportHelper';
import type { Logger } from '@/types/logger';

jest.mock('@/core/utils/timeoutConfig', () => ({ TIMEOUTS: { NORMAL: 30000, QUICK: 5000 } }));

const mockFetch = jest.fn();
global.fetch = mockFetch;

interface PackageProfile {
    name: string;
    org: string;
    site: string;
    /** Paths present in the CDN content index (the list API is forced unavailable). */
    indexed: string[];
    /** `.plain.html` bodies keyed by extension-less path; absent path => 404 on source. */
    plainHtml: Record<string, string>;
    /** Auth `.plain.html` paths that exist on source (HEAD 200). */
    authPlainHtmlPresent: string[];
    /** Surfaces that MUST end up copied. */
    expectCopied: string[];
    /** Referenced docs the audit MUST flag as not copied (empty for a healthy package). */
    expectDangling: string[];
}

// A B2B-shaped package on the index-fallback path (user not in the source DA.live
// org → CDN index), account page embeds /customer/nav. The reported `b2b` case.
const B2B_HEALTHY: PackageProfile = {
    name: 'b2b (healthy: account menu fragment present)',
    org: 'adobe-commerce',
    site: 'boilerplate-b2b',
    indexed: ['/about'],
    plainHtml: {
        '/about': '<body><main><div>About</div></main></body>',
        '/customer/account': '<body><main><div class="columns"><div><a href="/customer/nav">nav</a></div><div class="commerce-account">Account</div></div></main></body>',
        '/customer/nav': '<body><main><div><ol><li>My account</li><li>Purchase Orders</li><li>Quotes</li></ol></div></main></body>',
    },
    authPlainHtmlPresent: ['/customer/account'],
    expectCopied: ['/about', '/customer/account', '/customer/nav'],
    expectDangling: [],
};

// Same shape, but the referenced nav fragment is missing on source — the audit
// must surface it instead of the demo silently shipping an empty account menu.
const B2B_BROKEN: PackageProfile = {
    ...B2B_HEALTHY,
    name: 'b2b (broken: account references a missing /customer/nav)',
    plainHtml: {
        '/about': '<body><main><div>About</div></main></body>',
        '/customer/account': '<body><main><div class="columns"><div><a href="/customer/nav">nav</a></div><div class="commerce-account">Account</div></div></main></body>',
        // /customer/nav intentionally absent → 404 on source
    },
    expectCopied: ['/about', '/customer/account'],
    expectDangling: ['/customer/nav'],
};

const PROFILES: PackageProfile[] = [B2B_HEALTHY, B2B_BROKEN];

function makeRouter(profile: PackageProfile) {
    const base = `https://main--${profile.site}--${profile.org}.aem.live`;
    const ok = (body?: string, contentType = 'text/html'): Response => ({
        ok: true, status: 200,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
        text: async () => body ?? '', json: async () => (body ? JSON.parse(body) : {}), blob: async () => new Blob([body ?? '']),
    } as unknown as Response);
    const notFound = (): Response => ({
        ok: false, status: 404, statusText: 'Not Found',
        headers: { get: () => null }, text: async () => '', json: async () => ({}), blob: async () => new Blob([]),
    } as unknown as Response);

    return async (url: string, options?: RequestInit): Promise<Response> => {
        const method = options?.method ?? 'GET';
        if (url.includes('/list/')) return notFound();                                  // force index fallback
        if (url.includes('full-index.json')) return ok(JSON.stringify({ data: profile.indexed.map((p) => ({ path: p })) }), 'application/json');
        if (method === 'POST' && url.includes('/source/')) return ok();                 // dest writes
        if (method === 'HEAD') {
            for (const p of profile.authPlainHtmlPresent) {
                if (url === `${base}${p}.plain.html`) return ok();
            }
            return notFound();                                                          // spreadsheets, other auth, fragments
        }
        // GET .plain.html source copies
        for (const [path, html] of Object.entries(profile.plainHtml)) {
            if (url === `${base}${path}.plain.html`) return ok(html);
        }
        return notFound();
    };
}

describe('content-completeness smoke (per-package)', () => {
    let service: DaLiveContentOperations;

    beforeEach(() => {
        jest.clearAllMocks();
        const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
        const tokenProvider: TokenProvider = { getAccessToken: jest.fn().mockResolvedValue('mock-ims-token') };
        service = new DaLiveContentOperations(tokenProvider, logger);
    });

    it.each(PROFILES)('$name', async (profile) => {
        mockFetch.mockImplementation(makeRouter(profile));
        const source: DaLiveContentSource = {
            org: profile.org, site: profile.site,
            indexUrl: `https://main--${profile.site}--${profile.org}.aem.live/full-index.json`,
        };
        const report = createPatchReport();

        const result = await service.copyContentFromSource(source, 'user-org', 'user-site', undefined, undefined, undefined, report);

        for (const path of profile.expectCopied) {
            expect(result.copiedFiles).toContain(path);
        }
        const danglingReported = getUnapplied(report)
            .filter((u) => u.kind === 'reference')
            .map((u) => u.target)
            .sort();
        expect(danglingReported).toEqual([...profile.expectDangling].sort());
    });
});
