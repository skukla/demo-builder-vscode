/**
 * Every top-level directory is CLASSIFIED: it ships, or `.vscodeignore` excludes it.
 *
 * WHY THIS EXISTS. `.gitignore` does nothing for packaging. vsce reads
 * `.vscodeignore` instead whenever it exists, so a directory hidden from git is
 * invisible to review AND still ships. Four local-artifact directories have gone
 * out in a VSIX this way — the jest cache, the ExTester downloads, the mutation
 * reports, and the mutation sandbox — and each was found by someone eventually
 * noticing the file count, not by a check.
 *
 * The fourth is the reason for this file. Cutting beta.146 on 2026-09-10, the
 * release-cut sweep ran `mutation-test-pilot`, which copies the whole repo into
 * `.stryker-tmp/sandbox-<id>/` to mutate it and leaves it behind. `npm run package`
 * ran minutes later and swept it in: 112 MB and 8,836 files, a VSIX of 41.2 MB
 * against the previous release's 7.7 MB — five times the entire extension. It had
 * never happened before because the sweep and the packaging do not normally run
 * within minutes of each other, which is exactly the kind of gap a per-release
 * eyeball never closes.
 *
 * `reports/**` had been added to `.vscodeignore` only two days earlier, for the
 * mutation REPORTS. The sandbox is a different directory and nobody looked for it.
 *
 * WHAT THIS CHECKS, and why it is shaped this way. It does NOT build a VSIX —
 * packaging takes minutes, and a check nobody can afford to run is not a check. It
 * asserts the two things that are cheap and would each have caught the bug:
 *
 *   1. Directories known to hold local artifacts are named in `.vscodeignore`,
 *      whether or not they exist right now. `.stryker-tmp` is TRANSIENT — it is
 *      absent during a normal test run — so a disk scan alone would never see it.
 *      This half is what protects against the recurrence.
 *   2. Every top-level directory that DOES exist is classified as one or the other.
 *      A new unclassified directory fails the build and forces the decision. This
 *      half is what protects against the next unknown one.
 *
 * WHAT THIS CANNOT DO: it does not verify vsce's own glob semantics, and it says
 * nothing about individual files. If a fifth artifact directory ships, it will be
 * one that is transient AND unlisted — add it to MUST_NOT_SHIP the day it appears.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const VSCODEIGNORE = join(ROOT, '.vscodeignore');

/**
 * Directories that must never reach a user's machine, each with the reason it is
 * here. Listed by NAME; the assertion looks for a pattern naming it, so whatever
 * glob suffix `.vscodeignore` uses is free to differ.
 */
const MUST_NOT_SHIP: ReadonlyArray<readonly [string, string]> = [
    ['.stryker-tmp', 'mutation SANDBOX — a whole copy of the repo; shipped 112 MB in beta.146'],
    ['reports', 'mutation and health REPORTS — shipped 144 MB in beta.145'],
    ['.jest-cache', 'jest transform cache — has shipped before'],
    ['.test-extensions', 'ExTester downloads — has shipped before'],
    ['coverage', 'coverage output'],
    ['.serena', 'editor tooling index'],
    ['.playwright-mcp', 'browser-automation scratch'],
    ['node_modules', 'dependencies are bundled by esbuild, never shipped as a tree'],
    ['tests', 'the test tree'],
    ['docs', 'documentation'],
    ['.rptc', 'plans, research and the backlog'],
    ['.claude', 'agent skills and hooks'],
    ['.githooks', 'git hooks'],
    ['.github', 'CI definitions'],
    ['scripts', 'build and quality tooling; nothing here runs at extension runtime'],
    ['.vscode', 'this repo’s own editor settings'],
    ['.vscode-test', 'test-host downloads'],
    ['.cursor', 'editor tooling'],
];

/** Directories that legitimately reach the VSIX. */
const SHIPS = new Set(['dist', 'media', 'src']);

function activePatterns(): string[] {
    return readFileSync(VSCODEIGNORE, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/** Does any non-negated pattern name this directory? */
function isExcluded(dir: string, patterns: string[]): boolean {
    return patterns.some((p) => !p.startsWith('!') && p.split(/[/*]/)[0] === dir);
}

function topLevelDirs(): string[] {
    return readdirSync(ROOT)
        .filter((n) => n !== '.git')
        .filter((n) => {
            try {
                return statSync(join(ROOT, n)).isDirectory();
            } catch {
                return false;
            }
        });
}

describe('the VSIX ships only what it should', () => {
    const patterns = activePatterns();

    it('CONTROL: .vscodeignore is present and parsed', () => {
        // Absent or empty, every assertion below would pass vacuously — and an
        // ABSENT .vscodeignore is the dangerous state, because vsce then falls back
        // to .gitignore and the file counts change without anything failing.
        expect(existsSync(VSCODEIGNORE)).toBe(true);
        expect(patterns.length).toBeGreaterThan(30);
    });

    it('CONTROL: the matcher recognises an entry, and does not invent one', () => {
        expect(isExcluded('reports', ['reports/**'])).toBe(true);
        expect(isExcluded('.stryker-tmp', ['.stryker-tmp*/**'])).toBe(true);
        // A near-miss must NOT count: `report/**` singular is the exact typo that
        // let beta.145 ship 144 MB.
        expect(isExcluded('reports', ['report/**'])).toBe(false);
        // A negation re-includes and must not be read as an exclusion.
        expect(isExcluded('src', ['!src/features/config/**'])).toBe(false);
    });

    it.each(MUST_NOT_SHIP)('.vscodeignore excludes %s (%s)', (dir) => {
        expect(isExcluded(dir, patterns)).toBe(true);
    });

    it('every top-level directory is classified', () => {
        const known = new Set<string>([...MUST_NOT_SHIP.map(([d]) => d), ...SHIPS]);
        const unclassified = topLevelDirs().filter((d) => !known.has(d));
        // A new directory here is a DECISION, not an oversight: add it to
        // MUST_NOT_SHIP with its reason, or to SHIPS if users need it.
        expect(unclassified).toStrictEqual([]);
    });
});
