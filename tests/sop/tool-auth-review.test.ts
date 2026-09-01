/**
 * SOP Compliance Test: every MCP tool has been REVIEWED for the credentials rule.
 *
 * The rule: a tool needing credentials pre-flights and returns a structured
 * `needsAuth` handoff rather than erroring, so the agent can drive sign-in and
 * retry. Obeyed at 39 sites and asserted by 11 suites — and until now, nothing
 * made a NEW tool obey it.
 *
 * WHY A LEDGER AND NOT A SCAN. There is no marker that says "this tool touches
 * credentials". Compliance is reached three ways — `runGuards`, a bespoke
 * pre-flight, or nothing at all because none is needed — and no static check
 * separates them. Two attempts on 2026-08-31 failed in opposite directions: a
 * file-level scan gave 37 tools the same seven signals because 23 of them share
 * one descriptor file, and a per-handler scan reported nothing for
 * `add_console_apis`, whose handler demonstrably calls `runGuards`.
 *
 * The `readOnly` field solved this exact problem by making the AUTHOR declare it,
 * with the reasoning in its own docblock: "a field you can forget is a hole that
 * opens quietly." A ledger row is the same move where a type field cannot reach —
 * only 48 of the 114 tools have a descriptor to put a field on; the other 66
 * register directly, and they include the Adobe, cloud, site and storefront tools
 * most likely to need credentials.
 *
 * WHAT IT BUYS TODAY: a new tool has no row, so the build fails and the question
 * is asked at authoring time. Draining the pool is `unreviewedCeiling`, which may
 * only fall.
 *
 * THE INVENTORY IS THE LOAD-BEARING PART, and nobody's count was right before
 * this. The `tool-verdicts` skill says 107; an earlier pass in this same session
 * said 102. Both missed `dataInstallerDescriptors.ts` (8 tools) and
 * `statusDescriptors.ts` (4). It is 114, and this suite recomputes it rather than
 * trusting any of those numbers.
 *
 * @see .rptc/backlog/2026-08-31-every-convention-enforced.md
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..');
const srcDir = path.join(repoRoot, 'src');

const LEDGER = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'tool-auth-review.ledger.json'), 'utf8')
) as {
    unreviewedCeiling: number;
    tools: Record<string, string>;
};

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (e.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

/**
 * Every registered tool name, BOTH ways a tool reaches the server.
 *
 * A descriptor row (`tool: 'x'`) is registered by the descriptor registrar; a
 * `registerTool('x', …)` call registers directly. Missing either form is how the
 * two earlier counts went wrong, so both are collected here rather than one being
 * assumed to cover the other.
 */
function registeredTools(): Map<string, string> {
    const found = new Map<string, string>();
    for (const file of walk(srcDir)) {
        const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
        const body = fs.readFileSync(file, 'utf8');
        for (const m of body.matchAll(/^\s+tool:\s*'([^']+)'/gm)) found.set(m[1], rel);
        for (const m of body.matchAll(/registerTool\(\s*\n?\s*'([^']+)'/g)) {
            if (!found.has(m[1])) found.set(m[1], rel);
        }
    }
    return found;
}

const tools = registeredTools();

describe('every MCP tool is reviewed for the credentials rule', () => {
    it('CONTROL: both registration forms are seen, and the corpus was read', () => {
        expect(tools.size).toBeGreaterThan(100);
        // a descriptor-registered tool and a directly-registered one
        expect(tools.has('add_console_apis')).toBe(true);
        expect(tools.has('get_current_project')).toBe(true);
        // and the two files earlier counts missed are represented
        expect([...tools.values()].some((f) => f.includes('dataInstallerDescriptors'))).toBe(true);
        expect([...tools.values()].some((f) => f.includes('statusDescriptors'))).toBe(true);
    });

    it('a new tool arrives with a row — no tool is unlisted', () => {
        const unlisted = [...tools.keys()].filter((t) => !(t in LEDGER.tools)).sort();
        expect(unlisted).toEqual([]);
    });

    it('a removed tool leaves the ledger — no row is stale', () => {
        const stale = Object.keys(LEDGER.tools)
            .filter((t) => !tools.has(t))
            .sort();
        expect(stale).toEqual([]);
    });

    it('every row states a verdict', () => {
        const VERDICTS = ['NEEDS-AUTH', 'NO-AUTH', 'UNREVIEWED'];
        const bad = Object.entries(LEDGER.tools)
            .filter(([, v]) => !VERDICTS.some((k) => v.startsWith(k)))
            .map(([t]) => t)
            .sort();
        expect(bad).toEqual([]);
    });

    it('the unreviewed count only ever falls', () => {
        const unreviewed = Object.values(LEDGER.tools).filter((v) =>
            v.startsWith('UNREVIEWED')
        ).length;
        expect({
            unreviewed,
            verdict:
                unreviewed > LEDGER.unreviewedCeiling
                    ? 'GREW — a tool was un-reviewed, or a new one landed unreviewed'
                    : unreviewed < LEDGER.unreviewedCeiling
                      ? 'LOWER unreviewedCeiling in the ledger, in this commit'
                      : 'at',
        }).toEqual({ unreviewed, verdict: 'at' });
    });
});
