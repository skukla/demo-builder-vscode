/**
 * Every tool's `needsAuth` is drawn from the real provider vocabulary, and the
 * per-provider totals only change deliberately.
 *
 * WHY THIS EXISTS, and it is not a tidiness rule. `needsAuth` tells an agent which
 * sign-in to offer before calling a tool. Get it wrong and the agent offers the wrong
 * one, or none — the commit that introduced the field says so itself: dropping a
 * second provider is "exactly the sign-in an agent would then fail to offer".
 *
 * Those 210 declarations were transcribed from `tests/sop/tool-auth-review.ledger.json`,
 * verified row by row against it, and then THE LEDGER WAS DELETED — on the argument
 * that "a field you can forget is a hole that opens quietly. The compiler asks every
 * row." That argument is right about PRESENCE and silent about CORRECTNESS. A required
 * field cannot be omitted; its VALUE can still be wrong, and after the ledger went
 * there was nothing left that knew the right answers.
 *
 * HOW IT WAS FOUND, because the method matters more than the fix. The mutation pilot
 * measures whether a change is CONSTRAINED by tests. `siteTools.ts` fell 57.33% ->
 * 54.43% with its mutant count unchanged — the same mutants, more of them surviving.
 * The six survivors were the six `needsAuth` lines that commit added. Nothing else
 * noticed: the suite was green, the compiler was satisfied, and coverage was flat.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. It does NOT prove each tool asks for the sign-in
 * it truly needs — that judgement lived in the ledger and is not recoverable from the
 * source. It proves the weaker, checkable things: every declared provider is a real
 * one, and the totals do not move by accident. A mutant that empties `['dalive']` or
 * blanks it to `['']` now fails, which is precisely the drop that would strand an
 * agent.
 *
 * @see .claude/skills/mutation-test-pilot — the instrument that surfaced this
 * @see tests/sop/tool-catalog-gating.test.ts — same brace-independent derivation
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

/** The sign-ins the extension can actually offer. */
const PROVIDERS = new Set(['adobe', 'dalive', 'github', 'commerce']);

/**
 * Per-provider totals, pinned. Shrink or grow them deliberately — a diff here means
 * some tool's declared sign-ins changed, which is a product decision, not a refactor.
 */
const EXPECTED: Record<string, number> = {
    adobe: 42,
    dalive: 19,
    github: 10,
    commerce: 2,
    none: 45,
};

/**
 * 114 tools, and the counts above sum to 118 provider slots — a difference of FOUR,
 * which is exactly the four tools the original commit says need two sign-ins each
 * (check_github_app, create_project, republish, sync_content). That arithmetic is the
 * cross-check: the derivation below reproduces both numbers from the source without
 * being told either.
 *
 * (An earlier draft pinned 84/26/10/4/78 from a raw `grep` of `needsAuth:` across the
 * files. That counts text, not declarations, and was roughly double. The CONTROL below
 * caught it — which is the argument for having one.)
 */
const EXPECTED_TOOLS = 114;

interface Declaration {
    name: string;
    providers: string[] | null;
}

/** Read each tool's `needsAuth` by bounding the search to its OWN declaration. */
function declarations(): Declaration[] {
    const files = execSync(
        "git ls-files 'src/features/ai/server/*.ts' 'src/mcp-server.ts' 'src/mcp/*.ts'",
        { encoding: 'utf8', cwd: ROOT }
    )
        .split('\n')
        .filter(Boolean);

    const out: Declaration[] = [];
    for (const file of files) {
        const src = readFileSync(join(ROOT, file), 'utf8');
        // BOTH registration forms. Matching only `registerTool(` found 66 of the
        // surface and the control said so — descriptor rows declare `tool: 'name'`
        // instead, and they carry `needsAuth` too.
        const sites = [
            ...[...src.matchAll(/registerTool\(\s*'([a-z0-9_]+)'/g)],
            ...[...src.matchAll(/tool:\s*'([a-z0-9_]+)'/g)],
        ]
            .map((m) => ({ name: m[1], at: m.index as number }))
            .sort((a, b) => a.at - b.at);

        sites.forEach(({ name, at }, i) => {
            // Bounded to the NEXT declaration — the unbounded window is the exact bug
            // that made the tool catalog understate four confirm gates.
            const body = src.slice(at, sites[i + 1]?.at ?? src.length);
            const m = /needsAuth:\s*(\[[^\]]*\]|false)/.exec(body);
            if (!m) {
                out.push({ name, providers: null });
                return;
            }
            const raw = m[1];
            out.push({
                name,
                providers:
                    raw === 'false' ? [] : [...raw.matchAll(/'([a-z]+)'/g)].map((p) => p[1]),
            });
        });
    }
    return out;
}

describe('every tool declares real sign-ins', () => {
    const decls = declarations();

    it('CONTROL: the derivation actually found the tool surface', () => {
        // A vocabulary check over an empty list passes trivially.
        expect(decls.length).toBe(EXPECTED_TOOLS);
        expect(decls.some((d) => (d.providers ?? []).includes('adobe'))).toBe(true);
        expect(decls.some((d) => d.providers?.length === 0)).toBe(true);
    });

    it('every tool answers the question', () => {
        // The compiler already requires this; asserting it here means the DERIVATION
        // is sound too — a null means this file failed to read a declaration it should
        // have, which would silently shrink every count below.
        expect(decls.filter((d) => d.providers === null).map((d) => d.name)).toEqual([]);
    });

    it('no tool names a sign-in the extension cannot offer', () => {
        const bad = decls
            .flatMap((d) => (d.providers ?? []).map((p) => ({ tool: d.name, provider: p })))
            .filter(({ provider }) => !PROVIDERS.has(provider));
        expect(bad).toEqual([]);
    });

    it('each tool is declared exactly once', () => {
        // Two sites for one tool could disagree about its sign-ins, and the counts
        // below would quietly average the lie. Measured 2026-09-01: zero duplicates.
        const names = decls.map((d) => d.name);
        expect(names.length - new Set(names).size).toBe(0);
    });

    it('the per-provider totals match the pin', () => {
        const counts: Record<string, number> = { adobe: 0, dalive: 0, github: 0, commerce: 0, none: 0 };
        for (const d of decls) {
            const p = d.providers ?? [];
            if (p.length === 0) counts.none += 1;
            for (const one of p) if (one in counts) counts[one] += 1;
        }
        expect(counts).toEqual(EXPECTED);
    });
});
