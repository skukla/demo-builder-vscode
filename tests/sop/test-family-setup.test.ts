/**
 * Split test families share their setup (ADR-016 / PL-14).
 *
 * A "family" is 2+ suites for one subject in one directory
 * (`edsResetService-auth.test.ts` + `edsResetService-meshAuth.test.ts` …).
 * When such a family has no shared `<subject>.testUtils.*`, every suite
 * re-declares the same mock scaffold — the pattern behind BOTH measured
 * problems: the tests-tree duplication (160 clones) and the bulk stale-mock
 * breakages (one new export broke nine suites on 2026-08-28).
 *
 * Today's 89 families are frozen in the ledger, NOT force-extracted: some are
 * split for size with genuinely different setup, and mass extraction would
 * codify a guess. The rule that matters is the ratchet — the list may only
 * shrink, and a NEW family without shared setup fails immediately.
 *
 * WHAT THE FIRST ELEVEN EXTRACTIONS ACTUALLY FOUND (2026-08-31), because it
 * changes how you should approach the twelfth:
 *
 * **79 of the shared mocks were DEAD.** Not duplicated — dead. Deleted from every
 * suite that carried them, with all tests still passing. Ten of the eleven
 * families had some; three consisted of almost nothing else.
 *
 * So the first move on a family is NOT to design a shared harness. It is to
 * delete each shared mock and re-run. Three things that only that shows:
 *
 *   1. `jest.mock('vscode')` is a no-op — jest.config.js already maps `^vscode$`
 *      to `tests/__mocks__/vscode.ts`. Copies of it were found in four families.
 *   2. Mocks that serve only each other. Twice — meshVerifier and componentManager
 *      — a ServiceLocator mock plus a line wiring a fake into it were BOTH dead,
 *      because the subject takes that fake by constructor. Probed one at a time
 *      the mock looks essential; probe the SET.
 *   3. A mock the SPEC imports cannot move to a shared file at all. A `jest.mock`
 *      only hoists above the imports of the module it appears in, so moving one
 *      registers it too late — 23 tests failed on that in the deployMesh family.
 *
 * And the counter-example, because "shared setup is usually dead" is a common
 * case and not a rule: aiContextWriter's four suites shared 74 lines of FIXTURES,
 * byte-identical and all load-bearing. That is what extraction is for.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, basename } from 'path';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const LEDGER = JSON.parse(
    readFileSync(join(__dirname, 'test-family-setup.ledger.json'), 'utf8'),
) as { families: string[] };

/** A suite's `@/` imports, in source order. */
const AT_IMPORT = /from\s+'(@\/[^']+)'/g;

/**
 * The module a suite is about, or undefined when its imports do not say — the
 * subject arrives via a `.testUtils`, or the suite has no `@/` import at all
 * (the enforcer and template suites, whose subject is the repo itself).
 */
function subjectOf(file: string): string | undefined {
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const [, spec] of source.matchAll(AT_IMPORT)) {
        if (!spec.includes('/types/')) return spec;
    }
    return undefined;
}

/**
 * Is this group of suites really a SPLIT FAMILY — several suites for one thing?
 *
 * The grouping keys on the first hyphen-separated token of a filename, which is
 * cheap and mostly right, and sometimes invents a family out of unrelated files.
 * `no-bare-sleep`, `no-config-leaf-mocks` and `no-lowered-test-timeout` are three
 * separate enforcers that share the word "no". `securityValidation-*` is six
 * different validators behind one legacy prefix. Seven such rows sat in the
 * ledger as debt nobody could ever pay, because there is no shared setup to
 * extract from files that share nothing — found 2026-09-02.
 *
 * A family needs ONE of two things to be true:
 *   1. A source file is named for it — `src/<family>.ts(x)` exists. This is the
 *      normal case and covers every family whose suites import their subject
 *      through a helper, so tightening the rule costs no reach there.
 *   2. Failing that, every subject the members DO name agrees. `projectManifest`
 *      and `codeSyncStatusView` qualify this way: no source file carries their
 *      name, but each one's suites all point at the same module.
 *
 * Neither holding means the token grouped unrelated files.
 */
