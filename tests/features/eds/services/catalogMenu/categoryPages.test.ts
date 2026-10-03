/**
 * Category pages — one DA.live page per Commerce category (EDS-24).
 *
 * The page recipe is the boilerplate's own `/apparel` page, read from
 * `main--boilerplate-aco--adobe-commerce.aem.live/apparel.plain.html` on 2026-10-01
 * (recorded in `.rptc/backlog/2026-10-01-category-pages-and-nav-from-the-commerce-tree.md`):
 * an `<h1>` with the category name and one `product-list-page` block whose single row
 * is `urlPath | <the category's url path>`.
 *
 * The DA.live document wrapper (`<body><header></header><main><div>…</div></main>
 * <footer></footer></body>`, direct children of `<main>` are sections) is the one the
 * extension already writes in `daLiveAccountChrome.ts` and `daLiveBlockLibraryOperations.ts`.
 */

import {
    categoryPageHtml,
    planCategoryPages,
} from '@/features/eds/services/catalogMenu/categoryPages';
import type { CatalogCategory } from '@/features/eds/services/catalogMenu/categoryPages';

const category = (over: Partial<CatalogCategory>): CatalogCategory => ({
    id: '41',
    name: 'Safety Signs',
    urlPath: 'safety-signs',
    ...over,
});

describe('categoryPageHtml', () => {
    it('is the boilerplate recipe: the name as the heading and one product-list-page block on the url path', () => {
        expect(categoryPageHtml('Safety Signs', 'safety-signs')).toBe(
            '<body><header></header><main><div>' +
                '<h1>Safety Signs</h1>' +
                '<div class="product-list-page"><div><div>urlPath</div><div>safety-signs</div></div></div>' +
                '</div></main><footer></footer></body>',
        );
    });

    it('escapes a category name so it cannot become markup', () => {
        expect(categoryPageHtml('Cabinets & <Cans>', 'cabinets')).toContain(
            '<h1>Cabinets &amp; &lt;Cans&gt;</h1>',
        );
    });
});

describe('planCategoryPages', () => {
    it('plans one page per category, at the category url path', () => {
        const plan = planCategoryPages([
            category({}),
            category({ id: '42', name: 'Exit Signs', urlPath: 'safety-signs/exit-signs' }),
        ]);

        expect(plan.pages.map((p) => p.path)).toEqual(['/safety-signs', '/safety-signs/exit-signs']);
        expect(plan.pages[1].html).toContain('<h1>Exit Signs</h1>');
        expect(plan.unsafe).toStrictEqual([]);
    });

    it('skips, and reports, a url path the CDN would not serve rather than encoding it', () => {
        // aem.live serves path segments in [a-z0-9_-] only and 404s percent-encoded
        // ones (eds-publish-and-config rule 8), so such a page would be unreachable.
        const plan = planCategoryPages([
            category({ id: '7', name: 'Sale', urlPath: 'Sale%20Items' }),
            category({ id: '8', name: 'Cans', urlPath: 'cans.html' }),
            category({ id: '9', name: 'Ok', urlPath: 'ok' }),
        ]);

        expect(plan.pages.map((p) => p.path)).toEqual(['/ok']);
        expect(plan.unsafe.map((u) => u.name)).toEqual(['Sale', 'Cans']);
    });

    it('plans a path once even if two categories claim it', () => {
        const plan = planCategoryPages([category({}), category({ id: '99' })]);

        expect(plan.pages).toHaveLength(1);
    });

    it('ignores a category with no url path (the store root has none)', () => {
        const plan = planCategoryPages([category({ urlPath: '' }), category({ id: '2', urlPath: 'x' })]);

        expect(plan.pages.map((p) => p.path)).toEqual(['/x']);
        expect(plan.unsafe).toStrictEqual([]);
    });
});
