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
export const ALL_FILES = (() => {
    // `ls-files` alone lists TRACKED files only, so a brand-new file is invisible
    // to every rule in this directory until it is committed. That is not
    // theoretical: on 2026-08-29 two session-accessor modules passed a green gate
    // and turned the build red the moment they were committed, because the scan
    // could not see them at the one time it mattered — before the commit.
    //
    // `--others --exclude-standard` adds untracked-but-not-ignored files, so a
    // new file is judged by the same rules as every existing one, on the run
    // BEFORE it lands.
    const out = execSync(
        `git ls-files --cached --others --exclude-standard ` +
            `'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx'`,
        { encoding: 'utf8', cwd: ROOT }
    ).trim();
    return [...new Set(out ? out.split('\n') : [])].sort();
})();

/**
 * Absolute paths to the source files under `dir`, excluding tests.
 *
 * Three enforcer suites in this directory hand-rolled a recursive `readdirSync`
 * walker for this, in two byte-identical copies and one that differed only in
 * how it spelled the same filters (found 2026-09-02). They now share this,
 * which is built on `ALL_FILES` and therefore inherits the property those
 * walkers did not have: `git ls-files --cached --others --exclude-standard`
 * excludes files git is ignoring, so a build artefact left under `src/` is not
 * judged as source.
 *
 * @param dir - absolute path to scan under; files outside it are dropped
 * @param extensions - which suffixes count, defaulting to both TypeScript ones
 */
export function sourceFilesUnder(dir: string, extensions: string[] = ['.ts', '.tsx']): string[] {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    return ALL_FILES.map((file) => join(ROOT, file))
        .filter((file) => file.startsWith(prefix))
        .filter((file) => extensions.some((ext) => file.endsWith(ext)))
        .filter((file) => !file.includes('.test.') && !file.includes('.spec.'));
}

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
/**
 * The same contract for a ledger entry that is a COUNT rather than a list.
 *
 * A ceiling exists where a rule is agreed but the existing code cannot be brought
 * to zero yet, so the number is pinned and may only fall. That needs both
 * directions to be real: growth fails, and so does a pin left above a count that
 * has already improved — otherwise the win is not locked in and the number drifts
 * back up under a ceiling nobody lowered.
 *
 * Both directions matter because one of them was missing. `patternBSendMessageCeiling`
 * carried a shrink branch reading `expect(msg).toBe(msg)` — a string compared to
 * itself, which cannot fail — under a comment promising to lock the win in. The
 * sibling ceiling had no shrink branch at all. Found 2026-08-30.
 */
export function expectCeiling(ledger: Ledger, check: string, count: number): void {
    const ceiling = ledger[check] as number;
    expect(typeof ceiling).toBe('number');
    expect({
        check,
        count,
        // Above the pin: the thing the rule forbids has grown. Fix the new one.
        // Below it: good — edit the ledger to `count` so it cannot grow back.
        verdict: count > ceiling ? 'GREW_ABOVE_CEILING' : count < ceiling ? 'LOWER_THE_PIN' : 'at',
    }).toEqual({ check, count, verdict: 'at' });
}

/**
 * A rule whose ledger reached ZERO, banked so it cannot be un-reached.
 *
 * `expectClean` over an empty ledger already fails on a new violation, so this
 * is not about detection — it is about the SLOT. A ledger key is an invitation:
 * the next person who trips the rule can add a row with a reason and stay green,
 * and the rule quietly becomes negotiable again. A ban has nowhere to write that
 * row.
 *
 * So this asserts BOTH halves: no violations, and no ledger key. Re-adding an
 * exemption for a banned rule fails the build naming the rule, which is the
 * whole point — the argument for the exemption has to be made to a person, not
 * to a JSON file.
 *
 * The arc every ledger here is on: seed at the measured count, shrink only, and
 * when it empties, delete it. `featureBarrels`, `reExportIndex` and the
 * `needsAuth` review ledger all completed it; the type-erasing-cast ceilings are
 * still on it.
 */
export function expectBanned(ledger: Ledger, check: string, violations: string[]): void {
    expect({
        check,
        violations,
        reopenedExemptions: Object.keys((ledger[check] ?? {}) as Record<string, string>),
    }).toEqual({ check, violations: [], reopenedExemptions: [] });
}

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
        /private\s+(?:readonly\s+)?(\w+)\s*[:=][^;\n]*(?:Map|Set|\[\])/g
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
            /export class ([A-Z][A-Za-z]*(?:Service|Manager|Client))\b/g
        )) {
            bodies.set(m[1], source.slice(m.index));
        }
    }
    return bodies;
}

/**
 * The stateful set, closed over OWNERSHIP.
 *
 * A class is stateful here if it accumulates state itself, OR if it constructs
 * one that does — because rebuilding the owner rebuilds the owned.
 *
 * Without the closure the rule misses the case that motivated it.
 * `PrerequisitesManager` writes no field outside its constructor and mutates no
 * container; it simply holds
 * `private cacheManager = new PrerequisitesCacheManager()`. Rebuilding the
 * manager throws that cache away, which is exactly the defect
 * `prerequisiteCacheLifetime.test.ts` pins — and a direct-only scan calls the
 * manager stateless and says nothing.
 */
export function statefulClosure(bodies: Map<string, string>): Set<string> {
    const stateful = new Set(
        [...bodies].filter(([, body]) => accumulatesState(body)).map(([name]) => name)
    );
    // Fixpoint: owning a stateful class makes you stateful, transitively.
    for (let changed = true; changed; ) {
        changed = false;
        for (const [name, body] of bodies) {
            if (stateful.has(name)) continue;
            for (const m of body.matchAll(/new ([A-Z][A-Za-z]*(?:Service|Manager|Client))\(/g)) {
                if (m[1] !== name && stateful.has(m[1])) {
                    stateful.add(name);
                    changed = true;
                    break;
                }
            }
        }
    }
    return stateful;
}
