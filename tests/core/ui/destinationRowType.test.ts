/**
 * The destination reads at the same size as the count it sits beside.
 *
 * It shares SearchHeader's count row, and that row carried FOUR type treatments:
 *
 *   2 integrations       12px    (.text-sm)
 *   DEPLOYS TO           11px    uppercase, borrowed from the dashboard's badge
 *                                rows, where it sits alone rather than beside a
 *                                12px count
 *   Kukla Mesh · Stage   12.5px  (.dest-context) — matches nothing in the scale
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
    rule.match(/font-size:\s*([^;]+);/)![1].replace(/\s*!important/, '').trim();

describe('destination row type', () => {
    it('sets the label to the count size', () => {
        expect(size(ruleFor('.page-destination-label'))).toBe('12px');
    });

    it('brings the destination value onto the scale, scoped to this row', () => {
        // 12.5px exists nowhere else in the scale.
        expect(size(ruleFor('.page-destination-row .dest-context'))).toBe('12px');
    });

    it('leaves the shared .dest-context alone — the modal is not in scope', () => {
        // Control: scoping means the global rule is untouched.
        expect(size(ruleFor('.dest-context'))).toBe('12.5px');
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
