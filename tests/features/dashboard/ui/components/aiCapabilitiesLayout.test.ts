/**
 * AI Capabilities modal — layout guarantees that only the stylesheet can carry.
 *
 * Two defects, one screenshot (2026-08-12):
 *
 * HIDDEN CONTENT. The body is a fixed-height scroll region. With 21 skills the
 * list was cut mid-group at `sync-changes` — the 12th Demo Builder skill and the
 * entire second group sat below the fold. macOS overlay scrollbars do not paint
 * at rest, so the header said 21 and the eye saw 11 with no affordance at all.
 * Fixed by giving the body two columns, which roughly halves its height and uses
 * the horizontal space the modal already had.
 *
 * FLAT HIERARCHY. `.ai-skills-group-header`'s comment claims "section > group >
 * names", but the section heading carried `.text-sm` (12px) and the group header
 * is also 12px/600 — identical size AND weight, separated only by colour.
 *
 * Asserted against the STYLESHEET: jsdom resolves no layout, so a rendering test
 * cannot compare column counts or font sizes and would pass either way. Same
 * technique as integrationsGridLayout.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const CSS = fs
    .readFileSync(
        path.join(__dirname, '../../../../../src/core/ui/styles/custom-spectrum.css'),
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

/** px value of a single-valued declaration. */
function px(rule: string, prop: string): number {
    const m = rule.match(new RegExp(`${prop}:\\s*(\\d+(?:\\.\\d+)?)px`));
    expect(m).not.toBeNull();
    return Number(m![1]);
}

describe('skill GROUPS run in two columns — the thing that stops the cut-off', () => {
    // Deliberately on the groups, not on the two sections. Sections side by side
    // was the first attempt and barely helped: skills is the tall section, so a
    // 3-row MCP list beside a 21-row skills list takes the height from 3 + 21 to
    // max(3, 21). Three rows saved. Splitting the groups is what halves it.
    it('lays the groups out in two equal tracks', () => {
        const rule = ruleFor('.ai-skills-scroll');

        expect(rule).toMatch(/display:\s*grid/);
        // minmax(0, 1fr) rather than 1fr: a long skill name must shrink its track
        // instead of forcing the grid wider than the dialog.
        expect(rule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
    });

    it('separates the columns by a visible gutter', () => {
        // Shorthand `gap: <row> <column>` — the column gutter is the second value.
        const m = ruleFor('.ai-skills-scroll').match(/gap:\s*\d+px\s+(\d+)px/);
        expect(m).not.toBeNull();
        expect(Number(m![1])).toBeGreaterThanOrEqual(16);
    });

    it('lets each group start at the top rather than stretching to match', () => {
        // Without this a short group stretches to its tall neighbour's height,
        // which reads as an empty box under the names.
        expect(ruleFor('.ai-skills-scroll')).toMatch(/align-items:\s*start/);
    });

    it('keeps the two SECTIONS stacked, not side by side — regression guard', () => {
        // Re-introducing section columns would undo the reasoning above.
        expect(ruleFor('.ai-capabilities-columns')).not.toMatch(/display:\s*grid/);
    });
});

describe('the scroll region advertises that it scrolls', () => {
    // macOS paints overlay scrollbars only WHILE scrolling, so a bounded region
    // at rest looks like a complete list. That is how 10 of 21 skills went
    // missing with no affordance. Nothing else in this app styles a scrollbar,
    // so this is the first — a persistent bar rather than a fade, because a
    // static fade keeps promising more content after you reach the bottom.
    it('gives the body a scrollbar wide enough to see', () => {
        expect(
            px(ruleFor('.ai-capabilities-body::-webkit-scrollbar'), 'width')
        ).toBeGreaterThanOrEqual(8);
    });

    it('paints the thumb, so the bar is visible at rest and not just a gutter', () => {
        expect(ruleFor('.ai-capabilities-body::-webkit-scrollbar-thumb')).toMatch(
            /background:\s*var\(--spectrum-global-color-gray-\d+\)/
        );
    });

    it('keeps the body bounded — a scrollbar with nothing to scroll proves nothing', () => {
        expect(ruleFor('.ai-capabilities-body')).toMatch(/overflow-y:\s*auto/);
        expect(px(ruleFor('.ai-capabilities-body'), 'max-height')).toBeGreaterThan(0);
    });
});

describe('typography matches the rest of the app', () => {
    // The AI modal was the outlier: 9 uses of `.text-sm` (12px) against 1 in
    // ManageApisModal, where body copy is bare Spectrum <Text> at default size.
    // That is why it read as denser and smaller than every other modal.
    it('sizes the section heading like the house section header', () => {
        // .config-section-header is the app's section convention (ConfigureScreen).
        expect(px(ruleFor('.ai-section-heading'), 'font-size')).toBeGreaterThanOrEqual(16);
    });

    it('underlines the section heading, as the house header does', () => {
        expect(ruleFor('.ai-section-heading')).toMatch(/border-bottom:\s*1px solid/);
    });
});

describe('the capabilities link holds still', () => {
    // It used to sit after the AI StatusCard on the same line, so its x was that
    // card's width and it moved with the status text. Reserving width for the
    // text could not fix it: the Regenerate remediation renders INSIDE the card,
    // after the text, so an unhealthy AI badge displaced the link regardless.
    // It now has its own line and no horizontal neighbour at all.
    it('indents the link to the status column, under the value it continues', () => {
        // 102px = dot (6, size="S") + gap (8) + the 80px label reservation + gap (8),
        // i.e. exactly where the status text starts.
        expect(px(ruleFor('.dashboard-status-capabilities-link'), 'margin-left')).toBe(102);
    });

    it('leaves the label column rule alone — positive control', () => {
        // The indent is derived FROM that reservation; it must not have been
        // achieved by changing it.
        expect(px(ruleFor('.dashboard-status-badges .status-label'), 'min-width')).toBe(80);
    });

    it('drops the inline wrapper rather than leaving it behind', () => {
        // The link was that wrapper's only reason to exist. No soft deprecation.
        expect(() => ruleFor('.dashboard-status-badge-inline')).toThrow();
    });
});

describe('section headings outrank group headings', () => {
    it('renders a section heading LARGER than a group header', () => {
        // The whole point of the section/group/name hierarchy. These were both
        // 12px, so the two levels were indistinguishable by size.
        const section = px(ruleFor('.ai-section-heading'), 'font-size');
        const group = px(ruleFor('.ai-skills-group-header'), 'font-size');

        expect(section).toBeGreaterThan(group);
    });

    it('keeps the group header quiet — no heavier than the section heading', () => {
        const weight = (rule: string) => Number(rule.match(/font-weight:\s*(\d+)/)![1]);

        expect(weight(ruleFor('.ai-skills-group-header'))).toBeLessThanOrEqual(
            weight(ruleFor('.ai-section-heading'))
        );
    });

    it('leaves the group header sticky — positive control', () => {
        // The fix must not cost the pinning behaviour the flat list depends on.
        expect(ruleFor('.ai-skills-group-header')).toMatch(/position:\s*sticky/);
    });
});
