/**
 * Page content is LEFT-ALIGNED by default, and lines up with the page title.
 *
 * The `--content-width` docblock has always claimed this — "the canonical,
 * LEFT-ALIGNED content width shared across ALL wizard/app screens" — and the
 * wizard's `.content-column` implements it: a max-width cap with no auto
 * margins. But the shared `.page-container` / `.page-container-padded` centred
 * their content, contradicting the stated intent.
 *
 * Screens coped individually. The project dashboard added an opt-out scoped to
 * its own root; the integrations surface inherited the centred default when its
 * grid moved out of that dashboard; the projects list and Prompt Library never
 * opted out at all. One design, two unpatched holes, and a wizard that centred
 * its header while left-aligning its body.
 *
 * Fixed at the default rather than by spreading the opt-out: a new screen now
 * gets canonical behaviour by doing nothing, which is the only version that
 * cannot rot. The opt-out class is gone.
 *
 * The second half is the INSET. `PageHeader` pads its content by size-400 (32px)
 * while `.page-container-padded` used 16px, so body content sat 16px left of the
 * title on every screen that did not override it. The opt-out had been silently
 * correcting that too.
 *
 * Asserted against the STYLESHEET because jsdom resolves no layout — a rendering
 * test cannot tell a centred band from a left-anchored one, and would pass
 * against either.
 */

import * as fs from 'fs';
import * as path from 'path';

const CSS = fs
    .readFileSync(path.join(__dirname, '../../../src/core/ui/styles/custom-spectrum.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** Declarations of the rule whose FULL selector list matches, whitespace normalised. */
function ruleFor(selectorList: string): string {
    const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
    for (const block of CSS.split('}')) {
        const open = block.indexOf('{');
        if (open === -1) continue;
        if (norm(block.slice(0, open)) === norm(selectorList)) return block.slice(open);
    }
    throw new Error(`no rule for: ${selectorList}`);
}

describe('page content alignment', () => {
    it.each(['.page-container', '.page-container-padded'])(
        '%s does not centre its content',
        (selector) => {
            const rule = ruleFor(selector);

            expect(rule).not.toMatch(/margin-left:\s*auto/);
            expect(rule).not.toMatch(/margin-right:\s*auto/);
        }
    );

    it('insets the body to match the page title', () => {
        // PageHeader pads its content by size-400; anything else leaves the body
        // and the title on different vertical lines.
        const rule = ruleFor('.page-container-padded');

        expect(rule).toMatch(/padding-left:\s*var\(--spectrum-global-dimension-size-400\)/);
        expect(rule).toMatch(/padding-right:\s*var\(--spectrum-global-dimension-size-400\)/);
    });

    it('still caps the band at the canonical width', () => {
        // Positive control: left-aligning must not mean full-bleed. The cap is
        // the whole reason --content-width exists.
        expect(ruleFor('.page-container')).toMatch(/max-width:\s*var\(--content-width\)/);
        expect(ruleFor('.page-container-padded')).toMatch(/max-width:\s*var\(--content-width\)/);
    });

    it('needs no per-screen opt-out any more', () => {
        // `.page-left-anchored` (formerly `.dashboard-left`) existed only because
        // the default was wrong. Keeping it would leave the trap that let the
        // integrations surface ship centred.
        expect(CSS).not.toContain('page-left-anchored');
        expect(CSS).not.toContain('dashboard-left');
    });

    it('agrees with the wizard, which was right all along', () => {
        // .content-column has always been max-width + no auto margins.
        const wizard = ruleFor('.content-column');

        expect(wizard).toMatch(/max-width:\s*var\(--content-width\)/);
        expect(wizard).not.toMatch(/margin-left:\s*auto/);
    });
});
