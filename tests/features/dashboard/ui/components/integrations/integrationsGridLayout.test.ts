/**
 * The integrations grid holds three columns, and every tile is the same size.
 *
 * Two defects, one screenshot:
 *
 * COLUMNS. `minmax(268px, 300px)` needs 3×268 + 2×24 = 852px for three tracks.
 * The left-anchored content band is ~815px on a normal editor width, so it fell
 * to two columns and wrapped the third tile onto its own row — 37px short.
 *
 * HEIGHTS. Rows sized independently — CSS grid equalises heights WITHIN a row,
 * not across rows — so a short last row rendered shorter than a full one. (The
 * dashed add tile made this obvious before it was removed; card heights still
 * need the guarantee.)
 *
 * Both fixed by mirroring `.projects-grid`, which had already solved the column
 * question, plus `grid-auto-rows: 1fr` so rows equalise across the whole grid
 * rather than only within one.
 *
 * Asserted against the STYLESHEET: jsdom resolves no layout, so a rendering test
 * cannot count columns or compare heights and would pass either way. Same
 * technique as pageLeftAnchor.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const CSS = fs
    .readFileSync(
        path.join(__dirname, '../../../../../../src/core/ui/styles/custom-spectrum.css'),
        'utf8'
    )
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

/** px value of a single-valued declaration, e.g. `gap`, `min-height`. */
function px(rule: string, prop: string): number {
    const m = rule.match(new RegExp(`${prop}:\\s*(\\d+(?:\\.\\d+)?)px`));
    expect(m).not.toBeNull();
    return Number(m![1]);
}

/** The MIN of the grid's `minmax()` track. */
function minTrack(rule: string): number {
    const m = rule.match(/minmax\(\s*(\d+(?:\.\d+)?)px/);
    expect(m).not.toBeNull();
    return Number(m![1]);
}

const grid = () => ruleFor('.integrations-grid');

describe('integrations grid — three columns', () => {
    it('uses a min track narrow enough for three columns in the content band', () => {
        // 3 tracks + 2 gaps must fit ~815px: 3*min + 48 <= 815 → min <= 255.
        const min = minTrack(grid());

        expect(min).toBeLessThanOrEqual(255);
        expect(3 * min + 2 * px(grid(), 'gap')).toBeLessThanOrEqual(815);
    });

    it('matches the projects grid, which already solved this', () => {
        const norm = (t: string) => t.replace(/\s+/g, ' ').replace(/\s*!important/g, '').trim();
        const track = (rule: string) =>
            norm(rule.match(/grid-template-columns:[^;]+;/)![0]);

        expect(track(grid())).toBe(track(ruleFor('.projects-grid')));
    });

    it('drops the start-packing the fixed max cap needed', () => {
        // With `1fr` tracks the row is filled by construction; `justify-content:
        // start` only mattered while tracks were capped at 300px.
        expect(grid()).not.toMatch(/justify-content:\s*start/);
    });
});

describe('integrations grid — every tile the same size', () => {
    it('equalises rows, not just tiles within a row', () => {
        // A partial last row must not render shorter than a full one.
        expect(grid()).toMatch(/grid-auto-rows:\s*1fr/);
    });


    it('leaves the projects grid alone — positive control', () => {
        // The fix mirrors that grid; it must not have edited it to agree.
        expect(ruleFor('.projects-grid')).toMatch(/minmax\(240px,\s*1fr\)/);
    });
});
