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
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, basename } from 'path';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const LEDGER = JSON.parse(
    readFileSync(join(__dirname, 'test-family-setup.ledger.json'), 'utf8'),
) as { families: string[] };

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

    it('positive control: the detector sees families that DO share a testUtils', () => {
        // 59 .testUtils.* files exist; if this is 0 the detector is broken,
        // not the tree clean.
        const shared = execSync(`git ls-files 'tests/**/*.testUtils.*' | wc -l`, {
            encoding: 'utf8',
            cwd: ROOT,
        }).trim();
        expect(Number(shared)).toBeGreaterThan(0);
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
