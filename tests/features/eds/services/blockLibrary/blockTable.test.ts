/**
 * Every instance of a block on a `.plain.html` page, as DA.live's Import Blocks takes it
 * (adobe/da-live `blocks/config/blocks-import/blocks.js` `blockExamples`): the variant is the
 * block's other valid classes, the html is the block's inner HTML with active content dropped.
 * Real pages captured 2026-11-23 (tests/fixtures/eds/block-library/README.md).
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
    blockExamplesFromPlainHtml,
    isBlockName,
    pageBlocks,
} from '@/features/eds/services/blockLibrary/blockTable';

const FIXTURES = resolve(__dirname, '../../../../fixtures/eds/block-library');
const readPage = (name: string): string => readFileSync(resolve(FIXTURES, name), 'utf8');

const count = (text: string, needle: string): number => text.split(needle).length - 1;

describe('blockExamplesFromPlainHtml', () => {
    it('gives the real checkout block as one empty table, inner HTML only', () => {
        const page = readPage('b2b-checkout.plain.html');

        expect(blockExamplesFromPlainHtml(page, 'commerce-checkout')).toEqual([{
            variant: '',
            html: '<div>\n      <div></div>\n      <div></div>\n    </div>',
        }]);
    });

    it('keeps every settings row of the real cart block', () => {
        const [example] = blockExamplesFromPlainHtml(readPage('b2b-cart.plain.html'), 'commerce-cart');

        expect(example.variant).toBe('');
        for (const label of ['Enable Item Quantity Update', 'Checkout URL', 'Undo Remove Item']) {
            expect(example.html).toContain(label);
        }
        // 12 rows of one row div and two cell divs; the block div itself is not included
        expect(count(example.html, '<div')).toBe(12 * 3);
        expect(count(example.html, '</div>')).toBe(12 * 3);
    });

    it('gives every instance in page order, each with its variant, and drops scripts', () => {
        const examples = blockExamplesFromPlainHtml(readPage('cards-variants.plain.html'), 'cards');

        expect(examples).toEqual([
            { variant: '', html: '<div>\n      <div><p>First card</p></div>\n    </div>' },
            { variant: 'horizontal', html: '<div>\n      <div><p>Wide card</p></div>\n    </div>' },
            { variant: '', html: '<div>\n      <div><p>Second plain card</p></div>\n    </div>' },
        ]);
    });

    it('keeps only variant classes that are valid block names, joined by a space', () => {
        const html = '<div><div class="cards Wide horizontal two-up"><div>A</div></div></div>';

        expect(blockExamplesFromPlainHtml(html, 'cards')).toEqual([
            { variant: 'horizontal two-up', html: '<div>A</div>' },
        ]);
    });

    it('takes only blocks directly inside a section, not divs nested in a block', () => {
        const html = '<div><div class="hero"><div><div class="cards">x</div></div></div></div>'
            + '<div class="cards"><div>top level is a section</div></div>';

        expect(blockExamplesFromPlainHtml(html, 'cards')).toStrictEqual([]);
    });

    it('drops Adobe\'s DROP elements with their content and unwraps pending additions', () => {
        const html = '<div><div class="cards"><div><div><p>a</p><table><tr><td>t</td></tr></table>'
            + '<da-loc-added><b>kept</b></da-loc-added><da-loc-deleted>gone</da-loc-deleted>'
            + '<form><input></form><button>b</button></div></div></div></div>';

        expect(blockExamplesFromPlainHtml(html, 'cards')).toEqual([
            { variant: '', html: '<div><div><p>a</p><b>kept</b></div></div>' },
        ]);
    });

    it('does not match a longer id that starts with the same text', () => {
        expect(blockExamplesFromPlainHtml('<div><div class="cards-item">x</div></div>', 'cards'))
            .toStrictEqual([]);
    });

    // Real-use examples are copied from other people's public sites into the SC's site, so what
    // Adobe's isSafeUrl and a DA round trip remove has to be removed here (step-02.md).
    describe('safety of copied examples', () => {
        const inCards = (cell: string): string =>
            `<div><div class="cards"><div><div>${cell}</div></div></div></div>`;
        const cellOf = (cell: string): string =>
            blockExamplesFromPlainHtml(inCards(cell), 'cards')[0].html;
        const cardsCell = (inner: string): string => `<div><div>${inner}</div></div>`;

        it('removes every event-handler attribute and keeps the others', () => {
            const html = '<p onclick="steal()" class="x" ONMOUSEOVER="x()">a</p>'
                + '<img src="/a.png" onerror="steal()" alt="b">';

            expect(cellOf(html)).toBe(cardsCell('<p class="x">a</p><img src="/a.png" alt="b" />'));
        });

        it('unwraps a link whose URL is not http(s), mailto or tel, keeping its text', () => {
            const html = '<p><a href="javascript:alert(1)">one</a> <a href="data:text/html,x">two</a>'
                + ' <a href="java\tscript:x()">three</a> <a href="java&#115;cript:x()">four</a></p>';

            expect(cellOf(html)).toBe(cardsCell('<p>one two three four</p>'));
        });

        it('keeps links that are relative, anchors, http(s), mailto or tel', () => {
            const html = '<p><a href="/cart">a</a><a href="#top">b</a><a href="https://x.test/p">c</a>'
                + '<a href="mailto:a@x.test">d</a><a href="tel:+1">e</a><a href="HTTP://x.test">f</a></p>';

            expect(cellOf(html)).toBe(cardsCell(html));
        });

        it('removes an image or a picture source with an unsafe URL', () => {
            const html = '<picture><source srcset="/a.webp 1x, javascript:x() 2x" />'
                + '<source srcset="/b.webp" /><img src="data:image/svg+xml,x" /></picture>'
                + '<img src="/kept.png" />';

            expect(cellOf(html)).toBe(
                cardsCell('<picture><source srcset="/b.webp" /></picture><img src="/kept.png" />'),
            );
        });

        it('cleans the examples the real-use index reads too', () => {
            const [block] = pageBlocks(inCards('<a href="vbscript:x" onclick="y()">t</a>'));

            expect(block.html).toBe(cardsCell('t'));
        });
    });

    it('gives an empty list when the block is absent', () => {
        expect(blockExamplesFromPlainHtml(readPage('b2b-cart.plain.html'), 'hero')).toStrictEqual([]);
    });
});

describe('isBlockName', () => {
    it('accepts lowercase words joined by single hyphens and nothing else', () => {
        expect(['cards', 'commerce-b2b-po-header', 'h2'].every(isBlockName)).toBe(true);
        expect(['Cards', 'cards--x', '-cards', 'cards_x', ''].some(isBlockName)).toBe(false);
    });
});
