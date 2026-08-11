/**
 * The masthead band's height, asserted against the STYLESHEET.
 *
 * jsdom resolves no layout — no computed heights, no flex — so a rendering test
 * cannot tell a stacked band from a single-line one. It would pass either way.
 * `ProjectCard.test.tsx` hit the same wall and reads the CSS directly; this does
 * the same for the same reason.
 *
 * The badges STACK, deliberately. A 2026-07-09 commit made them a column so the
 * values line up ("READY" under "ADOBE DEMO SYSTEM" starting at the same x), and
 * that alignment is the point — it is what makes two facts scannable as a pair
 * rather than a sentence.
 *
 * A stale markup comment claimed the opposite ("a single horizontal row… instead
 * of stacking") and briefly got the CSS flattened to match it. Wrong direction:
 * the comment predated the decision and was the thing out of date. Both now say
 * stacked, and this test pins it so the comment can never win that argument again.
 *
 * What the band should NOT spend is padding. It is ambient context — two short
 * facts about the environment — so the stack sits close to its own edges.
 */

import * as fs from 'fs';
import * as path from 'path';

const CSS = fs.readFileSync(
    path.join(__dirname, '../../../../../src/core/ui/styles/custom-spectrum.css'),
    'utf8'
);

/** The declarations of one top-level rule, comments stripped. */
function rule(selector: string): string {
    const start = CSS.indexOf(`${selector} {`);
    expect(start).toBeGreaterThan(-1);
    return CSS.slice(start, CSS.indexOf('}', start)).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('dashboard status band — vertical cost', () => {
    it('STACKS the badges, so their values line up', () => {
        const badges = rule('.dashboard-status-badges');

        expect(badges).toMatch(/flex-direction:\s*column/);
        expect(badges).not.toMatch(/flex-direction:\s*row/);
    });

    it('keeps the two rows tight against each other', () => {
        // The stack is the point; the space between its rows is not.
        expect(rule('.dashboard-status-badges')).toMatch(/row-gap:\s*4px/);
    });

    it('keeps the band padding tighter than a real page header', () => {
        // Scoped override: `.page-header-section` is shared with the projects
        // dashboard and integrations screen, which DO head a page and keep the
        // taller rhythm.
        const scoped = rule('.dashboard-status-header .page-header-section');

        expect(scoped).toMatch(/padding-top:\s*4px/);
        expect(scoped).toMatch(/padding-bottom:\s*4px/);
    });

    it('does not reintroduce the tall default on the shared class', () => {
        // Positive control: the shared rule must still be the tall one, or the
        // scoped override above is asserting nothing.
        expect(rule('.page-header-section')).toMatch(/padding-top:\s*24px/);
    });
});
