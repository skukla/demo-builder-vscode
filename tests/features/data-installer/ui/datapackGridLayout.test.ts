/**
 * The datapack grid holds three columns in the content band, like its peers.
 *
 * A third card grid joins `.projects-grid` and `.integrations-grid`, and it must
 * satisfy the same measured constraint: three tracks plus two gaps have to fit
 * the ~815px left-anchored content band. The integrations grid shipped with
 * `minmax(268px, 300px)` — 852px for three tracks, 37px short — and fell to two
 * columns with the third tile alone on its own row.
 *
 * Asserted against the STYLESHEETS, the technique `integrationsGridLayout.test.ts`
 * established: jsdom resolves no layout, so a rendering test cannot count columns
 * and would pass whatever the values were.
 *
 * This is also why the three numbers are literals in the CSS rather than shared
 * custom properties. A `var()` reads better but moves the value out of the rule,
 * where this parser cannot see it — the drift these grids could suffer is
 * prevented by these tests, not by a token.
 */

import { ruleFor as ruleAnywhere } from '../../../helpers/cssRules';

/**
 * Read the rule from WHEREVER it ships, not from a named sheet.
 *
 * This suite read `custom-spectrum.css` by path and hand-rolled its own `ruleFor`.
 * It broke when `.projects-*` and `.integrations-*` moved to shared-ui.css — a
 * change that moved no pixel on any surface. The shared helper reads every
 * stylesheet under `src/`, so a rule's LOCATION stops being something a layout
 * test asserts.
 */




/**
 * The sheet argument is gone — the helper reads every stylesheet under src/.
 * The call sites keep their shape so the assertions below are untouched; the
 * first argument now only records which sheet the rule USED to be read from.
 */
const ruleFor = (_sheet: 'feature' | 'shared', selectorList: string): string =>
    ruleAnywhere(selectorList);
const FEATURE_CSS = 'feature' as const;
const SHARED_CSS = 'shared' as const;

/** px value of a single-valued declaration, e.g. `gap`. */
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

const grid = () => ruleFor(FEATURE_CSS, '.datapack-grid');

describe('datapack grid — three columns', () => {
    it('uses a min track narrow enough for three columns in the content band', () => {
        // 3 tracks + 2 gaps must fit ~815px: 3*min + 48 <= 815 → min <= 255.
        const min = minTrack(grid());

        expect(min).toBeLessThanOrEqual(255);
        expect(3 * min + 2 * px(grid(), 'gap')).toBeLessThanOrEqual(815);
    });

    it('reflows by width rather than pinning a column count', () => {
        // A fixed count is what `GridLayout columns={3}` gave, and it cannot
        // narrow: at a narrow editor width the cards squeeze instead of wrapping.
        expect(grid()).toMatch(/repeat\(\s*auto-fill/);
    });

    it('matches the projects grid, which already solved this', () => {
        const norm = (t: string) => t.replace(/\s+/g, ' ').replace(/\s*!important/g, '').trim();
        const track = (rule: string) => norm(rule.match(/grid-template-columns:[^;]+;/)![0]);

        expect(track(grid())).toBe(track(ruleFor(SHARED_CSS, '.projects-grid')));
    });

    it('leaves the shared grids alone — positive control', () => {
        // This grid mirrors those; it must not have edited them to agree.
        expect(ruleFor(SHARED_CSS, '.projects-grid')).toMatch(/minmax\(240px,\s*1fr\)/);
        expect(ruleFor(SHARED_CSS, '.integrations-grid')).toMatch(/minmax\(240px,\s*1fr\)/);
    });
});
