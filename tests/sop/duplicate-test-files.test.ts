/**
 * No test file may be a byte-identical copy of another.
 *
 * WHAT THIS CATCHES, and why the clone scans did not.
 *
 * `code-duplication-scan` (jscpd) counts duplicated LINE RANGES and ranks by size,
 * so a wholly-redundant file shows up as an ordinary mid-table clone pair rather
 * than as what it is. The PL-9 census recorded one of these as
 * "installHandler-shellOptions (4)" — four clones, cluster six of eight — and the
 * true finding was that the entire file was a copy of four tests already living in
 * `installHandler-fnmShell.test.ts`. Read as a clone count it looks like an
 * extraction job; read as whole files it is a deletion.
 *
 * Four files were found and deleted on 2026-08-31, all created by the SAME
 * 2025-11-18 commit — a split of oversized suites that COPIED tests into the new
 * files instead of moving them:
 *
 *   installHandler-shellOptions        ⊂ installHandler-fnmShell   (4 tests)
 *   installHandler-adobeCLI            ≡ installHandler-adobeCliProgress (4)
 *   installHandler-sharedUtilities     ≡ installHandler.test.ts    (1)
 *   ComponentRegistryManager-registration ≡ -retrieval             (9)
 *
 * The last one had never tested what its name claimed: `ComponentRegistryManager`
 * has no registration method, and the file's own docblock described retrieval.
 *
 * These cost real time on every run and, worse, inflate coverage and mutation
 * scores with tests that prove nothing new — the duplicate suites were killing the
 * same mutants twice.
 *
 * SCOPE: compares only files in the SAME directory, which keeps this O(n²) check
 * to a few milliseconds and matches how the failure actually arises (a split
 * produces siblings). A copy across directories is a different, rarer mistake and
 * is deliberately out of scope rather than silently claimed.
 *
 * IT READS THE GIT INDEX, NOT THE DISK. `git ls-files` lists tracked files, so a
 * brand-new duplicate that has not been `git add`-ed yet is invisible here. This
 * was found by its own planted-defect control: restoring a deleted duplicate onto
 * disk left the check green, and only staging it turned the check red. That is
 * fine for the job — CI and every commit see staged files — but it means a local
 * run before `git add` is not proof. Anyone writing a control for this must stage
 * the planted file, or the control shares the blind spot and passes with it.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { basename, dirname, join } from 'path';

const ROOT = join(__dirname, '..', '..');

/**
 * Blank out `//` and block comments, preserving offsets so brace matching still
 * works, and never treating a `//` inside a string literal as one.
 *
 * Comments are stripped because the first version of this check compared them and
 * missed a real duplicate: `ComponentRegistryManager-configuration.test.ts` held
 * eight tests all present in `-nodeVersions.test.ts`, whose bodies differed ONLY by
 * the presence of `// Given:` / `// When:` / `// Then:` lines. Identical assertions,
 * identical calls, different narration — and by any measure that matters, the same
 * test twice.
 */
function stripComments(src: string): string {
    let out = '';
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        const next = src[i + 1];
        if (c === '"' || c === "'" || c === '`') {
            const quote = c;
            out += c;
            i++;
            while (i < src.length && src[i] !== quote) {
                if (src[i] === '\\') {
                    out += src.slice(i, i + 2);
                    i += 2;
                    continue;
                }
                out += src[i];
                i++;
            }
            out += src[i] ?? '';
            i++;
            continue;
        }
        if (c === '/' && next === '/') {
            while (i < src.length && src[i] !== '\n') {
                out += ' ';
                i++;
            }
            continue;
        }
        if (c === '/' && next === '*') {
            while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
                out += src[i] === '\n' ? '\n' : ' ';
                i++;
            }
            out += '  ';
            i += 2;
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

/**
 * Extract each `it(...)` body from a test file, keyed by test name and normalized
 * on whitespace and comments so reindentation or re-narration during a split does
 * not hide a copy.
 */
function testBodies(raw: string): Map<string, string> {
    const source = stripComments(raw);
    const out = new Map<string, string>();
    const opener = /\bit\(\s*'([^']+)'\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = opener.exec(source)) !== null) {
        const start = m.index + m[0].length - 1;
        let depth = 0;
        let end = start;
        for (let i = start; i < source.length; i++) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        out.set(
            m[1],
            source
                .slice(start, end + 1)
                .replace(/\s+/g, ' ')
                .trim()
        );
    }
    return out;
}

