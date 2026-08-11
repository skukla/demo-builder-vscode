/**
 * Both project-scoped screens anchor their content to the left edge.
 *
 * `.page-container` / `.page-container-padded` centre their content
 * (`margin: auto`) inside a 960px band. On a wide editor that floats a screen in
 * the middle with gaps either side. The project dashboard opted out via a rule
 * scoped to its screen root, and the integrations surface — reachable from that
 * dashboard in one click — did not, so the two disagreed about where content
 * starts: ~32px in on one, centred on the other.
 *
 * The opt-out was bound to `.dashboard-left`, a name describing WHICH screen
 * rather than WHAT it does, so a new screen silently inherited the centred
 * default. The rule's own comment said it existed so "the status badges, org
 * banner, action tiles, and integrations all share the project title's left
 * edge" — written while the integrations grid still lived inside the dashboard.
 * Moving that grid to its own surface left the anchor behind.
 *
 * Renamed to `.page-left-anchored`: a behaviour, not a location, so the next
 * screen can opt in by saying what it wants.
 *
 * Asserted against the STYLESHEET because jsdom resolves no layout — a rendering
 * test cannot tell a centred band from a left-anchored one and would pass either
 * way. Same reason as DashboardStatusHeader-layout.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const CSS = fs.readFileSync(
    path.join(__dirname, '../../../../src/core/ui/styles/custom-spectrum.css'),
    'utf8'
);

/** CSS with comments removed — selector checks must not match prose. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The declarations of the rule whose FULL selector list matches, whitespace
 * normalised.
 *
 * Exact-matching the whole list matters: `.page-left-anchored
 * .page-container-padded` is both a rule of its own AND the tail of the
 * two-selector margin rule above it, so substring search returns the wrong
 * block — which it did, and the test failed against the right CSS.
 */
function ruleFor(selectorList: string): string {
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
    for (const block of CODE.split('}')) {
        const open = block.indexOf('{');
        if (open === -1) continue;
        if (norm(block.slice(0, open)) === norm(selectorList)) {
            return block.slice(open);
        }
    }
    throw new Error(`no rule for: ${selectorList}`);
}

describe('left-anchored page content', () => {
    it('drops the shared auto-centring for both container classes', () => {
        const rule = ruleFor(
            '.page-left-anchored .page-container, .page-left-anchored .page-container-padded'
        );

        expect(rule).toMatch(/margin-left:\s*0/);
        expect(rule).toMatch(/margin-right:\s*0/);
    });

    it('normalises the inset so content lines up under the page title', () => {
        const rule = ruleFor('.page-left-anchored .page-container-padded');

        expect(rule).toMatch(/padding-left:\s*var\(--spectrum-global-dimension-size-400\)/);
        expect(rule).toMatch(/padding-right:\s*var\(--spectrum-global-dimension-size-400\)/);
    });

    it('no longer keys the behaviour to one screen name', () => {
        // `.dashboard-left` described WHICH screen, not what the rule does, which
        // is how the integrations surface came to miss it. Checked against the
        // comment-stripped source: the rule's docblock still NAMES the old class
        // to explain the rename, and that mention is wanted.
        expect(CODE).not.toContain('.dashboard-left');
    });

    it('leaves the shared containers centred by default — positive control', () => {
        // The opt-out must stay an opt-out: the wizard and projects list rely on
        // the centred band, so the base rule keeps its auto margins.
        const base = ruleFor('.page-container-padded');

        expect(base).toMatch(/margin-left:\s*auto/);
    });
});
