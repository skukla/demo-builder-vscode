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
 * The rule has two halves, and both are checked:
 *   1. Every test file sits under a directory that mirrors `src/`.
 *   2. No directory named for a TIER exists. Tiers describe how a test is
 *      written, not where it lives, and one file routinely holds tests of more
 *      than one tier for the same subject.
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
    'webview-ui': 'legacy shared webview UI suites (documented in tests/README.md)',
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

describe('ADR-016 placement: tests mirror src/', () => {
    it('POSITIVE CONTROL: the walk finds the suite tree at all', () => {
        // If this ever reads zero, every assertion below passes vacuously.
        expect(TEST_FILES.length).toBeGreaterThan(500);
        expect(TEST_FILES).toContain(path.join('sop', 'test-placement.test.ts'));
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
