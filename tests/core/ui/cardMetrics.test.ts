/**
 * Project cards and integration cards are literally the same size.
 *
 * Their CSS was already identical — padding 16, min-height 100, min-width 200,
 * gap 8 — and each rule carried a comment claiming to match the other. They
 * still rendered at different heights, because the floor was 100px and only the
 * project card's CONTENT cleared it:
 *
 *   project card      name(20) + summary(17) + runtime(15) + deployment(15)
 *                     + 3 gaps(24) + padding(32)  ~= 123px
 *   integration card  name(20) + status(15) + 1 gap(8) + padding(32) ~= 75px
 *                     -> floored at 100px
 *
 * Matching declarations cannot make two cards the same size when one has twice
 * the rows. A shared FLOOR can, and only a shared floor high enough to clear the
 * richer card's content.
 *
 * The numbers now live in tokens both rules consume, so "matched" is structural
 * rather than a convention two hand-synced rule bodies promise in prose.
 *
 * Asserted against the stylesheet: jsdom resolves no layout, so a rendering test
 * cannot compare heights and would pass against any values.
 */

import * as fs from 'fs';
import * as path from 'path';

const CSS = fs
    .readFileSync(path.join(__dirname, '../../../src/core/ui/styles/custom-spectrum.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

function ruleFor(selectorList: string): string {
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
    for (const block of CSS.split('}')) {
        const open = block.indexOf('{');
        if (open === -1) continue;
        if (norm(block.slice(0, open)) === norm(selectorList)) return block.slice(open);
    }
    throw new Error(`no rule for: ${selectorList}`);
}

const FAMILIES = ['.project-card-spectrum', '.integration-card'];

describe('dashboard card metrics', () => {
    it.each(['min-height', 'min-width', 'padding', 'gap'])(
        'both families read %s from one token',
        (prop) => {
            const values = FAMILIES.map((f) => {
                const m = ruleFor(f).match(new RegExp(`${prop}:\\s*([^;]+);`));
                expect(m).not.toBeNull();
                return m![1].replace(/\s*!important/, '').trim();
            });

            expect(values[0]).toBe(values[1]);
            expect(values[0]).toMatch(/^var\(--card-/);
        }
    );

    it('sets the floor above the richer card content, or the two still differ', () => {
        // ~123px of content in a project card. A floor at or below that leaves
        // the integration card short — which was the whole bug.
        const m = CSS.match(/--card-min-height:\s*(\d+)px/);
        expect(m).not.toBeNull();
        expect(Number(m![1])).toBeGreaterThanOrEqual(124);
    });

    it('leaves the wizard brand card on its own floor — deliberate, not missed', () => {
        // .expandable-brand-card claims the same family and is NOT retokenised:
        // it lives in the package picker, was not part of this comparison, and
        // growing it would change a screen nobody asked about. Pinned so a future
        // "unify the card families" edit is a decision rather than a side effect.
        expect(ruleFor('.expandable-brand-card')).toMatch(/min-height:\s*100px/);
    });
});
