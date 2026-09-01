/**
 * SOP Compliance Test: a test never ERASES a type.
 *
 * `as any` and `as never` are not casts, they are the absence of one. Both tell
 * the compiler to stop checking the single thing it is best at — whether the
 * object you built is the object the callee declared — and both leave every
 * DOWNSTREAM use unchecked as well, because what comes out the other side has no
 * type left to check against.
 *
 * `as never` is the more misleading of the two. `never` is assignable to every
 * type, so it is a skeleton key that reads like a locked door.
 *
 * WHY THIS IS NOT THE SAME RULE AS canonical-fakes' castCeilings. That one counts
 * casts to nine types that already HAVE a builder — "use the builder that exists".
 * A cast to a type with no builder can be perfectly correct there: a `Response`
 * stub carrying three of its twenty members is right when the code reads three.
 * This rule is about a different defect. `{...} as unknown as Response` still
 * NAMES Response, so every downstream use is checked against it and the lie stays
 * local to the construction site. `as any` and `as never` name nothing.
 *
 * That distinction is not a theory — the canonical builders demonstrate it. All of
 * them fake types they cannot satisfy honestly (`CommandExecutor` and
 * `StateManager` are CLASSES with private fields, which no object literal can
 * ever match), and measured 2026-08-31, `tests/helpers/` contains ZERO of either
 * form. Every one of them writes `as unknown as X` instead. The right way to fake
 * an unsatisfiable type was already in use; it just was not written down.
 *
 * WHY A CEILING AND NOT AN ESLINT BAN, YET. There are 1,916 of these across 341
 * files, and `@typescript-eslint/no-explicit-any` is switched OFF for `tests/` in
 * eslint.config.mjs — so the larger half has never been enforced at all. A ban
 * today would be 1,916 errors and would be turned off by the end of the week. So:
 * a shrink-only ceiling now, and when both reach zero this file is deleted and
 * replaced by a `no-restricted-syntax` rule, exactly as the feature-barrel ledger
 * became a ban when it emptied.
 *
 * HOW TO LOWER IT. Read what the callee actually declares — that is the work the
 * cast was avoiding. Usually one of three things is true:
 *   - the cast is silencing nothing and deletes outright (11 of 42 on 2026-08-31);
 *   - a canonical builder in tests/helpers/ already returns the right type;
 *   - the target is genuinely unsatisfiable, and the fake belongs in a builder
 *     that writes `as unknown as X` once, where the whole suite can share it.
 *
 * @see .rptc/backlog/2026-08-31-type-erasing-casts.md
 * @see tests/sop/canonical-fakes.test.ts — the narrower, per-type sibling
 */

import * as fs from 'fs';
import * as path from 'path';
import LEDGER from './type-erasing-casts.ledger.json';

const testsDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(testsDir, '..');

const CEILINGS: Record<string, number> = LEDGER.ceilings;

const PATTERNS: Record<string, RegExp> = {
    'as any': /\bas\s+any\b/g,
    'as never': /\bas\s+never\b/g,
};

/**
 * Comments are stripped before counting. Without this the count is wrong in the
 * direction that matters least but confuses most: the first draft of this ledger
 * recorded a `tests/helpers/` exemption for a cast that turned out to be the words
 * "as any" inside a docblock explaining how to avoid them.
 */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function collectTestFiles(dir: string): string[] {
    const files: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return files;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            files.push(...collectTestFiles(full));
        } else if (/\.tsx?$/.test(entry.name)) {
            files.push(path.relative(repoRoot, full).replace(/\\/g, '/'));
        }
    }
    return files;
}

/** This guard quotes both forms in its own prose, so it must not count itself. */
const SELF = path.relative(repoRoot, __filename).replace(/\\/g, '/');

const corpus = collectTestFiles(testsDir).filter((f) => f !== SELF);

const counts: Record<string, number> = (() => {
    const out: Record<string, number> = {};
    for (const key of Object.keys(PATTERNS)) out[key] = 0;
    for (const f of corpus) {
        let raw: string;
        try {
            raw = fs.readFileSync(path.join(repoRoot, f), 'utf8');
        } catch {
            // Vanished between the listing and the read — a concurrent suite's
            // temp file. `collectTestFiles` already tolerates this for DIRECTORIES
            // and says so; the read was left unguarded, and jest running suites in
            // parallel made that a real failure on 2026-09-01 when a new suite
            // began writing a probe file into tests/sop/.
            //
            // Skipping is correct rather than fatal: this counts COMMITTED files,
            // and a file that no longer exists is not committed. The ceiling is
            // exact-equality, so a genuinely missing corpus file would fail the
            // count rather than pass unnoticed.
            continue;
        }
        const body = stripComments(raw);
        for (const [key, re] of Object.entries(PATTERNS)) {
            out[key] += body.match(re)?.length ?? 0;
        }
    }
    return out;
})();

describe('a test never erases a type', () => {
    it('CONTROL: the detector sees a real cast, and not a mention of one', () => {
        const anyRe = /\bas\s+any\b/;
        const neverRe = /\bas\s+never\b/;

        // Positive: the forms this rule bans.
        expect(anyRe.test(stripComments('const x = ctx as any;'))).toBe(true);
        expect(neverRe.test(stripComments('fn({ a: 1 } as never);'))).toBe(true);

        // Negative: the form it deliberately allows, which names its target.
        expect(anyRe.test('const x = {} as unknown as Widget;')).toBe(false);
        expect(neverRe.test('const x = {} as unknown as Widget;')).toBe(false);

        // Negative: prose. This is the case that produced a wrong ledger row.
        expect(anyRe.test(stripComments('/** avoid `as any` here */'))).toBe(false);
        expect(neverRe.test(stripComments('// never cast, and never as never'))).toBe(false);

        // And the corpus was actually read, so a zero means "none left" rather
        // than "the walk returned nothing".
        expect(corpus.length).toBeGreaterThan(500);
    });

    it.each(Object.keys(CEILINGS))('%s: the count only ever falls', (form) => {
        const ceiling = CEILINGS[form];
        const count = counts[form];
        expect({
            form,
            count,
            verdict:
                count > ceiling
                    ? 'GREW — a new test erased a type. Read what the callee declares.'
                    : count < ceiling
                      ? 'LOWER THE PIN in type-erasing-casts.ledger.json'
                      : 'at',
        }).toEqual({ form, count, verdict: 'at' });
    });

    it('tests/helpers/ stays clear of both forms', () => {
        /**
         * The builders fake types no object literal can satisfy and still manage
         * it without erasing anything. If one ever needs to, the fix is not an
         * exemption here — it is `as unknown as X`, which names the target and
         * keeps every caller checked.
         */
        const offenders = corpus
            .filter((f) => f.startsWith('tests/helpers/'))
            .filter((f) => {
                const body = stripComments(fs.readFileSync(path.join(repoRoot, f), 'utf8'));
                return /\bas\s+any\b/.test(body) || /\bas\s+never\b/.test(body);
            });
        expect(offenders).toEqual([]);
    });
});
