/**
 * Accessor-only guard for the retired singular mesh/app state (ADR-011 D3 Step 07).
 *
 * The keyed `project.appBuilderComponents` map is the single source of truth;
 * the legacy `meshState`/`appState` singletons are LEGACY-READ-ONLY (old
 * manifests keep loading via the loader + migration forever). This guard greps
 * the production source for `.meshState` / `.appState` property access and
 * fails when any file outside the documented allowlist touches them — the
 * failure mode it prevents is a reader silently seeing `undefined` (or a
 * writer silently losing data) after Step 07 stopped persisting the singulars.
 *
 * Allowlisted files (each with a documented reason):
 * - core/state/projectFileLoader.ts               — reads manifest.meshState/appState (legacy manifests load forever)
 * - core/state/appBuilderComponentMigration.ts    — the legacy→keyed read-migration
 * - features/app-builder/services/appBuilderComponentState.ts — accessor module (legacy synthesis fallback)
 * - features/app-builder/services/appComponentManager.ts — clearing write (prevents legacy-synthesis resurrection on remove)
 * - features/mesh/services/stalenessDetector.ts   — getCurrentMeshState per-field legacy fallback + post-deploy clearing write
 * - features/mesh/services/meshUpdateDecline.ts   — isMeshUpdateDeclined per-field legacy fallback read
 * - features/mesh/services/meshVerifier.ts        — clearing write (mesh gone remotely)
 * - types/typeGuards.ts                           — getMeshEndpointUrl legacy fallback
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
    ['core/state/projectFileLoader.ts', 2],
    ['core/state/appBuilderComponentMigration.ts', 5],
    ['features/app-builder/services/appBuilderComponentState.ts', 3],
    ['features/app-builder/services/appComponentManager.ts', 1],
    ['features/mesh/services/stalenessDetector.ts', 2],
    ['features/mesh/services/meshUpdateDecline.ts', 1],
    ['features/mesh/services/meshVerifier.ts', 1],
    ['types/typeGuards.ts', 1],
]);

const SINGULAR_ACCESS = /\.(meshState|appState)\b/;

/** True for lines that are purely comments (no code). */
function isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return (
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('/*')
    );
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
