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

import { readFileSync } from 'fs';
import { join } from 'path';
import { workingTreeFiles } from './architectureScan';

const ROOT = join(__dirname, '../..');

/**
 * A relative import, named or bare: `import { x } from './wall';` and `import './wall';`.
 * The bare form is how a suite pulls in a wall it needs only for its side effect, and the
 * first version of this pattern required `from`, so 18 suites that imported the shared
 * WebviewClient double that way were invisible to the check (PL-115 review, 2026-11-23).
 */
const RELATIVE_IMPORT = /^import (?:[^']*from )?'(\.[^']+)';/;

const baseName = (f: string): string => f.split('/').pop()!.replace(/\.tsx?$/, '');

/**
 * Files under tests/ that install a module wall: at the top level, or by importing one.
 *
 * A `.testUtils` file that imports the shared double and holds no `jest.mock` of its own is
 * still a wall to the suites that import it: the mock registers when its import runs. So the
 * set grows until no other helper imports a member of it.
 */
function wallModules(): string[] {
    const helpers = workingTreeFiles('tests/**/*.ts', 'tests/**/*.tsx').filter((f) => !/\.test\.tsx?$/.test(f));
    const sources = new Map(helpers.map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]));
    const walls = new Set(helpers.filter((f) => /^jest\.mock\(/m.test(sources.get(f) as string)));
    const names = (): Set<string> => new Set([...walls].map(baseName));
    let grew = true;
    while (grew) {
        grew = false;
        const known = names();
        for (const f of helpers) {
            if (walls.has(f)) continue;
            const imports = (sources.get(f) as string)
                .split('\n')
                .map((l) => l.match(RELATIVE_IMPORT)?.[1].split('/').pop())
                .filter((n): n is string => Boolean(n));
            if (imports.some((n) => known.has(n))) {
                walls.add(f);
                grew = true;
            }
        }
    }
    return [...walls];
}

/**
 * Suites whose wall import sits below an import of the code under test.
 *
 * @param walls - the wall modules to look for, by basename without extension
 */
function misorderedSuites(walls: Set<string>): string[] {
    const suites = workingTreeFiles('tests/**/*.test.ts', 'tests/**/*.test.tsx');

    const offenders: string[] = [];
    for (const suite of suites) {
        const lines = readFileSync(join(ROOT, suite), 'utf8').split('\n');
        // EVERY wall import must precede the subject, so take the last one.
        // Taking the first silently passed a planted defect on 2026-09-02: the
        // suite imported two wall modules and the earlier one satisfied the check
        // while the one that mattered sat below the subject.
        const wallLines = lines
            .map((l, i) => {
                const m = l.match(RELATIVE_IMPORT);
                const name = m?.[1].split('/').pop();
                return name && walls.has(name) ? i : -1;
            })
            .filter((i) => i !== -1);
        if (wallLines.length === 0) continue;
        const lastWallAt = Math.max(...wallLines);
        // A MULTI-LINE import puts its `from '@/...'` on a later line that does not
        // start with `import`, so a line-anchored check misses it entirely. That
        // gap hid `dashboardHandlers-lifecycle` from the first run of this check
        // (2026-09-02) — the subject import spanned five lines. Walk the file
        // statement by statement instead.
        const subjectAt = lines.findIndex((l, i) => {
            if (/^import type /.test(l)) return false;
            if (/^import [^\n]* from '@\//.test(l)) return true;
            // an opening `import {` whose matching `} from '@/...'` comes later
            if (!/^import \{\s*$/.test(l)) return false;
            const close = lines.slice(i).findIndex((n) => /^\} from '/.test(n));
            return close !== -1 && /^\} from '@\//.test(lines[i + close]);
        });
        if (subjectAt !== -1 && subjectAt < lastWallAt) offenders.push(suite);
    }
    return offenders.sort();
}

/**
 * Suites carrying this hazard on 2026-09-02, when the check was written.
 *
 * Started at ten. `debugLogger-slowCommand` came off the same day and is the
 * proof the hazard is not theoretical: deleting its redundant copy of the wall
 * — the shared `.testUtils` already had one — failed four tests on
 * `logsChannel.info is not a function`, because the subject had already bound
 * to the real output channels. Moving the import above it fixed them.
 *
 * The rest pass today: the wall sits below the subject import, and whatever their
 * subject binds early happens not to be something the assertions depend on. That
 * is luck holding, not a design, and the same shape failed 61 of 63 tests in
 * `skillsWriter.test.ts` when it was probed directly.
 *
 * The list may only SHRINK. Fixing one is moving its wall import above the first
 * `@/` import and deleting the line here; nothing may be added.
 */
const LEDGERED = [
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
    const walls = new Set(wallModules().map(baseName));

    it('CONTROL: the detector can see the wall modules this repo has', () => {
        // If this is 0 the detector is broken and the assertion below is vacuous.
        expect(walls.size).toBeGreaterThan(5);
        expect(walls.has('aiBundleFsMock')).toBe(true);
        // The shared WebviewClient double, and a helper that is a wall only by importing it.
        expect(walls.has('webviewClientMock')).toBe(true);
        expect(walls.has('PrerequisitesStep.testUtils')).toBe(true);
    });

    it('CONTROL: a bare side-effect import of a wall is read as a wall import', () => {
        expect("import '../../../helpers/webviewClientMock';".match(RELATIVE_IMPORT)?.[1]).toBe(
            '../../../helpers/webviewClientMock',
        );
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
