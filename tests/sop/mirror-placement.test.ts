/**
 * ADR-016 placement rule: a test lives at its subject's mirrored path.
 *
 * WHY THIS EXISTS. ADR-016 named three tiers (unit, contract, live) but never
 * said where a test file goes. That silence let a second tree — `tests/unit/` —
 * live for years without violating anything written down: 28 files against
 * 1,158 in the mirror, five modules covered from BOTH trees at once, and
 * (because a helper cannot be imported across a tree that does not know it
 * exists) suites that each re-declared setup their neighbours already had.
 *
 * The trees were merged 2026-08-28. This check is what stops a third one.
 *
 * The rule has three halves, and all are checked:
 *   1. Every test file sits under a directory that mirrors `src/`.
 *   2. No directory named for a TIER exists. Tiers describe how a test is
 *      written, not where it lives, and one file routinely holds tests of more
 *      than one tier for the same subject.
 *   3. The mirrored directory is the SUBJECT'S. Halves 1 and 2 only ask whether
 *      the path resembles one under `src/` — so a suite for
 *      `src/commands/openInClaude.ts` sitting in `tests/features/lifecycle/
 *      commands/` passed both, because that source directory exists too. Seven
 *      files were misplaced that way, invisibly, until this was added
 *      (2026-09-02); the largest case, 38 shared webview suites, was not even
 *      misplaced by this measure — it was excused by an allowlist row.
 *
 * WHAT HALF 3 CAN AND CANNOT SEE. It reads the suite's own `@/` imports and
 * takes the one whose basename matches the filename stem (or, for a split
 * family `subject-facet.test.ts`, the part before the first hyphen) as the
 * subject. Where no import matches — the subject is imported by the family's
 * `.testUtils` file, or the suite covers a type — it reports NOTHING rather
 * than guessing. That is a deliberate hole, and it is why half 1 stays: half 3
 * catches confidently-wrong placement, half 1 catches everything else.
 *
 * NAMED `mirror-placement` rather than `test-placement`: the split-family
 * detector groups suites by their first hyphen-separated token, so a
 * `test-*.test.ts` name reads as a split of `tests/sop/test-family-setup`.
 * That would have been a false family, not a real one.
 *
 * POSITIVE CONTROLS run first. A zero from a check that never ran looks
 * identical to a clean result, and this repo has paid for that twice.
 */

import * as fs from 'fs';
import * as path from 'path';

const TESTS_ROOT = path.resolve(__dirname, '..');

/**
 * Top-level directories under `tests/` that are NOT mirrors of `src/`, each
 * with the reason it is allowed. This list may only shrink.
 */
const NON_MIRROR_DIRS: Record<string, string> = {
    __mocks__: 'jest module mocks — resolved by name, cannot be relocated',
    fixtures: 'captured fixture data (ADR-016 contract tier), not test files',
    helpers: 'cross-cutting test helpers shared by many subjects',
    setup: 'jest setup files named in jest.config',
    integration: 'multi-subject flows that mirror no single source file',
    security: 'cross-cutting security checks that span subjects',
    sop: 'architecture and craft checks whose subject is the repo itself',
    templates: 'checks over generated template output, not over a source file',
    // Subjects that genuinely live OUTSIDE src/ — a mirror is impossible.
    scripts: 'subject is the repo\'s scripts/ directory, not src/',
    hooks: 'subject is .claude/hooks/, not src/',
    cleanup: 'asserts deprecated files STAY deleted — its subject is absence',
};

/**
 * Files misplaced before the rule existed, each with the reason it has not been
 * moved yet. This list may only SHRINK — a row whose file no longer offends
 * fails the same way an unlisted offender does.
 */
const PLACEMENT_EXEMPTIONS: Record<string, string> = {
    'commands/handlers/HandlerContext.test.ts':
        'subject is the HandlerContext TYPE (src/types/handlers.ts), not a file under ' +
        'src/commands/handlers/, which does not exist. Move to tests/types/ or fold into ' +
        'the factory suite — needs a call on which.',
    'features/sidebar/integration/extensionActivation.test.ts':
        'spans extension activation + sidebar registration, so it mirrors no single ' +
        'source file. Belongs in tests/integration/ — pending a read of what it asserts.',
    'features/sidebar/integration/navigationCommands.test.ts':
        'same: cross-subject navigation wiring, not a mirror of one source file.',
};

/**
 * Directory names that would re-create a tier tree. Banned outright.
 */
const BANNED_TIER_DIRS = ['unit', 'contract', 'live', 'e2e'];

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            out.push(...walk(full));
        } else if (/\.test\.tsx?$/.test(entry.name)) {
            out.push(path.relative(TESTS_ROOT, full));
        }
    }
    return out;
}

const TEST_FILES = walk(TESTS_ROOT);

/** `@/x/y` -> `x/y` under src/. The jest moduleNameMapper aliases, one rule. */
const ALIAS = /^@\//;

/** A suite's own imports, in source order. */
const IMPORTS = /from\s+'(@\/[^']+)'/g;

