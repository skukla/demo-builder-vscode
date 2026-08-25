/**
 * Every agent tool that COLLECTS phases must also report them live.
 *
 * WHY THIS EXISTS. The narration gap was never "the phases don't exist" — it was
 * that they reached the wrong place, or nowhere. Two tools had the strings in
 * hand and pushed them into an array for the RESULT while the user watched a
 * silent two-minute wait: `applyUpdatesTool` and `edsResetTool`.
 *
 * That shape is easy to reintroduce, because collecting phases for the result is
 * a perfectly reasonable thing to do on its own. This asserts that a tool doing
 * so also calls `reportPhase`, so the next one written that way fails here
 * instead of shipping silent.
 *
 * A source-level check on purpose: driving every long tool to observe its
 * notifications would mean standing up their whole dependency trees, and the
 * property under test is structural — "does this file report as well as
 * collect" — which the source answers exactly. Same reasoning as
 * `requestTimeouts.test.ts` reading `REQUEST_TIMEOUTS` from source.
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVER_DIR = path.join(__dirname, '../../../../src/features/ai/server');

/** Tool files that push progress into a local array for their result. */
function filesCollectingPhases(): string[] {
    return fs
        .readdirSync(SERVER_DIR)
        .filter((f) => f.endsWith('.ts'))
        .filter((f) => {
            const src = fs.readFileSync(path.join(SERVER_DIR, f), 'utf8');
            return /phases\.push\(/.test(src);
        });
}

describe('agent tools narrate the phases they collect', () => {
    it('finds the files that collect phases', () => {
        // Positive control: if this ever returns nothing, the check below is
        // vacuous and would pass while asserting nothing at all.
        expect(filesCollectingPhases().length).toBeGreaterThan(0);
    });

    it.each(filesCollectingPhases())('%s also calls reportPhase', (file) => {
        const src = fs.readFileSync(path.join(SERVER_DIR, file), 'utf8');

        // Collecting for the result is fine; collecting INSTEAD of reporting is
        // the silent wait this whole thread exists to remove.
        expect(src).toMatch(/reportPhase\(/);
    });
});
