/**
 * daLivePageMetadata — rebuilding a page's own metadata block from its rendered head.
 *
 * Every fixture is a verbatim aem.live response; `tests/fixtures/eds/page-metadata/README.md`
 * names the URL each one came from. The rules under test come from Adobe's renderer
 * (adobe/helix-html-pipeline, `extract-metadata.js`, `get-metadata.js`, `render.js`):
 * og:/twitter:/article: tags are always generated, a missing title is the first heading
 * (else first paragraph), a missing description is the first paragraph of ten or more
 * words, and every other name comes from the page's block, the site sheet, or head.html.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import {
    appendMetadataBlock,
    authoredPageMetadata,
    siteWideMetadata,
} from '@/features/eds/services/daLive/daLivePageMetadata';

const FIXTURES = path.join(process.cwd(), 'tests/fixtures/eds/page-metadata');
const fixture = (name: string): string => readFileSync(path.join(FIXTURES, name), 'utf8');
const json = (name: string): unknown => JSON.parse(fixture(name));

/** boilerplate-b2b's own site-wide inputs: its head.html and its (empty) sheet. */
function b2bSiteWide(webPath: string) {
    return siteWideMetadata(fixture('b2b-head.html'), json('b2b-metadata.json'), webPath);
}

describe('authoredPageMetadata', () => {
    it('rebuilds the template, robots and title Adobe authored on /customer/account', () => {
        const entries = authoredPageMetadata(
            fixture('b2b-customer-account.html'),
            fixture('b2b-customer-account.plain.html'),
            b2bSiteWide('/customer/account'),
        );

        expect(entries).toEqual([
            { key: 'Title', value: 'My Account' },
            { key: 'Template', value: 'My Account, Columns' },
            { key: 'Robots', value: 'noindex, nofollow' },
        ]);
    });

    it('rebuilds cache-control as an author would type it on /checkout', () => {
        const entries = authoredPageMetadata(
            fixture('b2b-checkout.html'),
            fixture('b2b-checkout.plain.html'),
            b2bSiteWide('/checkout'),
        );

        expect(entries).toEqual([
            { key: 'Title', value: 'Checkout' },
            { key: 'Robots', value: 'noindex, nofollow' },
            { key: 'Cache Control', value: 'no-store' },
        ]);
    });

    it('rebuilds nothing for a page with no authored metadata (title and description derived)', () => {
        const entries = authoredPageMetadata(
            fixture('bodea-footer.html'),
            fixture('bodea-footer.plain.html'),
            siteWideMetadata(fixture('b2b-head.html'), undefined, '/footer'),
        );

        expect(entries).toStrictEqual([]);
    });

    it('treats a title that is the first block name as derived (/customer/nav: "Commerce Account Nav")', () => {
        const entries = authoredPageMetadata(
            fixture('b2b-customer-nav.html'),
            fixture('b2b-customer-nav.plain.html'),
            b2bSiteWide('/customer/nav'),
        );

        expect(entries).toStrictEqual([]);
    });

    it('leaves out what the site sheet supplies for the URL, keeps what the page wrote', () => {
        const webPath = '/products/adobe-product-logo-socks/adb261';
        const entries = authoredPageMetadata(
            fixture('citisignal-product-adb261.html'),
            fixture('citisignal-product-adb261.plain.html'),
            siteWideMetadata(
                fixture('b2b-head.html'),
                json('citisignal-metadata-adb261-row.json'),
                webPath,
            ),
        );

        expect(entries).toEqual([{ key: 'Breadcrumb', value: 'auto' }]);
    });

    it('leaves out the tags head.html writes (viewport) even without a sheet', () => {
        const withoutHeadHtml = authoredPageMetadata(
            fixture('b2b-checkout.html'),
            fixture('b2b-checkout.plain.html'),
            siteWideMetadata('', undefined, '/checkout'),
        );

        // Control: with no head.html to subtract, viewport reads as the page's own.
        expect(withoutHeadHtml).toContainEqual({
            key: 'Viewport',
            value: 'width=device-width, initial-scale=1.0',
        });
        expect(
            authoredPageMetadata(
                fixture('b2b-checkout.html'),
                fixture('b2b-checkout.plain.html'),
                b2bSiteWide('/checkout'),
            ).map((e) => e.key),
        ).not.toContain('Viewport');
    });
});

describe('siteWideMetadata', () => {
    // The sheet example documented on `Modifiers.fromModifierSheet` in
    // adobe/helix-html-pipeline `src/utils/modifiers.js`: key/value rows and
    // named columns, a `/*` glob and an exact URL.
    const HELIX_DOC_SHEET = {
        data: [
            { URL: '/*', key: 'A', value: 'B', Title: '', Description: '' },
            { URL: '/*', key: 'C', value: 'D', Title: '', Description: '' },
            { URL: '/f', key: '', value: '', Title: 'Hero', Description: 'Once upon...' },
        ],
    };

    it('matches glob and exact rows the way Helix does', () => {
        expect(siteWideMetadata('', HELIX_DOC_SHEET, '/f').sheetValues).toEqual({
            a: 'B',
            c: 'D',
            title: 'Hero',
            description: 'Once upon...',
        });
        expect(siteWideMetadata('', HELIX_DOC_SHEET, '/g').sheetValues).toEqual({ a: 'B', c: 'D' });
    });

    it('treats a missing or malformed sheet as supplying nothing', () => {
        expect(siteWideMetadata('', undefined, '/x').sheetValues).toStrictEqual({});
        expect(siteWideMetadata('', { nope: true }, '/x').sheetValues).toStrictEqual({});
    });
});

describe('appendMetadataBlock', () => {
    it('adds a metadata block, in the same shape as the section-metadata blocks, to the last section', () => {
        const plain = fixture('b2b-customer-account.plain.html');

        const out = appendMetadataBlock(plain, [
            { key: 'Template', value: 'My Account, Columns' },
            { key: 'Robots', value: 'noindex, nofollow' },
        ]);

        const block =
            '<div class="metadata">' +
            '<div><div>Template</div><div>My Account, Columns</div></div>' +
            '<div><div>Robots</div><div>noindex, nofollow</div></div>' +
            '</div>';
        // Inside the last section, i.e. just before its closing tag.
        expect(out).toBe(`${plain.slice(0, plain.lastIndexOf('</div>'))}${block}</div>\n`);
    });

    it('escapes a value so it stays text', () => {
        const out = appendMetadataBlock('<div><p>x</p></div>', [{ key: 'Title', value: 'A & <B>' }]);

        expect(out).toContain('<div>A &amp; &lt;B&gt;</div>');
    });

    it('opens a section when the page has none', () => {
        expect(appendMetadataBlock('', [{ key: 'Robots', value: 'noindex' }])).toBe(
            '<div><div class="metadata"><div><div>Robots</div><div>noindex</div></div></div></div>',
        );
    });

    it('returns the page unchanged when there is nothing to rebuild', () => {
        const plain = fixture('bodea-footer.plain.html');
        expect(appendMetadataBlock(plain, [])).toBe(plain);
    });
});
