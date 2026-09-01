/**
 * PRODUCTION erases no types. `as any` and `as never` are banned in `src/`.
 *
 * A FLAT BAN, not a ceiling, because the corpus was already empty when it was
 * adopted (2026-09-01). That is the whole reason to write it now: a ban costs
 * nothing while the count is zero, and the alternative — leaving it to habit and a
 * warn-level lint rule that currently reports nothing — is how a property that took
 * effort to reach quietly comes undone.
 *
 * It is the same move that banked eight architecture zeros the same day. A count of
 * zero is not the achievement; a count of zero that CANNOT rise is.
 *
 * WHY `src/` GETS A BAN AND `tests/` GETS A RATCHET. They are at different places
 * and the same rule would be wrong for both. `src/` is at 0; `tests/` carries 1,268,
 * and a ban that emits 1,268 errors gets switched off within a week — this repo says
 * so in its own handbook, which is why the test-side rule is a shrink-only ceiling
 * (`type-erasing-casts.test.ts`) that can only fall.
 *
 * WHAT IS STILL ALLOWED, because banning the wrong thing teaches people to work
 * around the check rather than write better types:
 *
 *   `unknown` plus a guard   the correct answer to "I do not know the type yet"
 *   `: never` as a RETURN    `handleStreamingError(...): never` — a function that
 *                            does not return. The type doing its actual job.
 *   `(args: any)` at a real  the MCP SDK hands over untyped arguments; 51 of the 61
 *   interop boundary         `: any` in src are exactly this, and no annotation can
 *                            make the SDK's input typed
 *   `as unknown as X`        when a value genuinely cannot be expressed in the
 *                            target's terms — it NAMES what it is pretending to be,
 *                            which `as any` never does
 *
 * The last one is why `src/` reached zero at all: `CardActionsMenu` carried the one
 * remaining `as never`, silencing a real Spectrum collection-type mismatch. It says
 * `as unknown as CollectionChildren<object>` now. Both spellings silence the same
 * error; only one tells the next reader what the value is being treated as.
 *
 * @see tests/sop/type-erasing-casts.test.ts — the tests-side ceiling
 * @see docs/development/handbook.md — the convention, with the allowed forms
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const srcDir = path.join(repoRoot, 'src');

/** Blank out comments, preserving offsets — prose about a cast is not a cast. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

function walk(dir: string): string[] {
    const out: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules') continue;
            out.push(...walk(full));
        } else if (/\.tsx?$/.test(e.name)) {
            out.push(path.relative(repoRoot, full));
        }
    }
    return out;
}

const PATTERN = /\bas\s+(any|never)\b/g;

describe('production erases no types', () => {
    const files = walk(srcDir);

    it('CONTROL: the detector reads code and not prose', () => {
        // A ban over an empty corpus passes whether or not it can see anything, so
        // these are the only evidence it works.
        expect(stripComments('const x = y as any;').match(PATTERN)).toHaveLength(1);
        expect(stripComments('const x = y as never;').match(PATTERN)).toHaveLength(1);
        // a MENTION is not a cast — src comments discuss both spellings
        expect(stripComments('// never do `x as any` here')).not.toMatch(PATTERN);
        expect(stripComments('/* the value has never been typed */')).not.toMatch(PATTERN);
        // the allowed forms must NOT be caught
        expect(stripComments('function f(): never { throw new Error(); }')).not.toMatch(PATTERN);
        expect(stripComments('const x: unknown = y;')).not.toMatch(PATTERN);
        // and it actually read the tree
        expect(files.length).toBeGreaterThan(500);
    });

    it('no file in src/ casts to any or never', () => {
        const offenders: string[] = [];
        for (const f of files) {
            let raw: string;
            try {
                raw = fs.readFileSync(path.join(repoRoot, f), 'utf8');
            } catch {
                continue; // vanished mid-walk; a file that is gone is not committed
            }
            const body = stripComments(raw);
            for (const m of body.matchAll(PATTERN)) {
                const line = body.slice(0, m.index).split('\n').length;
                offenders.push(`${f}:${line}  as ${m[1]}`);
            }
        }
        expect({
            offenders,
            fix: 'name the target — `as unknown as X` — or type the value honestly',
        }).toEqual({
            offenders: [],
            fix: 'name the target — `as unknown as X` — or type the value honestly',
        });
    });
});
