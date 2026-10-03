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
