/**
 * Shared scanning machinery for the two architecture enforcers.
 *
 * There are two, because there are two runtimes: `architecture-rules.test.ts`
 * enforces ADR-015 over the extension host, and
 * `webview-architecture-rules.test.ts` enforces ADR-017 over the webview side.
 *
 * They split on 2026-08-29 (PL-17). This module exists so that splitting the
 * RULES did not also fork the MACHINERY — the file list, the comment stripper
 * and the ledger contract are identical for both and must stay that way. A
 * second hand-rolled copy of the comment stripper is exactly the kind of
 * divergence the fixture-consolidation work spent a week removing.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

export const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

/** Every tracked source file, both runtimes. Callers narrow with `isWebview`. */
export const ALL_FILES = execSync(
    `git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx'`,
    { encoding: 'utf8', cwd: ROOT }
)
    .trim()
    .split('\n');

/**
 * Does this file run in a webview bundle rather than the extension host?
 *
 * A `ui/` path segment, or a `.tsx` extension. Verified 2026-08-29: every `.tsx` in `src/` is already
 * under a `ui/` directory (0 outside), so the two halves of this test agree
 * today — the `.tsx` arm is there to keep a component placed outside `ui/` from
 * silently falling under the host's rules.
 */
export function isWebview(file: string): boolean {
    return /\/ui\//.test(file) || file.endsWith('.tsx');
}

/**
 * Source with comments removed.
 *
 * Detectors match CODE, never prose: a doc comment showing
 * `new PrerequisitesCacheManager()` as usage is not a construction site, and
 * five ledger rows were phantom debt for exactly that reason (found 2026-08-28).
 *
 * Byte-identical to the version this was extracted from, deliberately. Widening
 * it to strip TRAILING comments as well would be a behaviour change smuggled
 * into a refactor: it would alter what the detectors see, and any resulting
 * ledger movement would be indistinguishable from real drift.
 */
export function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Read + strip every file once, keyed by path. */
export function readStripped(files: string[]): Map<string, string> {
    const out = new Map<string, string>();
    for (const f of files) {
        out.set(f, stripComments(readFileSync(join(ROOT, f), 'utf8')));
    }
    return out;
}

export type Ledger = Record<string, Record<string, string> | number | string>;

export function loadLedger(fileName: string): Ledger {
    return JSON.parse(readFileSync(join(__dirname, fileName), 'utf8')) as Ledger;
}

/**
 * The ledger contract, identical for both ADRs.
 *
 * A violation must be listed WITH a reason; a listed entry that no longer
 * violates also fails, so the list can only shrink. Cleaning a file means fixing
 * it AND deleting its row.
 */
export function expectClean(ledger: Ledger, check: string, violations: string[]): void {
    const rows = (ledger[check] ?? {}) as Record<string, string>;
    const found = new Set(violations);
    expect({
        newViolations: violations.filter((v) => !(v in rows)),
        staleExemptions_deleteWithTheFix: Object.keys(rows).filter((k) => !found.has(k)),
        exemptionsWithoutReasons: Object.entries(rows)
            .filter(([, reason]) => !reason || !reason.trim())
            .map(([k]) => k),
    }).toEqual({
        newViolations: [],
        staleExemptions_deleteWithTheFix: [],
        exemptionsWithoutReasons: [],
    });
}

/**
 * Classes that ACCUMULATE STATE after construction — the ones a second instance
 * silently forks.
 *
 * WHY THIS REPLACED "where did you construct it". The construction-boundary rule
 * asked about LOCATION, and location is a proxy. Measured on 2026-08-29 across
 * its own 47-row ledger: 15 rows built a stateful class (real — a second
 * instance drops a cache), 13 were stateless but module-mocked by 10+ suites (a
 * TEST-design cost, ADR-016's job), and **19 protected nothing at all**.
 *
 * The proxy also mis-fired on the largest cluster. `HelixService` held 13 of the
 * 47 rows, is stateless, and its supposed missing-credential hazard had been
 * fixed on 2026-08-15 by registering one token source at activation. Two rounds
 * of design were spent ruling that out; a rule aimed at state would have stayed
 * silent, correctly.
 *
 * Validated against the three cases this repo learned at cost — it flags
 * `GitHubTokenService` (`validationCache`) and `ComponentRegistryManager`
 * (`transformedRegistry`), and does not flag `HelixService`. Three for three.
 *
 * BOTH conditions are needed. A `this.x =` scan alone misses
 * `PrerequisitesCacheManager`, which mutates a `Map` it never reassigns.
 */
export function accumulatesState(classBody: string): boolean {
    const ctor = /\n {4}constructor\s*\([\s\S]*?\)\s*\{/.exec(classBody);
    let outside = classBody;
    if (ctor) {
        let depth = 0;
        let end = classBody.length;
        for (let i = ctor.index + ctor[0].length - 1; i < classBody.length; i++) {
            if (classBody[i] === '{') depth++;
            else if (classBody[i] === '}') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        outside = classBody.slice(0, ctor.index) + classBody.slice(end);
    }
    // A field written anywhere but the constructor is state gathered at runtime.
    if (/this\.\w+\s*=(?!=)/.test(outside)) return true;
    // ...and a container field mutated in place never gets reassigned at all.
    for (const m of classBody.matchAll(
        /private\s+(?:readonly\s+)?(\w+)\s*[:=][^;\n]*(?:Map|Set|\[\])/g,
    )) {
        if (new RegExp(`this\\.${m[1]}\\.(set|add|push|delete|clear)\\(`).test(classBody)) {
            return true;
        }
    }
    return false;
}

/** Every exported service/manager/client class in the tree, mapped to its body. */
export function classBodies(sources: Map<string, string>): Map<string, string> {
    const bodies = new Map<string, string>();
    for (const source of sources.values()) {
        for (const m of source.matchAll(
            /export class ([A-Z][A-Za-z]*(?:Service|Manager|Client))\b/g,
        )) {
            bodies.set(m[1], source.slice(m.index));
        }
    }
    return bodies;
}
