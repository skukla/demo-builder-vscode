/**
 * A shared mock wall must be imported BEFORE the subject it is walling off.
 *
 * WHY THIS IS AN ENFORCER AND NOT A COMMENT. `jest.mock` hoists above the
 * imports of the module it appears in, not across modules. So when a suite
 * imports a shared wall file, the mock registers only when that file's body
 * runs — and if the suite's `@/...` import of its subject comes first, the
 * subject has already bound to the real module. The suite then fails as
 * assertion noise with no error naming the cause.
 *
 * Measured 2026-09-02 on `skillsWriter.test.ts`: moving its wall import below
 * the `@/` imports failed 61 of its 63 tests. Nothing in the file looks wrong
 * afterwards.
 *
 * What makes it worth a test rather than a convention is that `import/order` is
 * configured in `eslint.config.mjs` as an auto-fixable warning. A routine
 * `eslint --fix` is one plausible keystroke away from reordering these imports
 * and breaking suites nobody was editing. It does not do so today — that was
 * checked — and this fails the build the day it starts.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');

/** Files under tests/ that install a module wall at the top level. */
function wallModules(): string[] {
    return execSync(`git ls-files 'tests/**/*.ts' 'tests/**/*.tsx'`, { encoding: 'utf8', cwd: ROOT })
        .trim()
        .split('\n')
        .filter((f) => !/\.test\.tsx?$/.test(f))
        .filter((f) => /^jest\.mock\(/m.test(readFileSync(join(ROOT, f), 'utf8')));
}

/**
 * Suites whose wall import sits below an import of the code under test.
 *
 * @param walls - the wall modules to look for, by basename without extension
 */
function misorderedSuites(walls: Set<string>): string[] {
    const suites = execSync(`git ls-files 'tests/**/*.test.ts' 'tests/**/*.test.tsx'`, {
        encoding: 'utf8',
        cwd: ROOT,
    })
        .trim()
        .split('\n');

    const offenders: string[] = [];
    for (const suite of suites) {
        const lines = readFileSync(join(ROOT, suite), 'utf8').split('\n');
        // EVERY wall import must precede the subject, so take the last one.
        // Taking the first silently passed a planted defect on 2026-09-02: the
        // suite imported two wall modules and the earlier one satisfied the check
        // while the one that mattered sat below the subject.
        const wallLines = lines
            .map((l, i) => {
                const m = l.match(/^import [^']*from '(\.[^']+)';/);
                const name = m?.[1].split('/').pop();
                return name && walls.has(name) ? i : -1;
            })
            .filter((i) => i !== -1);
        if (wallLines.length === 0) continue;
        const lastWallAt = Math.max(...wallLines);
        const subjectAt = lines.findIndex((l) => /^import (?!type )[^\n]* from '@\//.test(l));
        if (subjectAt !== -1 && subjectAt < lastWallAt) offenders.push(suite);
    }
    return offenders.sort();
}

/**
 * Suites carrying this hazard on 2026-09-02, when the check was written.
 *
 * All ten pass today: the wall sits below the subject import, and whatever their
 * subject binds early happens not to be something the assertions depend on. That
 * is luck holding, not a design, and the same shape failed 61 of 63 tests in
 * `skillsWriter.test.ts` when it was probed directly.
 *
 * The list may only SHRINK. Fixing one is moving its wall import above the first
 * `@/` import and deleting the line here; nothing may be added.
 */
const LEDGERED = [
    'tests/core/logging/debugLogger-slowCommand.test.ts',
    'tests/features/dashboard/handlers/aiHandlers.logAiVerification.test.ts',
    'tests/features/dashboard/handlers/dashboardHandlers-actions.test.ts',
    'tests/features/dashboard/handlers/dashboardHandlers-deployMesh.test.ts',
    'tests/features/dashboard/handlers/dashboardHandlers-requestStatus.test.ts',
    'tests/features/dashboard/handlers/dashboardHandlers-switchOrg.test.ts',
    'tests/features/dashboard/handlers/dashboardHandlers-unknownDeployed.test.ts',
    'tests/features/mesh/services/stalenessDetector-scope.test.ts',
    'tests/features/prerequisites/handlers/continueHandler-edge-cases.test.ts',
    'tests/features/projects-dashboard/commands/showProjectsList-sidebar.test.ts',
];

describe('a shared mock wall is imported before the subject', () => {
    const walls = new Set(wallModules().map((f) => f.split('/').pop()!.replace(/\.tsx?$/, '')));

    it('CONTROL: the detector can see the wall modules this repo has', () => {
        // If this is 0 the detector is broken and the assertion below is vacuous.
        expect(walls.size).toBeGreaterThan(5);
        expect(walls.has('aiBundleFsMock')).toBe(true);
    });

    it('CONTROL: a suite with its wall import moved below the subject is caught', () => {
        // Drives the same comparison the real check does, on a synthetic file,
        // so a refactor that guts the check fails here rather than passing quietly.
        const lines = [
            "import { thing } from '@/features/x/thing';",
            "import { fsPromises } from './aiBundleFsMock';",
        ];
        const wallAt = lines.findIndex((l) => /aiBundleFsMock/.test(l));
        const subjectAt = lines.findIndex((l) => /from '@\//.test(l));
        expect(subjectAt).toBeLessThan(wallAt);
    });

    it('no NEW suite imports its subject before the wall, and fixed ones leave the ledger', () => {
        const current = misorderedSuites(walls);
        const unlisted = current.filter((f) => !LEDGERED.includes(f));
        const stale = LEDGERED.filter((f) => !current.includes(f));
        expect({ newlyMisordered: unlisted, fixedButStillLedgered: stale }).toEqual({
            newlyMisordered: [],
            fixedButStillLedgered: [],
        });
    });
});
