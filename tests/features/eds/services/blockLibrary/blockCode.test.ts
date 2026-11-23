/**
 * Guessing a block's table shape from its code, as DA.live's Import Blocks does
 * (adobe/da-live `blocks/config/blocks-import/github.js` `cssVariants`, `jsShape`, `analyzeBlock`).
 * Expectations follow Adobe's regexes.
 */

import {
    analyzeBlockCode,
    cssVariants,
    jsShape,
} from '@/features/eds/services/blockLibrary/blockCode';

describe('cssVariants', () => {
    it('reads `.name.variant` selectors once each, in order', () => {
        const css = '.cards.horizontal { } .cards.horizontal > div { } .cards.two-up { }';

        expect(cssVariants(css, 'cards')).toEqual(['horizontal', 'two-up']);
    });

    it('skips classes that are not valid block names and other blocks\' selectors', () => {
        const css = '.cards.Wide { } .cards.x_y { } .hero.dark { } .cards .inner { }';

        expect(cssVariants(css, 'cards')).toStrictEqual([]);
    });

    it('gives none for missing CSS', () => {
        expect(cssVariants(undefined, 'cards')).toStrictEqual([]);
    });
});

describe('jsShape', () => {
    it('counts columns from the highest row.children index', () => {
        expect(jsShape('const c = row.children[0]; const d = row.children[2];')).toEqual({ rows: 1, columns: 3 });
    });

    it('reads a loop over the block\'s rows as 2 rows', () => {
        expect(jsShape('[...block.children].forEach((r) => r);')).toEqual({ rows: 2, columns: 1 });
    });

    it('reads a spread of a row\'s children as 2 columns', () => {
        expect(jsShape('block.querySelectorAll(\':scope > div\'); [...row.children].map(f);'))
            .toEqual({ rows: 2, columns: 2 });
    });

    it('gives one cell for missing JS', () => {
        expect(jsShape(undefined)).toEqual({ rows: 1, columns: 1 });
    });
});

describe('analyzeBlockCode', () => {
    it('reads blocks/<id>/<id>.js and .css and combines shape and variants', async () => {
        const files: Record<string, string> = {
            'blocks/cards/cards.js': '[...block.children].forEach((row) => row.children[1]);',
            'blocks/cards/cards.css': '.cards.horizontal { }',
        };
        const readFile = jest.fn(async (path: string) => files[path]);

        await expect(analyzeBlockCode('cards', readFile)).resolves.toEqual({
            rows: 2, columns: 2, variants: ['horizontal'],
        });
        expect(readFile.mock.calls.map(([path]) => path).sort())
            .toEqual(['blocks/cards/cards.css', 'blocks/cards/cards.js']);
    });

    it('gives one cell and no variants when the block has no code files', async () => {
        await expect(analyzeBlockCode('empty', async () => undefined)).resolves.toEqual({
            rows: 1, columns: 1, variants: [],
        });
    });
});
