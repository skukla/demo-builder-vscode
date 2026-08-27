/**
 * Accessor-only guard for the retired singular mesh/app state (ADR-011 D3 Step 07).
 *
 * The keyed `project.appBuilderComponents` map is the single source of truth.
 * PL-1 phase 2 removed the legacy `meshState`/`appState` fields from `Project`
 * entirely; they survive ONLY on `ProjectManifest`, read by the quarantined
 * legacy→keyed migration inside the load path (which is also the activation
 * sweep's path, so a dormant machine that skipped phase 1 still migrates
 * safely). This guard greps the production source for `.meshState` /
 * `.appState` property access and fails when any file outside the allowlist
 * touches them — the compiler already blocks `Project` access (the fields are
 * gone), so what this now guards is the MANIFEST fields growing new readers
 * outside the quarantine.
 *
 * Allowlisted files (each with a documented reason):
 * - core/state/appBuilderComponentMigration.ts — the quarantined legacy→keyed
 *   read-migration; the ONE reader of manifest.meshState/appState.
 *
 * History: the allowlist held 7 files / 15 sites until phase 2 (the accessor
 * synthesis family, per-field fallbacks, and clearing writes — all deleted).
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.join(__dirname, '../../../src');

/**
 * Allowlist WITH pinned per-file match counts (the repo's count-pin pattern):
 * a NEW singular access inside an allowlisted file fails loudly and forces a
 * deliberate re-pin here, instead of hiding behind the file's allowlisting.
 */
const ALLOWED_FILES: ReadonlyMap<string, number> = new Map([
    ['core/state/appBuilderComponentMigration.ts', 5],
]);

const SINGULAR_ACCESS = /\.(meshState|appState)\b/;

/** True for lines that are purely comments (no code). */
function isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function walkSourceFiles(dir: string, collected: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkSourceFiles(fullPath, collected);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
            collected.push(fullPath);
        }
    }
    return collected;
}

/** Count the non-comment singular-access lines in one source file. */
function countSingularAccesses(filePath: string): number {
    let count = 0;
    for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
        if (isCommentLine(line)) continue;
        if (SINGULAR_ACCESS.test(line)) count++;
    }
    return count;
}

describe('singular meshState/appState access guard (ADR-011 D3 Step 07)', () => {
    it('no production file outside the allowlist accesses .meshState or .appState', () => {
        const violations: string[] = [];

        for (const filePath of walkSourceFiles(SRC_ROOT)) {
            const relative = path.relative(SRC_ROOT, filePath).split(path.sep).join('/');
            if (ALLOWED_FILES.has(relative)) continue;

            const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
            lines.forEach((line, index) => {
                if (isCommentLine(line)) return;
                if (SINGULAR_ACCESS.test(line)) {
                    violations.push(`${relative}:${index + 1}  ${line.trim()}`);
                }
            });
        }

        expect(violations).toEqual([]);
    });

    it('allowlisted files match their pinned singular-access counts exactly', () => {
        const actual: Record<string, number> = {};
        for (const relative of ALLOWED_FILES.keys()) {
            actual[relative] = countSingularAccesses(path.join(SRC_ROOT, relative));
        }
        expect(actual).toEqual(Object.fromEntries(ALLOWED_FILES));
    });

    it('the allowlist stays tight — every allowlisted file still exists', () => {
        for (const relative of ALLOWED_FILES.keys()) {
            expect(fs.existsSync(path.join(SRC_ROOT, relative))).toBe(true);
        }
    });
});
