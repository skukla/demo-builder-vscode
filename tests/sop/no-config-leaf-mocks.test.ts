/**
 * SOP Compliance Test: No config-leaf mocks
 *
 * Enforces the "injection seams over leaf-module mocks" standard
 * (.rptc/sop/testing-guide.md → "Dependency Mocking"). Tests must NOT
 * `jest.mock()` a bundled `config/*.json` leaf — code that reads such a leaf
 * should expose an injectable parameter (defaulting to the bundled data) so
 * tests pass a fixture instead.
 *
 * Pre-existing violations are grandfathered in ALLOWLIST below. That list must
 * only ever shrink: migrate a file to the seam, then remove it from the list.
 * Adding a new entry is not allowed — fix the test instead.
 *
 * @see .rptc/sop/testing-guide.md
 * @see tests/features/project-creation/ui/helpers/demoPackageLoader.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Detects `jest.mock('<…>/config/<…>.json')` calls. Returns 1-based line
 * numbers of each offending call.
 */
function findConfigLeafMocks(content: string): number[] {
    // jest.mock( '<anything>/config/<anything>.json' …
    const pattern = /jest\.mock\(\s*['"][^'"]*\/config\/[^'"]*\.json['"]/;
    const hits: number[] = [];
    content.split('\n').forEach((line, i) => {
        if (pattern.test(line)) {
            hits.push(i + 1);
        }
    });
    return hits;
}

const testsDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(testsDir, '..');

/** This guard's own file — excluded so its self-test strings don't self-trip. */
const SELF = path.relative(repoRoot, __filename).replace(/\\/g, '/');

/**
 * Pre-existing config-leaf mocks, grandfathered. SHRINK ONLY — migrate to the
 * injection seam (see edsResetParams.ts `packages` param) and delete the entry.
 *
 * Currently EMPTY: every config-leaf mock has been migrated to the seam. New
 * entries are not allowed — fix the test instead.
 */
const ALLOWLIST: readonly string[] = [];

function collectTestFiles(dir: string): string[] {
    const files: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        // Directory removed mid-walk (e.g. a concurrent suite's temp dir). Skip it
        // rather than crash the scan — this is a static check of committed files.
        return files;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            files.push(...collectTestFiles(full));
        } else if (/\.test\.tsx?$/.test(entry.name)) {
            files.push(full);
        }
    }
    return files;
}

describe('SOP: no config-leaf mocks', () => {
    describe('detector', () => {
        it('flags a jest.mock of a config/*.json leaf', () => {
            // Built by concatenation so this literal does not trip the scanner.
            const sample = "jest.mock('@/features/project-creation/config/" + "demo-packages.json', () => ({}));";
            expect(findConfigLeafMocks(sample)).toEqual([1]);
        });

        it('ignores loader-module and non-config mocks', () => {
            const sample = [
                "jest.mock('@/features/project-creation/services/demoPackageLoader');",
                "jest.mock('@/core/config/ConfigurationLoader');",
                "jest.mock('fs');",
            ].join('\n');
            expect(findConfigLeafMocks(sample)).toEqual([]);
        });
    });

    describe('codebase compliance', () => {
        const offenders = collectTestFiles(testsDir)
            .map(full => ({ rel: path.relative(repoRoot, full).replace(/\\/g, '/'), full }))
            .filter(({ rel }) => rel !== SELF)
            .filter(({ full }) => {
                // Skip files that vanish between enumeration and read — a concurrently
                // running suite may create then delete temp *.test.ts files under tests/,
                // and a stale path would otherwise crash the scan (ENOENT) at collect time.
                let src: string;
                try {
                    src = fs.readFileSync(full, 'utf-8');
                } catch {
                    return false;
                }
                return findConfigLeafMocks(src).length > 0;
            })
            .map(({ rel }) => rel);

        it('has no NEW config-leaf mocks outside the allowlist', () => {
            const unexpected = offenders.filter(rel => !ALLOWLIST.includes(rel));
            expect(unexpected).toEqual([]);
        });

        it('has no stale allowlist entries (allowlist only shrinks)', () => {
            const stale = ALLOWLIST.filter(rel => !offenders.includes(rel));
            expect(stale).toEqual([]);
        });
    });
});
