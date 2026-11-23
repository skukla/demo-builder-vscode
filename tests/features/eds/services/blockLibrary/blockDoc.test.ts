/**
 * The block doc, title and list rows exactly as DA.live's Import Blocks writes them
 * (adobe/da-live `blocks/config/blocks-import/blocks.js` `blockDoc`, `placeholderRows`,
 * `displayName`). Expected strings follow Adobe's templates. The list rows deliberately do not
 * follow Import Blocks' `mergeBlockRows` (see `blockSheetRows.ts`).
 */

import {
    blockDoc,
    displayName,
    placeholderRows,
} from '@/features/eds/services/blockLibrary/blockDoc';

const wrap = (main: string): string => `<body><header></header><main>${main}</main><footer></footer></body>`;
const ONE_CELL = '<div><div><p>Column 1 content</p></div></div>';

describe('placeholderRows', () => {
    it('writes rows of "Column N content" cells', () => {
        const row = '<div><div><p>Column 1 content</p></div><div><p>Column 2 content</p></div></div>';

        expect(placeholderRows({ rows: 2, columns: 2 })).toBe(row + row);
    });

    it('writes one cell by default', () => {
        expect(placeholderRows()).toBe(ONE_CELL);
    });
});

describe('blockDoc', () => {
    it('writes one section per variant with the first example of each', () => {
        const doc = blockDoc('cards', {
            examples: [
                { variant: '', html: '<div>A</div>' },
                { variant: 'horizontal', html: '<div>H</div>' },
                { variant: '', html: '<div>B</div>' },
            ],
        });

        expect(doc).toBe(wrap(
            '<div><div class="cards"><div>A</div></div></div>'
            + '<div><div class="cards horizontal"><div>H</div></div></div>',
        ));
    });

    it('adds a placeholder section shaped by the code for a variant with no example', () => {
        const doc = blockDoc('cards', {
            examples: [{ variant: '', html: '<div>A</div>' }],
            analysis: { rows: 1, columns: 2, variants: ['dark'] },
        });

        expect(doc).toBe(wrap(
            '<div><div class="cards"><div>A</div></div></div>'
            + `<div><div class="cards dark">${placeholderRows({ rows: 1, columns: 2 })}</div></div>`,
        ));
    });

    it('writes one plain placeholder section when there is nothing to go on', () => {
        expect(blockDoc('widget')).toBe(wrap(`<div><div class="widget">${ONE_CELL}</div></div>`));
    });

    it('keeps an empty example as is (the real checkout table)', () => {
        const html = '<div>\n      <div></div>\n      <div></div>\n    </div>';

        expect(blockDoc('commerce-checkout', { examples: [{ variant: '', html }] }))
            .toBe(wrap(`<div><div class="commerce-checkout">${html}</div></div>`));
    });
});

describe('displayName', () => {
    it('capitalises the first letter of each hyphenated word, as Adobe writes it', () => {
        expect(displayName('hero-banner')).toBe('Hero Banner');
        expect(displayName('commerce-b2b-po-header')).toBe('Commerce B2b Po Header');
    });
});
