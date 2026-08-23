/**
 * The destination reads at the same size as the count it sits beside.
 *
 * It shares SearchHeader's count row, and that row carried FOUR type treatments:
 *
 *   2 integrations       12px    (.text-sm)
 *   DEPLOYS TO           11px    uppercase, borrowed from the dashboard's badge
 *                                rows, where it sits alone rather than beside a
 *                                12px count
 *   Demo Mesh · Stage   12.5px  (.dest-context) — matches nothing in the scale
 *   Change               12px    (.inline-action-link)
 *
 * 11 / 12 / 12.5 / 12 on one line is what "slightly off" was.
 *
 * One size for the row; the three roles separate by COLOUR instead — dim label,
 * darker value, blue action. The label also drops to sentence case, matching the
 * casing settled earlier ("Commerce scope", not "Commerce Scope"), which makes
 * the row read as a phrase rather than a label/value pair.
 *
 * `.dest-context` is scoped rather than changed globally: the add-integration
 * modal renders the same component and is not part of this comparison.
 *
 * Stylesheet-asserted — jsdom resolves no computed type.
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

const size = (rule: string): string =>
    rule
        .match(/font-size:\s*([^;]+);/)![1]
        .replace(/\s*!important/, '')
        .trim();

describe('destination row type', () => {
    it('sets the label to the count size', () => {
        expect(size(ruleFor('.page-destination-label'))).toBe('12px');
    });

    it('puts the destination value on the type scale via the token', () => {
        // Was 12.5px with a 12px override scoped to this row, because the base was
        // off-scale and the add-integration modal renders the same component. The
        // base is on-scale now, so both surfaces get it from one rule — and the
        // token tracks medium/large instead of pinning a px.
        expect(size(ruleFor('.dest-context'))).toBe(
            'var(--spectrum-global-dimension-font-size-75)'
        );
    });

    it('keeps no scoped override, since there is nothing left to correct', () => {
        // A base plus a patch for one of its two surfaces is how the modal ended up
        // half a pixel off the page header. One rule cannot disagree with itself.
        expect(() => ruleFor('.page-destination-row .dest-context')).toThrow(/no rule for/);
    });

    it('reads as a phrase, not a badge label', () => {
        const label = ruleFor('.page-destination-label');

        expect(label).not.toMatch(/text-transform:\s*uppercase/);
        expect(label).not.toMatch(/letter-spacing/);
    });

    it('separates the three roles by colour, since size no longer does', () => {
        expect(ruleFor('.page-destination-label')).toMatch(/gray-500/);
        expect(ruleFor('.dest-context-value')).toMatch(/gray-700/);
        expect(size(ruleFor('.inline-action-link'))).toBe('12px');
    });

    it('matches the count it sits beside — positive control', () => {
        expect(size(ruleFor('.text-sm'))).toBe('12px');
    });
});
