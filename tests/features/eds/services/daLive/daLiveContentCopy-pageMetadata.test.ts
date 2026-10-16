/**
 * DaLiveContentCopy — a copied page keeps its own page metadata.
 *
 * `copySingleFile` is the one write every page copy funnels through (creation,
 * reset, the account-chrome overlay, reference following, block doc pages), so
 * this is where the metadata the `.plain.html` read loses is put back. Fixtures are
 * verbatim aem.live responses; `tests/fixtures/eds/page-metadata/README.md` names
 * the URL of each.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import {
    createCopyHarness,
    mockResponse,
    routeFetch,
    uploadedTextOf,
    TEST_TOKEN,
    type CopyHarness,
} from './daLiveContentCopy.testUtils';

const FIXTURES = path.join(process.cwd(), 'tests/fixtures/eds/page-metadata');
const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');

const DEST = { org: 'dest-org', site: 'dest-site' };

/** A source site on the CDN: its page, that page's `.plain.html`, head.html and sheet. */
function routeSource(
    base: string,
    page: { path: string; html: string | Response; plain: string },
): Array<{ url: string; init?: RequestInit }> {
    const pageResponse =
        typeof page.html === 'string' ? mockResponse(200, page.html) : page.html;
    return routeFetch([
        { when: (_u, i) => i?.method === 'HEAD', respond: mockResponse(404) },
        { when: (u) => u === `${base}${page.path}.plain.html`, respond: mockResponse(200, page.plain) },
        { when: (u) => u === `${base}${page.path}`, respond: pageResponse },
        { when: (u) => u === `${base}/head.html`, respond: mockResponse(200, fixture('b2b-head.html')) },
        {
            when: (u) => u === `${base}/metadata.json`,
            respond: mockResponse(200, fixture('b2b-metadata.json'), 'application/json'),
        },
    ]);
}

describe('DaLiveContentCopy.copySingleFile — page metadata', () => {
    let h: CopyHarness;
    const B2B = { org: 'adobe-commerce', site: 'boilerplate-b2b' };
    const B2B_BASE = 'https://main--boilerplate-b2b--adobe-commerce.aem.live';

    beforeEach(() => {
        jest.clearAllMocks();
        h = createCopyHarness();
    });

    it("writes /customer/account with Adobe's template, robots and title in a metadata block", async () => {
        routeSource(B2B_BASE, {
            path: '/customer/account',
            html: fixture('b2b-customer-account.html'),
            plain: fixture('b2b-customer-account.plain.html'),
        });

        const ok = await h.copy.copySingleFile(
            TEST_TOKEN,
            B2B,
            '/customer/account',
            DEST,
            '/customer/account',
        );

        expect(ok).toBe(true);
        const written = await uploadedTextOf(h.apiClient.fetchWithRetry);
        expect(written).toContain(
            '<div class="metadata">' +
                '<div><div>Title</div><div>My Account</div></div>' +
                '<div><div>Template</div><div>My Account, Columns</div></div>' +
                '<div><div>Robots</div><div>noindex, nofollow</div></div>' +
                '</div>',
        );
        // Still inside the document, in the last section.
        expect(written).toMatch(/<div class="metadata">.*<\/div>\s*<\/div>\s*<\/main>/s);
    });

    it('writes a page with no authored metadata unchanged, without reading the site head or sheet', async () => {
        const base = 'https://main--bodea-source--skukla.aem.live';
        const calls = routeSource(base, {
            path: '/footer',
            html: fixture('bodea-footer.html'),
            plain: fixture('bodea-footer.plain.html'),
        });

        await h.copy.copySingleFile(
            TEST_TOKEN,
            { org: 'skukla', site: 'bodea-source' },
            '/footer',
            DEST,
            '/footer',
        );

        expect(await uploadedTextOf(h.apiClient.fetchWithRetry)).not.toContain('class="metadata"');
        const urls = calls.map((c) => c.url);
        expect(urls).toContain(`${base}/footer`);
        expect(urls).not.toContain(`${base}/head.html`);
        expect(urls).not.toContain(`${base}/metadata.json`);
    });

    it('still copies the page, without a block, when its head cannot be read', async () => {
        routeSource(B2B_BASE, {
            path: '/customer/account',
            html: mockResponse(503),
            plain: fixture('b2b-customer-account.plain.html'),
        });

        const ok = await h.copy.copySingleFile(
            TEST_TOKEN,
            B2B,
            '/customer/account',
            DEST,
            '/customer/account',
        );

        expect(ok).toBe(true);
        const written = await uploadedTextOf(h.apiClient.fetchWithRetry);
        expect(written).toContain('commerce-account-header');
        expect(written).not.toContain('class="metadata"');
    });
});
