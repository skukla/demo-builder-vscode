/**
 * The cloud-reversal ledger's shape and its scanner.
 *
 * The ledger (`cloud-reversals.ledger.json`) lists every kind of cloud resource the
 * extension creates in a system the SC owns (GitHub, DA.live, AEM, Adobe Developer
 * Console, App Builder, Commerce, the datapack stores), its removal, and the
 * user-facing path that reaches that removal. This module types the ledger (the JSON
 * is assigned to `CloudReversalLedger`, so `npm run typecheck:tests` reads its shape)
 * and holds the pure functions, so `cloud-reversals.test.ts` proves them on planted
 * sources before trusting them on `src/`.
 *
 * HOW A WRITE IS FOUND. `WRITE_SIGNATURES` is a net of call shapes read off the code on
 * 2026-11-18: an HTTP write verb as a string literal (every fetch wrapper, request
 * helper and Octokit route in `src/` names its verb that way), an `aio` command that
 * deploys, undeploys, creates or deletes, a Console SDK create, delete, subscribe or
 * update, and a `git push`. Webview code (`ui/`) is skipped: it cannot reach a cloud
 * except by a message to the host. Every file the net hits must be claimed, with its
 * exact hit count, by one resource row or by a `notCreates` entry saying why it makes
 * nothing. So a new write anywhere fails until someone classifies it.
 *
 * HOW REACHABLE IS DECIDED. A removal is reachable from a reversal path when some file
 * in the path entry's import closure contains the removal's pattern. The closure
 * follows value imports, re-exports, side-effect imports and dynamic `import()`, and
 * skips `import type` and all-type named imports (a type cannot call anything).
 *
 * @see .rptc/backlog/2026-11-18-delete-leaves-config-service-site.md (EDS-73)
 * @see .rptc/backlog/2026-11-18-delete-leaves-adobe-deployments.md (AB-87)
 */
import { dirname, join, normalize } from 'path';

import rawLedger from './cloud-reversals.ledger.json';