/**
 * The src-relative DIRECTORY the suite's subject lives in, or undefined when no
 * import names it — see "what half 3 can and cannot see" above.
 */
function subjectDirOf(file: string): string | undefined {
    const base = path.basename(file);
    const stem = base.slice(0, base.indexOf('.'));
    // `subject-facet.test.ts` is one file of a split family for `subject`.
    const family = stem.split('-')[0];
    const source = fs.readFileSync(path.join(TESTS_ROOT, file), 'utf8');
    for (const [, spec] of source.matchAll(IMPORTS)) {
        const name = path.basename(spec);
        if (name === stem || name === family) {
            return path.dirname(spec.replace(ALIAS, ''));
        }
    }
    return undefined;
}

/**
 * Does this suite sit somewhere other than its subject's mirrored directory?
 *
 * Only asked of files that CLAIM to be mirrors. A suite under a listed
 * non-mirror directory has already declared it mirrors nothing — and the
 * resolver will happily name a "subject" for one anyway, from whichever import
 * happens to share its filename. `templates/ai-bundle-coherence.test.ts` is the
 * live example: it checks generated bundle output and imports a same-named type
 * from `src/types`, which is not its subject in any useful sense.
 */
function mismatch(file: string, subjectDir: string): boolean {
    if (file.split(path.sep)[0] in NON_MIRROR_DIRS) return false;
    if (file in PLACEMENT_EXEMPTIONS) return false;
    return path.dirname(file) !== subjectDir;
}

describe('ADR-016 placement: tests mirror src/', () => {
    it('POSITIVE CONTROL: the walk finds the suite tree at all', () => {
        // If this ever reads zero, every assertion below passes vacuously.
        expect(TEST_FILES.length).toBeGreaterThan(500);
        expect(TEST_FILES).toContain(path.join('sop', 'mirror-placement.test.ts'));
    });

    it('POSITIVE CONTROL: a planted tier path is recognised as a violation', () => {
        const planted = path.join('unit', 'features', 'eds', 'services', 'thing.test.ts');
        expect(BANNED_TIER_DIRS).toContain(planted.split(path.sep)[0]);
    });

    it('no test file lives in a tier directory', () => {
        const offenders = TEST_FILES.filter((f) => BANNED_TIER_DIRS.includes(f.split(path.sep)[0]));
        expect(offenders).toEqual([]);
    });

    it('every test file is under a src/ mirror or a listed non-mirror directory', () => {
        const offenders = TEST_FILES.filter((f) => {
            const top = f.split(path.sep)[0];
            if (top in NON_MIRROR_DIRS) return false;
            if (f in PLACEMENT_EXEMPTIONS) return false;
            // A mirror path must correspond to a real directory under src/.
            const mirrored = path.resolve(TESTS_ROOT, '..', 'src', path.dirname(f));
            return !fs.existsSync(mirrored);
        });
        expect(offenders).toEqual([]);
    });

    it('every placement exemption is still a real offender — a fixed row must leave', () => {
        const stale = Object.keys(PLACEMENT_EXEMPTIONS).filter((f) => {
            if (!TEST_FILES.includes(f)) return true; // file gone or renamed
            const mirrored = path.resolve(TESTS_ROOT, '..', 'src', path.dirname(f));
            return fs.existsSync(mirrored); // now correctly placed
        });
        expect(stale).toEqual([]);
    });

    it('POSITIVE CONTROL: the subject resolver finds a subject for most suites', () => {
        // If this collapses, the half-3 check below passes over an empty list.
        const resolved = TEST_FILES.filter((f) => subjectDirOf(f) !== undefined);
        expect(resolved.length).toBeGreaterThan(400);
    });

    it('POSITIVE CONTROL: a suite moved away from its subject is recognised', () => {
        // The real openInClaude case, as it stood before 2026-09-02.
        expect(
            mismatch('features/lifecycle/commands/openInClaude.misc.test.ts', 'commands')
        ).toBe(true);
        expect(mismatch('commands/openInClaude.misc.test.ts', 'commands')).toBe(false);
    });

    it('every test whose subject can be resolved sits in that subject\'s directory', () => {
        const offenders = TEST_FILES.map((f) => {
            const subjectDir = subjectDirOf(f);
            if (subjectDir === undefined) return undefined;
            return mismatch(f, subjectDir) ? `${f} -> src/${subjectDir}` : undefined;
        }).filter(Boolean);
        expect(offenders).toEqual([]);
    });

    it('the non-mirror allowlist carries a reason for every entry, and may only shrink', () => {
        const reasonless = Object.entries(NON_MIRROR_DIRS)
            .filter(([, reason]) => !reason.trim())
            .map(([dir]) => dir);
        expect(reasonless).toEqual([]);

        // A listed directory that no longer exists is a stale row — delete it.
        const stale = Object.keys(NON_MIRROR_DIRS).filter(
            (d) => !fs.existsSync(path.join(TESTS_ROOT, d))
        );
        expect(stale).toEqual([]);
    });
});
