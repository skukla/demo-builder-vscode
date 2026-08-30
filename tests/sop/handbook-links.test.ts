/**
 * Every link and enforcer named by the development handbook must resolve.
 *
 * WHY THIS EXISTS, from a measured failure rather than a hypothetical one. On
 * 2026-08-30 `src/features/CLAUDE.md` was found asserting that every feature barrel
 * had been deleted — "zero importers for every one of them … dead on arrival" —
 * while 48 barrels existed and 40 had importers. Nothing had checked, because
 * nothing could: prose about other files is a claim, and this repo's own rule says
 * a claim needs something keeping it true.
 *
 * A convention document that is confidently wrong is worse than no document,
 * because people act on it. So the handbook's pointers are checked.
 *
 * WHAT THIS CANNOT DO, stated so nobody mistakes a green run for more than it is:
 * it proves each target EXISTS, not that the rule still describes reality. Judging
 * staleness is a release-cut job (`.claude/skills/codebase-sweep`).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const HANDBOOK = join(ROOT, 'docs/development/handbook.md');
const HANDBOOK_DIR = 'docs/development';

/** Markdown links, resolved relative to the handbook's own directory. */
function linkedPaths(md: string): string[] {
    const out: string[] = [];
    for (const m of md.matchAll(/\]\((\.[^)#]+)(?:#[^)]*)?\)/g)) {
        // strip the leading ./ or ../ segments by resolving against the handbook dir
        const resolved = join(HANDBOOK_DIR, m[1]).replace(/\\/g, '/');
        out.push(resolved);
    }
    return [...new Set(out)];
}

/** Backticked things that look like a file this repo owns. */
function namedFiles(md: string): string[] {
    const out = [...md.matchAll(/`((?:tests|src|scripts|\.claude|\.githooks)\/[\w./-]+)`/g)].map(
        (m) => m[1]
    );
    return [...new Set(out)];
}

describe('the development handbook points at things that exist', () => {
    const md = readFileSync(HANDBOOK, 'utf8');

    it('CONTROL: the handbook is found and actually contains links', () => {
        // Without this, every assertion below passes vacuously on an empty read.
        expect(md.length).toBeGreaterThan(1000);
        expect(linkedPaths(md).length).toBeGreaterThan(10);
    });

    it('every linked document exists', () => {
        const missing = linkedPaths(md).filter((p) => !existsSync(join(ROOT, p)));
        expect(missing).toEqual([]);
    });

    it('every named enforcer — test, hook rule, script, git hook — exists', () => {
        const missing = namedFiles(md).filter((p) => !existsSync(join(ROOT, p)));
        expect(missing).toEqual([]);
    });

    it('CONTROL: the checks can actually fail', () => {
        // Proves the two assertions above are not passing because the extractors
        // return nothing. A detector that finds no candidates reports "all clear"
        // in exactly the same words as one that verified them.
        const planted = 'see [nope](./does-not-exist.md) and `tests/sop/not-a-file.ts`';
        expect(linkedPaths(planted).filter((p) => !existsSync(join(ROOT, p)))).toHaveLength(1);
        expect(namedFiles(planted).filter((p) => !existsSync(join(ROOT, p)))).toHaveLength(1);
    });
});
