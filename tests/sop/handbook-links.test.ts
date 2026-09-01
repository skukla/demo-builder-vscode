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
import { spawnSync } from 'child_process';
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

    it('the convention scorecard matches the conventions actually stated', () => {
        // The handbook prints "states N conventions. M of them are enforced; K are not."
        // A count in prose is a claim, and this repo's rule is that a claim needs
        // something keeping it true — the handbook says so itself.
        //
        // `is|are` because the count reached ONE on 2026-09-01, when the nine
        // working-discipline rules moved to §11, and "1 are not" is not a sentence.
        // The pin read `are` only and failed on grammar rather than on arithmetic —
        // a check that forces the prose to be wrong to stay green is worse than no
        // check, so the pin moved rather than the sentence.
        const claim = md.match(
            /states (\d+) conventions\. (\d+) of them are enforced; (\d+) (?:are|is) not/
        );
        expect(claim).not.toBeNull();
        const [, total, enforced, unenforced] = claim!.map(Number);

        const blocks = [...md.matchAll(/> \*\*Convention\.\*\*[\s\S]*?(?=\n\n)/g)]
            .map((m) => m[0])
            .filter((b) => !b.includes('The rule itself')); // the sample callout
        const notEnforced = blocks.filter((b) => /\*\*[Nn]ot enforced/.test(b));

        expect({
            total: blocks.length,
            enforced: blocks.length - notEnforced.length,
            unenforced: notEnforced.length,
        }).toEqual({ total, enforced, unenforced });
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

/**
 * The convention index is generated, and generated things go stale silently.
 *
 * Every hand-written index in this repo drifted: the ADR table stopped four rows
 * short while four more had landed, the backlog README hid three items for months,
 * and two convention counts were wrong within an hour of being written. The index
 * is derived from the handbook's callouts for that reason — and this makes the
 * derivation itself fail the build when it is out of date.
 *
 * It also checks the harder direction: an enforcer that checks something NO
 * convention states. That found four on its first run — the commit-backtick,
 * secret-files, webview-test and adobe-docs hook rules were all enforcing rules the
 * handbook had never written down.
 */
describe('the convention index is current', () => {
    it('regenerating it would produce no change, and every enforcer has a rule', () => {
        const r = spawnSync('node', ['scripts/generate-convention-index.mjs', '--check'], {
            cwd: join(__dirname, '..', '..'),
            encoding: 'utf8',
        });
        expect({ code: r.status, stderr: r.stderr.trim() }).toEqual({ code: 0, stderr: '' });
    });
});

/**
 * The MCP tool catalog is generated, and a stale one misleads an AGENT rather than a
 * person. A phantom tool sends it hunting for a capability that does not exist; a
 * missing one hides one it has.
 *
 * The hand-written version was wrong in both directions — 12 undocumented, 6 deleted
 * tools still listed — which is what every hand-maintained list of enumerable things
 * in this repo has become.
 */
describe('the MCP tool catalog is current', () => {
    it('regenerating it would produce no change', () => {
        const r = spawnSync('node', ['scripts/generate-tool-catalog.mjs', '--check'], {
            cwd: join(__dirname, '..', '..'),
            encoding: 'utf8',
        });
        expect({ code: r.status, stderr: r.stderr.trim() }).toEqual({ code: 0, stderr: '' });
    });
});
