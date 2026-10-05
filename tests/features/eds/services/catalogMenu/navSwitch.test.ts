/**
 * The nav switch — the content that turns the catalog menu on (EDS-24).
 *
 * Two parts, both content in the nav document: a "Shop the catalog" line in the menu
 * list, and a one-cell `catalog-menu` block table. The block (in the Demo Builder block
 * library) rewrites the line when the header loads the nav. Adding them is a merge into
 * whatever the SC authored; removing them is the undo.
 *
 * The nav documents below use the DA.live source wrapper the extension already writes
 * (`daLiveAccountChrome.ts`); the brand / sections / tools section order is the one the
 * boilerplate header reads (`blocks/header/header.js`, `classes = ['brand', 'sections',
 * 'tools']`). They are NOT captured from a real nav yet — the first live run reads one.
 */

import {
    CATALOG_MENU_LINE,
    addCatalogMenuSwitch,
    readCategoryLinks,
    removeCatalogMenuSwitch,
} from '@/features/eds/services/catalogMenu/navSwitch';

const nav = (list: string, extra = ''): string =>
    '<body><header></header><main>' +
    '<div><p><a href="/">Justrite</a></p></div>' +
    `<div>${list}</div>` +
    '<div><p>Search</p></div>' +
    extra +
    '</main><footer></footer></body>';

const BLOCK_SECTION = '<div><div class="catalog-menu"><div><div></div></div></div></div>';

describe('addCatalogMenuSwitch', () => {
    it('adds the line as the first menu item and the block as its own last section', () => {
        const result = addCatalogMenuSwitch(nav('<ul><li>Custom Signs</li><li>Resources</li></ul>'));

        expect(result.status).toBe('added');
        expect(result.html).toBe(
            nav(
                `<ul><li>${CATALOG_MENU_LINE}</li><li>Custom Signs</li><li>Resources</li></ul>`,
                BLOCK_SECTION,
            ),
        );
    });

    it('keeps a line the SC already typed (named or bare) and only adds the block', () => {
        const list = '<ul><li>Custom Signs</li><li>Shop the catalog: Safety Signs</li></ul>';
        const result = addCatalogMenuSwitch(nav(list));

        expect(result.status).toBe('added');
        expect(result.html).toBe(nav(list, BLOCK_SECTION));
    });

    it('changes nothing when both parts are already there (re-running is safe)', () => {
        const once = addCatalogMenuSwitch(nav('<ul><li>Resources</li></ul>')).html;
        const twice = addCatalogMenuSwitch(once);

        expect(twice.status).toBe('already-present');
        expect(twice.html).toBe(once);
    });

    it('refuses, without changing anything, when the nav has no menu list to put the line in', () => {
        const html = nav('<p>Just a paragraph</p>');
        const result = addCatalogMenuSwitch(html);

        expect(result.status).toBe('no-menu-list');
        expect(result.html).toBe(html);
    });

    it('refuses a document that is not a DA.live page body', () => {
        const result = addCatalogMenuSwitch('<ul><li>Resources</li></ul>');

        expect(result.status).toBe('not-a-page');
    });
});

describe('removeCatalogMenuSwitch', () => {
    it('is the exact undo of add', () => {
        const original = nav('<ul><li>Custom Signs</li><li>Resources</li></ul>');
        const added = addCatalogMenuSwitch(original).html;

        const result = removeCatalogMenuSwitch(added);

        expect(result.status).toBe('removed');
        expect(result.html).toBe(original);
    });

    it('removes every catalog line, named ones too, and leaves hand-typed items alone', () => {
        const html = nav(
            '<ul><li>Custom Signs</li><li><p>Shop the catalog</p></li>' +
                '<li>shop the catalog: Safety Signs</li><li>Resources<ul><li><a href="/g">Guides</a></li></ul></li></ul>',
            BLOCK_SECTION,
        );

        const result = removeCatalogMenuSwitch(html);

        expect(result.html).toBe(
            nav('<ul><li>Custom Signs</li><li>Resources<ul><li><a href="/g">Guides</a></li></ul></li></ul>'),
        );
    });

    it('removes a catalog-menu block the SC moved into another section without removing that section', () => {
        const html = nav(
            '<ul><li>Resources</li></ul><div class="catalog-menu"><div><div></div></div></div>',
        );

        expect(removeCatalogMenuSwitch(html).html).toBe(nav('<ul><li>Resources</li></ul>'));
    });

    it('reports not-present and changes nothing on a nav that never had the switch', () => {
        const html = nav('<ul><li>Resources</li></ul>');
        const result = removeCatalogMenuSwitch(html);

        expect(result.status).toBe('not-present');
        expect(result.html).toBe(html);
    });
});