function isRealFamily(key: string, members: string[]): boolean {
    const relative = key.startsWith('tests/') ? key.slice('tests/'.length) : key;
    const hasSource = ['.ts', '.tsx'].some((ext) =>
        existsSync(join(ROOT, 'src', relative + ext)),
    );
    if (hasSource) return true;

    // EVERY member must name a subject, and they must agree. "Some of them
    // agree" is not enough: `sop/credential` has two suites, one naming a module
    // and one naming none, and a one-element set trivially agrees with itself.
    const named = members.map(subjectOf).filter(Boolean);
    return named.length === members.length && new Set(named).size === 1;
}

function familiesWithoutSharedSetup(): string[] {
    const files = execSync(
        `git ls-files 'tests/**/*.test.ts' 'tests/**/*.test.tsx' 'tests/*.test.ts' 'tests/*.test.tsx'`,
        { encoding: 'utf8', cwd: ROOT },
    )
        .trim()
        .split('\n');

    const families = new Map<string, string[]>();
    for (const f of files) {
        const dir = dirname(f);
        const subject = basename(f).replace(/\.test\.tsx?$/, '').split('-')[0].split('.')[0];
        const key = `${dir}/${subject}`;
        families.set(key, [...(families.get(key) ?? []), f]);
    }

    const offenders: string[] = [];
    for (const [key, members] of families) {
        if (members.length < 2) continue;
        if (!isRealFamily(key, members)) continue;
        const dir = dirname(members[0]);
        const subject = key.slice(dir.length + 1);
        const hasUtilsFile = ['.testUtils.ts', '.testUtils.tsx'].some((ext) =>
            existsSync(join(ROOT, dir, subject + ext)),
        );
        const allShare = members.every((m) =>
            readFileSync(join(ROOT, m), 'utf8').includes('testUtils'),
        );
        if (!hasUtilsFile && !allShare) offenders.push(key);
    }
    return offenders.sort();
}

describe('split test families share their setup', () => {
    const current = familiesWithoutSharedSetup();

    it('CONTROL: positive control: the detector sees families that DO share a testUtils', () => {
        // 59 .testUtils.* files exist; if this is 0 the detector is broken,
        // not the tree clean.
        const shared = execSync(`git ls-files 'tests/**/*.testUtils.*' | wc -l`, {
            encoding: 'utf8',
            cwd: ROOT,
        }).trim();
        expect(Number(shared)).toBeGreaterThan(0);
    });

    it('CONTROL: a real family is kept and a token-collision group is rejected', () => {
        // Without this the tightening above could quietly stop detecting everything
        // and the ledger would read clean. helixService is a real family (a source
        // file carries its name); the three `no-*` enforcers share only a word.
        expect(
            isRealFamily('tests/features/eds/services/helix/helixService', [
                'tests/features/eds/services/helix/helixService.test.ts',
                'tests/features/eds/services/helix/helixService-auth-keys.test.ts',
            ]),
        ).toBe(true);
        expect(
            isRealFamily('tests/sop/no', [
                'tests/sop/no-bare-sleep.test.ts',
                'tests/sop/no-config-leaf-mocks.test.ts',
            ]),
        ).toBe(false);
    });

    it('the ledger lists each family once — a duplicate row inflates the count', () => {
        // Found 2026-09-02: `helixService` was listed TWICE. The assertion below
        // reads the ledger into a Set, so a duplicate changes nothing it can see —
        // it passes cleanly while the row count, which is the number quoted as
        // remaining work, is overstated. Nothing else checks the file's shape.
        const counts = new Map<string, number>();
        for (const f of LEDGER.families) counts.set(f, (counts.get(f) ?? 0) + 1);
        const duplicated = [...counts].filter(([, n]) => n > 1).map(([f]) => f);
        expect(duplicated).toEqual([]);
    });

    it('no NEW family arrives without a shared setup, and fixed families leave the ledger', () => {
        const ledger = new Set(LEDGER.families);
        const unlisted = current.filter((f) => !ledger.has(f));
        const stale = [...ledger].filter((f) => !current.includes(f));
        expect({ newFamiliesWithoutSharedSetup: unlisted, fixedButStillLedgered: stale }).toEqual({
            newFamiliesWithoutSharedSetup: [],
            fixedButStillLedgered: [],
        });
    });
});