/** The net. Each regex is global; a hit is one match in comment-stripped code. */
export const WRITE_SIGNATURES: Record<string, RegExp> = {
    http: /['"`](?:POST|PUT|PATCH|DELETE)(?:\s+\/[^'"`]*)?['"`]/g,
    aio: /\baio\s+(?:app\s+(?:deploy|undeploy)|api-mesh:(?:create|update|delete|\$\{\w+\})|runtime\s+\w+\s+(?:create|update|delete)|console\s+\w+\s+(?:create|delete))/g,
    console:
        /\b\w+\.(?:create|delete)\w*(?:Project|Workspace|Credential|Namespace)\w*\(|\bclient\.(?:subscribe|update|set)[A-Z]\w*\(/g,
    git: /['"]push['"]/g,
};

/** What Delete Project does with a resource. Exactly one field is set (checked at runtime). */
export interface ProjectDeleteVerdict {
    /** Delete Project removes it; says which step. */
    removes?: string;
    /** Delete Project leaves it, and that is debt. Counted toward `exemptionCeiling`. */
    exemption?: string;
    /** The backlog id tracking an exemption. */
    backlog?: string;
    /** Delete Project leaves it on purpose, because it has its own reversal; says why. */
    separately?: string;
}

/** One kind of cloud resource. */
export interface ResourceRow {
    what: string;
    /** Regex source for the create primitive. Must match in one of `sites`. */
    create: string;
    /** Regex source for the removal call. Must match somewhere in `src/` when set. */
    remove?: string;
    /** Keys of `reversals` whose entry reaches `remove`. */
    reversedBy: string[];
    projectDelete: ProjectDeleteVerdict;
    /** Files the net hits that do this resource's writes, each with its exact hit count. */
    sites: Record<string, number>;
}

/** A user-facing way back: a button, a command, or an agent tool. */
export interface ReversalPath {
    /** What the SC (or the agent) sees. */
    name: string;
    /** The src-relative file the path enters through. */
    entry: string;
}

/** A file the net hits that creates nothing an SC owns. */
export interface NotACreate {
    hits: number;
    why: string;
}

export interface CloudReversalLedger {
    _what: string;
    _rules: string[];
    _method: string;
    /** Delete Project exemptions allowed. Only falls. */
    exemptionCeiling: number;
    reversals: Record<string, ReversalPath>;
    resources: Record<string, ResourceRow>;
    notCreates: Record<string, NotACreate>;
}

export const LEDGER: CloudReversalLedger = rawLedger;

/** Every file the net hits (webview `ui/` code skipped), with its matched snippets. */
export function writeHits(sources: Map<string, string>): Map<string, string[]> {
    const hits = new Map<string, string[]>();
    for (const [file, code] of sources) {
        if (/(^|\/)ui\//.test(file)) continue;
        const found = Object.entries(WRITE_SIGNATURES).flatMap(([kind, re]) =>
            [...code.matchAll(re)].map((m) => `${kind}:${m[0]}`)
        );
        if (found.length > 0) hits.set(file, found);
    }
    return hits;
}

/** Every claimed file with its count, and any file claimed twice. */
function claims(ledger: Pick<CloudReversalLedger, 'resources' | 'notCreates'>): {
    counts: Map<string, number>;
    twice: string[];
} {
    const counts = new Map<string, number>();
    const twice: string[] = [];
    const add = (file: string, n: number): void => {
        if (counts.has(file)) twice.push(file);
        counts.set(file, n);
    };
    for (const row of Object.values(ledger.resources)) {
        for (const [file, n] of Object.entries(row.sites)) add(file, n);
    }
    for (const [file, entry] of Object.entries(ledger.notCreates)) add(file, entry.hits);
    return { counts, twice };
}

/**
 * Both directions over the net: hit files nobody claimed (an unpaired create), claimed
 * files with no hit any more (a stale claim), counts that moved, and double claims.
 */
export function diffClaims(
    hits: Map<string, string[]>,
    ledger: Pick<CloudReversalLedger, 'resources' | 'notCreates'>
): { unclaimed: string[]; stale: string[]; miscounted: string[]; twice: string[] } {
    const { counts, twice } = claims(ledger);
    const unclaimed = [...hits.keys()].filter((f) => !counts.has(f)).sort();
    const stale = [...counts.keys()].filter((f) => !hits.has(f)).sort();
    const miscounted = [...counts]
        .filter(([f, n]) => hits.has(f) && hits.get(f)!.length !== n)
        .map(([f, n]) => `${f}: ledger ${n}, found ${hits.get(f)!.length}`)
        .sort();
    return { unclaimed, stale, miscounted, twice: twice.sort() };
}

/** Rows whose create primitive no longer appears in any of their own sites: ghosts. */
export function ghostRows(
    sources: Map<string, string>,
    resources: Record<string, Pick<ResourceRow, 'create' | 'sites'>>
): string[] {
    return Object.entries(resources)
        .filter(
            ([, row]) =>
                !Object.keys(row.sites).some((f) =>
                    new RegExp(row.create).test(sources.get(f) ?? '')
                )
        )
        .map(([id]) => id);
}

/** Resolve an import specifier to a src-relative file in `known`, or undefined. */
function resolveSpecifier(from: string, spec: string, known: Set<string>): string | undefined {
    let base: string;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.')) base = normalize(join(dirname(from), spec));
    else return undefined;
    return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((c) =>
        known.has(c)
    );
}

/** True when a named import list is all `type X` members. */
function allTypeNames(clause: string): boolean {
    const t = clause.trim();
    if (!t.startsWith('{') || !t.endsWith('}')) return false;
    const names = t
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return names.length > 0 && names.every((n) => n.startsWith('type '));
}

/** The src files this file loads at run time (type-only imports skipped). */
export function valueImports(file: string, code: string, known: Set<string>): string[] {
    const specs: string[] = [];
    const fromClause = /^\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/gms;
    for (const m of code.matchAll(fromClause)) {
        if (!m[1] && !allTypeNames(m[2])) specs.push(m[3]);
    }
    for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
    for (const m of code.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) specs.push(m[1]);
    return specs
        .map((s) => resolveSpecifier(file, s, known))
        .filter((f): f is string => f !== undefined);
}

/** Every file reachable from `entry` through value imports, `entry` included. */
export function importClosure(sources: Map<string, string>, entry: string): Set<string> {
    const known = new Set(sources.keys());
    const seen = new Set([entry]);
    const queue = [entry];
    while (queue.length > 0) {
        const file = queue.shift()!;
        for (const next of valueImports(file, sources.get(file) ?? '', known)) {
            if (!seen.has(next)) {
                seen.add(next);
                queue.push(next);
            }
        }
    }
    return seen;
}

/** Whether a file in `entry`'s import closure contains `pattern`. */
export function reaches(sources: Map<string, string>, entry: string, pattern: string): boolean {
    const re = new RegExp(pattern);
    return [...importClosure(sources, entry)].some((f) => re.test(sources.get(f) ?? ''));
}

/** Which verdicts a projectDelete sets; a valid one sets exactly one. */
export function verdictKinds(v: ProjectDeleteVerdict): string[] {
    return (['removes', 'exemption', 'separately'] as const).filter((k) => v[k]?.trim());
}