/**
 * Category → page rows (owner's rule 2026-10-05). A category whose page is not at its
 * own address gets a two-cell row in the `catalog-menu` table: the category's url path,
 * then the page. The rows are authored content — the SC sees them and may type their own.
 * Ours are told from theirs by the record: a row is ours only while it still says
 * exactly what Demo Builder recorded writing.
 */
describe('category → page rows', () => {
    const original = nav('<ul><li>Resources</li></ul>');
    const row = (urlPath: string, path: string): string => `<div><div>${urlPath}</div><div>${path}</div></div>`;
    const SIGNS = { urlPath: 'signs', path: '/safety-signage' };
    const APPAREL = { urlPath: 'apparel', path: '/clothing' };
    const table = (rows: string): string => `<div><div class="catalog-menu"><div><div></div></div>${rows}</div></div>`;

    it('writes the rows into the table it adds, and says which are its own', () => {
        const result = addCatalogMenuSwitch(original, [SIGNS]);

        expect(result.status).toBe('added');
        expect(result.html).toBe(
            nav(`<ul><li>${CATALOG_MENU_LINE}</li><li>Resources</li></ul>`, table(row('signs', '/safety-signage'))),
        );
        expect(result.links).toEqual([SIGNS]);
    });

    it('add then remove returns the nav byte-for-byte', () => {
        const added = addCatalogMenuSwitch(original, [SIGNS, APPAREL]);

        expect(removeCatalogMenuSwitch(added.html, added.links)).toEqual({ html: original, status: 'removed' });
    });

    it('re-running with the same rows changes nothing', () => {
        const once = addCatalogMenuSwitch(original, [SIGNS]);
        const twice = addCatalogMenuSwitch(once.html, [SIGNS], once.links);

        expect(twice.status).toBe('already-present');
        expect(twice.html).toBe(once.html);
        expect(twice.links).toEqual([SIGNS]);
    });

    it('adds a new row and drops one of its own that is no longer wanted', () => {
        const once = addCatalogMenuSwitch(original, [SIGNS]);
        const twice = addCatalogMenuSwitch(once.html, [APPAREL], once.links);

        expect(twice.status).toBe('links-updated');
        expect(readCategoryLinks(twice.html)).toEqual([APPAREL]);
        expect(twice.links).toEqual([APPAREL]);
    });

    it("keeps a row the SC typed, and does not add a second row for that category", () => {
        const typed = nav('<ul><li>Shop the catalog</li></ul>', table(row('Signs', '/our-signs')));

        const result = addCatalogMenuSwitch(typed, [SIGNS, APPAREL]);

        expect(readCategoryLinks(result.html)).toEqual([{ urlPath: 'Signs', path: '/our-signs' }, APPAREL]);
        expect(result.links).toEqual([APPAREL]);
    });

    it('treats a row of ours the SC changed as theirs from then on', () => {
        const once = addCatalogMenuSwitch(original, [SIGNS]);
        const edited = once.html.replace('/safety-signage', '/signs-hub');

        const again = addCatalogMenuSwitch(edited, [SIGNS], once.links);

        expect(again.status).toBe('already-present');
        expect(again.html).toBe(edited);
        expect(again.links).toStrictEqual([]);
    });

    it('removing takes out only its own rows: a typed row keeps its table', () => {
        const once = addCatalogMenuSwitch(original, [SIGNS]);
        const typed = once.html.replace(row('signs', '/safety-signage'), row('signs', '/safety-signage') + row('apparel', '/clothing'));

        const result = removeCatalogMenuSwitch(typed, once.links);

        expect(result.status).toBe('removed-kept-links');
        expect(result.html).toBe(nav('<ul><li>Resources</li></ul>', table(row('apparel', '/clothing'))));
    });

    it('reads rows DA.live has wrapped in paragraphs, and skips rows without two filled cells', () => {
        const html = nav(
            '<ul><li>Resources</li></ul>',
            '<div><div class="catalog-menu"><div><div></div></div>' +
                '<div><div><p>signs</p></div><div><p>/safety-signage</p></div></div>' +
                '<div><div>only one cell</div></div></div></div>',
        );

        expect(readCategoryLinks(html)).toEqual([SIGNS]);
    });
});
