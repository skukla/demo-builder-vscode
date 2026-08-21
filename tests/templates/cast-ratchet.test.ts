/**
 * Boundary-cast ratchet — the cast count may go DOWN, never up.
 *
 * A cast at a call boundary is a silenced type error (project CLAUDE.md);
 * this class produced the stackBackend no-ops, the five webview payload
 * bugs, and the seven partial-HandlerContext casts. The 2026-08-21 triage
 * opened all 55 then-existing sites, fixed 15, and left every survivor with
 * a recorded verdict (codebase-sweep baselines + backlog items). This test
 * makes that discipline CONSTANT instead of sweep-periodic: a NEW cast
 * fails CI the moment it lands, not months later at a release cut.
 *
 * If this fails on your change:
 *   1. Preferred: don't cast — build the object the callee declares, narrow
 *      the callee's parameter (Pick<> precedent, 3df264c6), or widen it to
 *      `unknown` where it treats the value as opaque (9144bee9 precedent).
 *   2. If the cast is genuinely a library-typing shim (CardActionsMenu
 *      precedent): document WHY at the site, raise the baseline by exactly
 *      your addition, and say so in the commit message.
 *   3. If you REMOVED casts: lower the baseline to the new count — that is
 *      the ratchet doing its job.
 */

import * as fs from 'fs';
import * as path from 'path';

// Measured 2026-08-21 after the first full triage. 6 `as never` +
// 34 `as unknown as`, every one verdicted (see codebase-sweep baselines).
const BASELINE = 36;

const ROOT = path.join(__dirname, '../..');

function countCasts(): { total: number; asAny: string[]; sites: string[] } {
    const sites: string[] = [];
    const asAny: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === 'dist') continue;
                walk(full);
            } else if (/\.tsx?$/.test(entry.name)) {
                const lines = fs.readFileSync(full, 'utf-8').split('\n');
                lines.forEach((line, i) => {
                    const t = line.trim();
                    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
                    const loc = `${path.relative(ROOT, full)}:${i + 1}`;
                    if (/\bas any\b/.test(line)) asAny.push(loc);
                    if (/\bas never\b/.test(line) || /as unknown as/.test(line)) sites.push(loc);
                });
            }
        }
    };
    walk(path.join(ROOT, 'src'));
    return { total: sites.length, asAny, sites };
}

describe('boundary-cast ratchet', () => {
    const { total, asAny, sites } = countCasts();

    it('src has ZERO `as any`', () => {
        expect(asAny).toEqual([]);
    });

    it(`cast count stays at or below the ${BASELINE} verdicted sites`, () => {
        if (total > BASELINE) {
            throw new Error(
                `${total} boundary casts in src (baseline ${BASELINE}). New sites:\n` +
                    `  ${sites.join('\n  ')}\n` +
                    `Fix the new cast (see this file's header), or document it at ` +
                    `the site and raise BASELINE deliberately in your commit.`
            );
        }
        // Count went DOWN? Lower the baseline so the win is locked in.
        if (total < BASELINE) {
            throw new Error(
                `Only ${total} boundary casts remain (baseline ${BASELINE}) — ` +
                    `lower BASELINE in this file to ${total} to lock in the improvement.`
            );
        }
        expect(total).toBe(BASELINE);
    });
});
