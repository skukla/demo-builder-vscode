/**
 * Every NEW tool must be exercised by a battery prompt.
 *
 * The repo already refuses a tool with no narration phrase and no recorded
 * response size. This is the third of the same kind, and it exists because of a
 * claim made on 2026-08-26: "85 tools are unused, so nobody needs them".
 *
 * Checked properly, that was unsupportable. 107 tools shipped, 28 ever called in
 * one producer's 50 sessions, 15 exercised by the battery — and **78 judged by
 * neither**. Nothing had ever asked those 78 to do their job, so nothing could be
 * concluded about any of them. Absence from one person's month is not evidence a
 * tool is dead.
 *
 * A tool with no prompt cannot be measured, cannot be defended, and cannot be
 * deleted on evidence. So a new one may not be added without a prompt, and the
 * 78 that predate this rule are grandfathered in a baseline that may only shrink.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const REPO = join(__dirname, '..', '..', '..', '..');
const BATTERY = join(REPO, '.rptc', 'plans', 'evaluation-mode', 'battery');

/** Tool names as they are REGISTERED, read from source. */
function shippedTools(): Set<string> {
    const names = new Set<string>();
    const walk = (p: string): void => {
        const s = statSync(p);
        if (s.isDirectory()) {
            for (const e of readdirSync(p)) walk(join(p, e));
            return;
        }
        if (!p.endsWith('.ts')) return;
        const src = readFileSync(p, 'utf8');
        for (const re of [
            /registerTool\(\s*'([a-z0-9_]+)'/g,
            /server\.tool\(\s*'([a-z0-9_]+)'/g,
            /\btool:\s*'([a-z0-9_]+)'/g,
        ]) {
            for (const m of src.matchAll(re)) names.add(m[1]);
        }
    };
    walk(join(REPO, 'src', 'features', 'ai', 'server'));
    walk(join(REPO, 'src', 'mcp-server.ts'));
    return names;
}

describe('every tool is exercised by a battery prompt', () => {
    it('a NEW tool may not ship without one', () => {
        const shipped = shippedTools();
        // A scan that finds nothing would pass this test while proving nothing.
        expect(shipped.size).toBeGreaterThan(50);

        const prompts: Array<{ id: string; expect: string[] }> = JSON.parse(
            readFileSync(join(BATTERY, 'prompts.json'), 'utf8'),
        );
        const prompted = new Set(prompts.flatMap((p) => p.expect));

        const baseline: { tools: string[] } = JSON.parse(
            readFileSync(join(BATTERY, 'unprompted-baseline.json'), 'utf8'),
        );
        const grandfathered = new Set(baseline.tools);

        const unjudged = [...shipped].filter((t) => !prompted.has(t) && !grandfathered.has(t)).sort();
        expect(unjudged).toEqual([]);
    });

    it('every floor entry carries a NAMED reason — a bare entry is an IOU, not a floor', () => {
        // AI-1q's done-condition: the baseline is DOCUMENTATION of the tier-3
        // floor, not a list of unpaid debts. An entry without a reason is a
        // tool nobody decided about.
        const baseline: { tools: string[]; reasons?: Record<string, string> } = JSON.parse(
            readFileSync(join(BATTERY, 'unprompted-baseline.json'), 'utf8'),
        );
        const unreasoned = baseline.tools.filter(
            (t) => !baseline.reasons?.[t] || baseline.reasons[t].length < 10,
        );
        expect(unreasoned).toEqual([]);
        // And no orphaned reason survives its tool leaving the floor.
        const orphaned = Object.keys(baseline.reasons ?? {}).filter(
            (t) => !baseline.tools.includes(t),
        );
        expect(orphaned).toEqual([]);
    });

    it('the baseline may only shrink — a paid-off entry left listed is rot', () => {
        // Same rule the response-ceiling IOU list carries. A tool that HAS a prompt
        // now must leave the baseline, or the list stops meaning anything.
        const prompts: Array<{ expect: string[] }> = JSON.parse(
            readFileSync(join(BATTERY, 'prompts.json'), 'utf8'),
        );
        const prompted = new Set(prompts.flatMap((p) => p.expect));
        const baseline: { tools: string[] } = JSON.parse(
            readFileSync(join(BATTERY, 'unprompted-baseline.json'), 'utf8'),
        );

        const stale = baseline.tools.filter((t) => prompted.has(t));
        expect(stale).toEqual([]);
    });

    it('the baseline lists only tools that still exist', () => {
        const shipped = shippedTools();
        const baseline: { tools: string[] } = JSON.parse(
            readFileSync(join(BATTERY, 'unprompted-baseline.json'), 'utf8'),
        );
        const gone = baseline.tools.filter((t) => !shipped.has(t));
        expect(gone).toEqual([]);
    });
});
