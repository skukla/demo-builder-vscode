/**
 * Where the smart-404 recovery script sits: inline at the end of the code's `404.html`
 * (2026-10-29), and no longer in `scripts/delayed.js`.
 *
 * Adobe's B2B template removed `scripts/delayed.js` on 2026-07-30, so a storefront built on
 * it had no first-visit recovery at all: the install skipped "delayed.js not found". Every
 * template has a `404.html`, Helix serves it for every missing page, and an inline script
 * there needs no helper script of Adobe's and waits for no consent. A storefront that
 * still carries the old copy in `delayed.js` loses it, so the script never runs twice.
 */

import {
    SMART_404_PAGE_MARKER_END,
    SMART_404_PAGE_MARKER_START,
    withoutDelayedJsHandler,
    withRecoveryHandler,
} from '@/features/eds/services/pdp/pdp404Page';
import { buildSmart404Snippet, SMART_404_MARKER_END, SMART_404_MARKER_START } from '@/features/eds/services/pdp/pdp404Snippet';
import { NOT_FOUND } from '../../../../helpers/notFoundPageFixtures';

const HANDLER = buildSmart404Snippet('https://example.test/prepublish-pdp', 'skukla', 'bodea');

/** The page an outcome leaves, or a failure naming the outcome. */
function pageOf(outcome: ReturnType<typeof withRecoveryHandler>): string {
    if (outcome.kind !== 'changed') throw new Error(`expected a change, got ${JSON.stringify(outcome)}`);
    return outcome.html;
}

describe('withRecoveryHandler', () => {
    it("puts the script at the end of the 404 page's body, with the page's CSP nonce", () => {
        const page = pageOf(withRecoveryHandler(NOT_FOUND, HANDLER));

        const start = page.indexOf(SMART_404_PAGE_MARKER_START);
        const block = page.slice(start, page.indexOf(SMART_404_PAGE_MARKER_END) + SMART_404_PAGE_MARKER_END.length);
        expect(block).toContain('<script nonce="aem">');
        expect(block).toContain(HANDLER.trim());
        expect(page.indexOf('<main class="error">')).toBeLessThan(start);
        // Spliced in before </body>, and nothing else moved.
        expect(page.replace(`\n${block}\n`, '')).toBe(NOT_FOUND);
        expect(page.indexOf(block) + block.length).toBeLessThan(page.lastIndexOf('</body>'));
    });

    it('answers current, and writes nothing, when the page already carries this script', () => {
        const page = pageOf(withRecoveryHandler(NOT_FOUND, HANDLER));

        expect(withRecoveryHandler(page, HANDLER)).toEqual({ kind: 'current' });
    });

    it('swaps an older copy in place, so a changed script reaches an existing storefront', () => {
        const old = pageOf(withRecoveryHandler(NOT_FOUND, buildSmart404Snippet('https://old.test/prepublish-pdp', 'skukla', 'bodea')));

        const page = pageOf(withRecoveryHandler(old, HANDLER));

        expect(page).toBe(pageOf(withRecoveryHandler(NOT_FOUND, HANDLER)));
        expect(page.split(SMART_404_PAGE_MARKER_START)).toHaveLength(2);
    });

    it('appends when the page has no </body>', () => {
        const bare = '<script nonce="aem">window.isErrorPage = true;</script><main></main>';

        const page = pageOf(withRecoveryHandler(bare, HANDLER));

        expect(page.startsWith(bare)).toBe(true);
        expect(page).toContain(SMART_404_PAGE_MARKER_END);
    });

    it('skips a page with no nonced script, where the CSP would block it, and says why', () => {
        expect(withRecoveryHandler('<html><body><main></main></body></html>', HANDLER)).toEqual({
            kind: 'skipped',
            reason: '404.html has no nonced script tag',
        });
    });

    it('leaves a block with no end marker alone rather than guess where it ends, and says why', () => {
        const half = NOT_FOUND.replace('</body>', `${SMART_404_PAGE_MARKER_START}\n<script nonce="aem">x</script></body>`);

        expect(withRecoveryHandler(half, HANDLER)).toEqual({
            kind: 'skipped',
            reason: "404.html has Demo Builder's block with no end marker",
        });
    });
});

describe('withoutDelayedJsHandler', () => {
    const DELAYED = "// add delayed functionality here\nimport './inspector.js';\n";

    it('takes out exactly what the old install appended, leaving the file as it was', () => {
        const installed = DELAYED + HANDLER;

        expect(withoutDelayedJsHandler(installed)).toEqual({ kind: 'removed', content: DELAYED });
    });

    it('leaves what follows the block alone (a later append, such as the inspector import)', () => {
        const later = "import './later.js';\n";

        expect(withoutDelayedJsHandler(DELAYED + HANDLER + later)).toEqual({ kind: 'removed', content: DELAYED + later });
    });

    it('answers absent for a delayed.js that never had it', () => {
        expect(withoutDelayedJsHandler(DELAYED)).toEqual({ kind: 'absent' });
    });

    it('leaves a block with no end marker alone and says so', () => {
        const half = `${DELAYED}\n${SMART_404_MARKER_START}\n(function () {}());\n`;

        expect(withoutDelayedJsHandler(half)).toEqual({ kind: 'half-marked' });
    });

    it('finds the block by its own markers', () => {
        // The markers are what a storefront carries today (JustRite's delayed.js, read 2026-10-29).
        expect(SMART_404_MARKER_START).toBe('// === Smart 404 PDP rebuild (Demo Builder) ===');
        expect(SMART_404_MARKER_END).toBe('// === end Smart 404 PDP rebuild ===');
    });
});
