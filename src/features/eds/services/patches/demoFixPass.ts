/**
 * What creation and reset do about our fixes on a project built on an added
 * demo (EDS-13f, plan `.rptc/plans/shareable-demo-patches/`, steps 02 and 03).
 * One decision, shared by both paths so they say and do the same thing:
 *
 *   1. A saved package: `builtWith` names one of our templates and its ledger.
 *      Both ends are the SC's own (decision 2), so the ledger is APPLIED where
 *      it fits, in one commit to the SC's repository.
 *   2. A colleague's storefront that shows our lineage (decision 3): the five
 *      load-bearing and two universal fixes are checked against the code and
 *      the ones that fit are OFFERED. Nothing is written unless the caller says
 *      the SC accepted (`applyOffered`), which is never a default.
 *   3. Anything else: the dry check, exactly as before (D23). It runs only here.
 *
 * A fix "fits" only where its precondition appears exactly once
 * (`storefrontFixes.ts`), so no path here writes over code someone changed:
 * that is what makes applying to a storefront we did not write safe.
 *
 * Not done here: re-pinning a saved package to its ledger's last-known-good.
 * Decision 2 allows it only when the files it would replace are unchanged
 * since the recorded pin; that hash guard is not built, so nothing is re-pinned
 * (the conservative half of the decision).
 *
 * @module features/eds/services/patches/demoFixPass
 */

import { ourLineage, type LineageSignal } from '../storefront/storefrontProvenance';
import {
    addedDemoCaveats,
    caveatsFor,
    fixGroupsLabel,
    fixOfferLine,
    resolveDryCheckSource,
    STOREFRONT_FIX_IDS,
} from './loadBearingPatches';
import { applyFixes, checkFixes, type FixDeps, type FixOutcome, type FixRepository } from './storefrontFixes';
import type { DemoPackage } from '@/types/demoPackages';
import type { AddedDemo, RepositoryRef } from '@/types/projectFile';

export interface DemoFixReport {
    /** What may not work, in SC words: one per consequence a fix on the code does not answer. */
    caveats: string[];
    /** How the storefront was tied to our templates; absent when it was not. */
    by?: LineageSignal;
    /** Fixes written to the SC's repository by this run. */
    applied?: string[];
    /** Fixes that fit and were not written: the offer. */
    offered?: string[];
}

export interface DemoFixOptions {
    /** The SC accepted the offer (a colleague's storefront only). Never defaulted on. */
    applyOffered?: boolean;
    /** The catalog; defaults to the bundled one. */
    packages?: readonly DemoPackage[];
}

/**
 * Run the fix decision for a project on an added demo.
 *
 * @param demo - The project's demo row
 * @param own - The SC's OWN repository and the branch its code is on: every read and write
 * @param source - The demo's source repository, which the dry check reads
 * @param deps - GitHub reads and writes, and a logger
 * @param options - Whether the SC accepted the offer; the catalog
 */
export async function runDemoFixPass(
    demo: AddedDemo,
    own: FixRepository,
    source: RepositoryRef,
    deps: FixDeps,
    options: DemoFixOptions = {},
): Promise<DemoFixReport> {
    const saved = savedPackageLedger(demo, options.packages);
    if (saved) {
        const result = await applyFixes(deps, own, saved.codePatches, saved.codePatchSource);
        return { by: 'built-with', applied: result.applied, caveats: caveatsOf(result.outcomes) };
    }

    const match = ourLineage({ lineage: demo.lineage, boilerplate: demo.boilerplate }, options.packages);
    const ledger = match ? resolveDryCheckSource(options.packages) : undefined;
    if (match && ledger) {
        const ids = [...STOREFRONT_FIX_IDS];
        if (options.applyOffered) {
            const result = await applyFixes(deps, own, ids, ledger);
            return { by: match.by, ...nonEmpty('applied', result.applied), caveats: caveatsOf(result.outcomes) };
        }
        const outcomes = await checkFixes(deps, own, ids, ledger);
        const offered = outcomes.filter((o) => o.state === 'fits').map((o) => o.patchId);
        return { by: match.by, ...nonEmpty('offered', offered), caveats: caveatsOf(outcomes) };
    }

    return { caveats: await addedDemoCaveats(demo, source, deps.logger) };
}

/**
 * What the SC reads about the pass, in the channel the caveats already travel
 * (the completion card, the reset message, the agent's `caveats`): what was
 * fixed, what may not work, and the offer. Never a patch id.
 */
export function demoFixLines(report: DemoFixReport): string[] {
    const lines: string[] = [];
    if (report.applied?.length) {
        const n = report.applied.length;
        lines.push(`Demo Builder applied ${n} ${n === 1 ? 'fix' : 'fixes'} to this storefront: ${fixGroupsLabel(report.applied)}.`);
    }
    lines.push(...report.caveats);
    if (report.offered?.length && report.by) lines.push(fixOfferLine(report.offered, report.by));
    return lines;
}

/** A saved package's ledger, when its record names one of our templates and carries patches. */
function savedPackageLedger(
    demo: AddedDemo,
    packages: readonly DemoPackage[] | undefined,
): Required<Pick<NonNullable<AddedDemo['builtWith']>, 'codePatches' | 'codePatchSource'>> | undefined {
    const builtWith = demo.builtWith;
    if (!builtWith?.codePatchSource || !builtWith.codePatches?.length) return undefined;
    if (ourLineage({ builtWithTemplate: builtWith.template }, packages)?.by !== 'built-with') return undefined;
    return { codePatches: builtWith.codePatches, codePatchSource: builtWith.codePatchSource };
}

/** A fix the code carries answers its caveat; anything else (fits, missing, unread) leaves it. */
function caveatsOf(outcomes: readonly FixOutcome[]): string[] {
    return caveatsFor(outcomes.map((o) => ({ ...o, applied: o.state === 'applied' })));
}

function nonEmpty<K extends 'applied' | 'offered'>(key: K, ids: string[]): Partial<Record<K, string[]>> {
    return ids.length ? ({ [key]: ids } as Partial<Record<K, string[]>>) : {};
}
