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

import { toolDeclarations } from './tool.testUtils';

/** The sign-ins the extension can actually offer. */
const PROVIDERS = new Set(['adobe', 'dalive', 'github', 'commerce']);

/**
 * Per-provider totals, pinned. Shrink or grow them deliberately — a diff here means
 * some tool's declared sign-ins changed, which is a product decision, not a refactor.
 */
const EXPECTED: Record<string, number> = {
    // 37 -> 35 and 19 -> 21 on 2026-09-12: list_dalive_sites and cleanup_dalive_site
    // build their DA.live operations on the DA.live session, the sign-in DA.live
    // accepts (the IMS token listed zero sites and was refused, measured live).
    // 35 -> 36 when develop added delete_adobe_workspace (merged 2026-09-15).
    // 36 -> 37 when develop added rename_adobe_project (picked 2026-09-21).
    // 37 -> 38 when develop added list_runtime_packages (picked 2026-09-21).
    // 38 -> 42 on 2026-09-24, develop merged into the ERP branch: the branch's
    // ERP, settings, update and runtime tools join develop's shared-demo tools.
    // 42 -> 43 on 2026-09-24: run_commerce_rest signs with the workspace credential,
    // which it can only fetch through the Adobe sign-in.
    // 43 -> 44 the same day: write_commerce_rest signs with the same credential.
    // 44 -> 46 the same day: list_runtime_activations and read_runtime_activation read a
    // Runtime namespace through the Console credential, like list_runtime_packages.
    // 47 -> 48 on 2026-09-25: check_setup_steps reads Commerce with the workspace credential.
    adobe: 48,
    dalive: 21,
    // 10 -> 12 on 2026-09-12: forget_added_demo and change_demo_source (step 06
    // of the shareable-demo program) both read and write GitHub; 12 -> 14 the
    // same day for probe_shared_demo and add_shared_demo (step 07).
    // 14 -> 17 on 2026-09-13: get_demo_package_preview, save_demo_package and
    // remove_demo_package (step 09) read and write the SC's own storefront repository.
    // 17 -> 18 on 2026-09-13: export_demo_bundle reads the SC's own repository archive.
    github: 18,
    commerce: 2,
    // 45 -> 46 on 2026-09-14: edit_added_demo renames a card in a user setting,
    // and needs no sign-in.
    // 46 -> 50 on 2026-09-24, the same merge.
    // 50 -> 52 on 2026-09-24: get_erp_record and get_erp_order_trace declare
    // no sign-in the way get_erp_status does — the handler resolves the IMS
    // identity itself and answers a typed AUTH_REQUIRED when there is none.
    // 52 -> 54 on 2026-09-24: run_erp_rest and write_erp_rest declare like get_erp_status.
    // 54 -> 56 on 2026-09-25: get_setup_checklist and set_setup_step touch saved state only.
    none: 56,
};

/**
 * 137 tools, and the counts above sum to 141 provider slots — a difference of FOUR,
 * which is exactly the four tools the original commit says need two sign-ins each
 * (check_github_app, create_project, republish, sync_content). That arithmetic is the
 * cross-check: the derivation below reproduces both numbers from the source without
 * being told either.
 *
 * (An earlier draft pinned 84/26/10/4/78 from a raw `grep` of `needsAuth:` across the
 * files. That counts text, not declarations, and was roughly double. The CONTROL below
 * caught it — which is the argument for having one.)
 */
const EXPECTED_TOOLS = 141; // 138 -> 141 on 2026-09-25: the three demo setup checklist tools (AB-26x).

interface Declaration {
    name: string;
    providers: string[] | null;
}

/** Each tool's declared sign-ins, read from its own declaration. */
function declarations(): Declaration[] {
    return toolDeclarations().map(({ name, body }) => {
        const m = /needsAuth:\s*(\[[^\]]*\]|false)/.exec(body);
        if (!m) return { name, providers: null };
        const raw = m[1];
        return {
            name,
            providers: raw === 'false' ? [] : [...raw.matchAll(/'([a-z]+)'/g)].map((p) => p[1]),
        };
    });
}

describe('every tool declares real sign-ins', () => {
    const decls = declarations();

    it('CONTROL: the derivation actually found the tool surface', () => {
        // A vocabulary check over an empty list passes trivially.
        expect(decls).toHaveLength(EXPECTED_TOOLS);
        expect(decls.some((d) => (d.providers ?? []).includes('adobe'))).toBe(true);
        expect(decls.some((d) => d.providers?.length === 0)).toBe(true);
    });

    it('every tool answers the question', () => {
        // The compiler already requires this; asserting it here means the DERIVATION
        // is sound too — a null means this file failed to read a declaration it should
        // have, which would silently shrink every count below.
        expect(decls.filter((d) => d.providers === null).map((d) => d.name)).toStrictEqual([]);
    });

    it('no tool names a sign-in the extension cannot offer', () => {
        const bad = decls
            .flatMap((d) => (d.providers ?? []).map((p) => ({ tool: d.name, provider: p })))
            .filter(({ provider }) => !PROVIDERS.has(provider));
        expect(bad).toStrictEqual([]);
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
