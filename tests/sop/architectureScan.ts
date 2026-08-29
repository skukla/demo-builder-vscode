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