function listTestFiles(): string[] {
    return execSync('git ls-files "tests/**/*.test.ts" "tests/**/*.test.tsx"', {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
    })
        .trim()
        .split('\n')
        .filter(Boolean);
}

describe('SOP: no test file duplicates another', () => {
    const files = listTestFiles();
    const bodies = new Map<string, Map<string, string>>();
    for (const f of files) {
        bodies.set(f, testBodies(readFileSync(join(ROOT, f), 'utf8')));
    }

    it('CONTROL: the corpus was actually read', () => {
        // A zero-length file list would make every assertion below pass vacuously,
        // which is the failure mode this whole directory exists to avoid.
        expect(files.length).toBeGreaterThan(500);
        const parsed = [...bodies.values()].filter((b) => b.size > 0).length;
        expect(parsed).toBeGreaterThan(500);
    });

    it("no file's entire test set is byte-identical inside a sibling file", () => {
        const byDir = new Map<string, string[]>();
        for (const f of files) {
            const d = dirname(f);
            byDir.set(d, [...(byDir.get(d) ?? []), f]);
        }

        const redundant: string[] = [];
        for (const siblings of byDir.values()) {
            for (const a of siblings) {
                const A = bodies.get(a)!;
                if (A.size === 0) continue;
                for (const b of siblings) {
                    if (a === b) continue;
                    const B = bodies.get(b)!;
                    if (B.size < A.size) continue;
                    const allPresent = [...A].every(([name, body]) => B.get(name) === body);
                    if (allPresent) {
                        redundant.push(
                            `${basename(a)} (${A.size} tests) is contained in ${basename(b)}`
                        );
                        break;
                    }
                }
            }
        }
        // A mutual pair reports twice, once per direction — deleting either clears both.
        expect(redundant).toEqual([]);
    });

    it('CONTROL: the containment check can actually fail', () => {
        // Proves the empty array above means "no duplicates", not "the comparison
        // never matched". Two identical sources must be seen as containing each
        // other; two different ones must not.
        const one = `it('a', async () => { expect(1).toBe(1); });`;
        const two = `it('a', async () => {\n    expect(1).toBe(1);\n});`;
        const other = `it('a', async () => { expect(2).toBe(2); });`;

        const A = testBodies(one);
        const B = testBodies(two);
        const C = testBodies(other);

        expect(A.size).toBe(1);
        // Reindented but identical — the whitespace normalization must see through it.
        expect([...A].every(([n, b]) => B.get(n) === b)).toBe(true);
        // Same test NAME, different body — must NOT count as contained.
        expect([...A].every(([n, b]) => C.get(n) === b)).toBe(false);

        // Narration must not hide a copy. This is the case the first version of the
        // check missed: -configuration and -nodeVersions differed only by Given/When/
        // Then comments.
        const narrated = `it('a', async () => {\n    // Given: one\n    expect(1).toBe(1); // Then: still one\n});`;
        expect([...A].every(([n, b]) => testBodies(narrated).get(n) === b)).toBe(true);

        // ...but a `//` inside a string is not a comment, and blanking it would make
        // two genuinely different tests look identical.
        const urlA = `it('a', async () => { expect(u).toBe('http://x/1'); });`;
        const urlB = `it('a', async () => { expect(u).toBe('http://x/2'); });`;
        expect(testBodies(urlA).get('a')).not.toEqual(testBodies(urlB).get('a'));
    });
});
