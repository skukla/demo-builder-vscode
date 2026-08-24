/**
 * Contract: both ends of the webview protocol correlate responses identically.
 *
 * `WebviewCommunicationManager` (extension host) and `WebviewClient` (webview)
 * each carry their own copy of the same block — look up `responseToId`, clear the
 * timeout, drop the entry, then reject on `error` or resolve with `payload`.
 * jscpd flags it (20 lines, 141 tokens) and it is genuinely one protocol
 * implemented twice.
 *
 * It is NOT extracted into a shared helper, deliberately:
 *
 * - The two `PendingRequest` types are documented VARIANTS, not copies
 *   (`WebviewClient.ts:33-42`): the webview has no retry state and a browser
 *   timeout handle, the extension has `retryCount` and `NodeJS.Timeout`. A shared
 *   helper must be generic over both and thread `clearTimeout` in, which reads
 *   worse than the block it replaces.
 * - Two sites, not three. The project SOP extracts on the third instance.
 *
 * The real risk is DRIFT: one side learning to carry an error code or a
 * cancellation reason while the other silently does not. That is what this pins.
 *
 * WHY A SOURCE-LEVEL TEST and not a runtime one: there is no existing harness for
 * driving the webview client's request/response cycle — `WebviewClient.test.ts`
 * covers only the handshake — and the two sides need opposite timer regimes, so
 * exercising both in one test means inventing a harness and calling
 * `jest.resetModules()` mid-test. `requestTimeouts.test.ts` in this directory
 * already establishes the alternative for a cross-cutting contract here: read the
 * source and assert on it. Same approach, and it cannot go green for the wrong
 * reason the way a mocked round trip can.
 */

import * as fs from 'fs';
import * as path from 'path';

const EXTENSION_SIDE = path.join(
    __dirname,
    '../../../src/core/communication/webviewCommunicationManager.ts'
);
const WEBVIEW_SIDE = path.join(__dirname, '../../../src/core/ui/utils/WebviewClient.ts');

/** The `if (message.isResponse …) { … }` block, brace-matched from its condition. */
function extractCorrelationBlock(file: string): string {
    const source = fs.readFileSync(file, 'utf8');
    const start = source.indexOf('if (message.isResponse && message.responseToId)');
    // Fail loudly rather than returning '' — two empty strings compare equal, so a
    // failed extraction would otherwise PASS this suite while checking nothing.
    expect(start).toBeGreaterThan(-1);

    let index = source.indexOf('{', start);
    let depth = 0;
    for (; index < source.length; index++) {
        if (source[index] === '{') depth++;
        else if (source[index] === '}') {
            depth--;
            if (depth === 0) break;
        }
    }
    expect(depth).toBe(0);
    return source.slice(start, index + 1);
}

/** Collapse indentation so the two copies differ only where the LOGIC differs. */
function normalize(block: string): string {
    return block.replace(/\s+/g, ' ').trim();
}

describe('response correlation is identical on both ends of the protocol', () => {
    it('finds a correlation block in each file', () => {
        // The positive control for the two assertions below: if either extraction
        // silently stopped matching (a refactor renames the field, moves the
        // block), the comparison test would compare nothing and pass.
        expect(extractCorrelationBlock(EXTENSION_SIDE).length).toBeGreaterThan(100);
        expect(extractCorrelationBlock(WEBVIEW_SIDE).length).toBeGreaterThan(100);
    });

    it('keeps both copies byte-identical once indentation is normalised', () => {
        const extension = normalize(extractCorrelationBlock(EXTENSION_SIDE));
        const webview = normalize(extractCorrelationBlock(WEBVIEW_SIDE));

        // If this fails, one side changed and the other did not. Either make the
        // same change on both, or — if they must genuinely diverge — delete this
        // test and say in its place why the protocol now has two behaviours.
        expect(webview).toBe(extension);
    });

    it('still settles on error before payload, on both sides', () => {
        // The branch ORDER is the most valuable single property here: a response
        // carrying both `error` and `payload` must reject, not resolve. Pinned
        // explicitly so a reordering fails with a readable reason rather than as a
        // whole-block diff.
        for (const file of [EXTENSION_SIDE, WEBVIEW_SIDE]) {
            const block = normalize(extractCorrelationBlock(file));
            expect(block.indexOf('message.error')).toBeGreaterThan(-1);
            expect(block.indexOf('message.error')).toBeLessThan(block.indexOf('pending.resolve'));
        }
    });
});
