/**
 * Rules stated in BOTH `CLAUDE.md` and the handbook must still be stated in both.
 *
 * WHY THIS IS NOT "DE-DUPLICATE THEM". The obvious reading of two documents
 * carrying the same rule is that one copy should go. That is wrong here, and the
 * reason is mechanical rather than editorial:
 *
 *   - `CLAUDE.md` is loaded into every agent session automatically. It is what
 *     actually steers the work.
 *   - `docs/development/handbook.md` is not loaded. It is what a human reads to
 *     understand the codebase.
 *
 * Delete the rule from CLAUDE.md and agents stop seeing it. Delete it from the
 * handbook and it stops being explained. The duplication is doing a job.
 *
 * What was genuinely broken is that nothing connected the two, so an edit to one
 * left the other quietly stale — the same failure this repo has now found in a
 * backlog index, an ADR table, and a hook pre-filter. So the pairs are pinned.
 *
 * WHAT THIS CANNOT DO: it proves both documents still state the rule, not that
 * they say the same thing about it. Two probes matching is evidence the rule
 * survived an edit, not that the wording stayed in agreement. Reading them is
 * still a release-cut job.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
/**
 * Whitespace-flattened, because both documents wrap prose at ~95 columns and a
 * rule's sentence is routinely split across lines — with a `> ` quote marker in
 * the middle of it in the handbook. Matching raw text makes the check fail on
 * reflow, which is noise rather than signal.
 */
const flatten = (name: string): string =>
    readFileSync(join(ROOT, name), 'utf8')
        .toLowerCase()
        .replace(/\n>\s*/g, ' ')
        .replace(/\s+/g, ' ');

const CLAUDE_MD = flatten('CLAUDE.md');
const HANDBOOK = flatten('docs/development/handbook.md');

/**
 * One row per rule that BOTH documents state. Each side is a distinctive phrase
 * from that document's own wording — they differ on purpose, because the two are
 * written for different readers and must be allowed to.
 *
 * Adding a rule to both documents means adding a row. Removing it from one means
 * removing the row, which is the moment to decide whether it should also leave
 * the other.
 */
const PAIRED: ReadonlyArray<{ rule: string; claudeMd: string; handbook: string }> = [
    {
        rule: 'a cast in argument position is a silenced type error',
        claudeMd: 'a cast at a call boundary is a silenced type error',
        handbook: 'never pass an argument as `any` or `never`',
    },
    {
        rule: 'a shape the compiler cannot read will be invented',
        claudeMd: 'will be invented',
        handbook: 'lives in a typechecked file and is typed to the real interface',
    },
    {
        rule: 'a comment about another module is a claim',
        claudeMd: 'another module does is a claim',
        handbook: 'must cite the code that makes it true',
    },
    {
        rule: 'name the falsifying command before naming a cause',
        claudeMd: 'name the command that would falsify it',
        handbook: 'name the command that would prove you wrong',
    },
    {
        rule: 'an exit code read through a pipe is not a check',
        claudeMd: 'is not a check',
        handbook: 'capture an exit code in a variable',
    },
    {
        rule: 'quote glob arguments in zsh',
        claudeMd: 'quote glob arguments in zsh',
        handbook: 'quote glob arguments',
    },
    {
        rule: 'a nothing-found result needs a positive control',
        claudeMd: 'positive control',
        handbook: 'declares a control',
    },
];

describe('CLAUDE.md and the handbook still agree on the rules they share', () => {
    it('CONTROL: both documents were read and are substantial', () => {
        // Without this, every assertion below passes vacuously on an empty read —
        // which is the exact failure shape these checks exist to catch.
        expect(CLAUDE_MD.length).toBeGreaterThan(5000);
        expect(HANDBOOK.length).toBeGreaterThan(5000);
    });

    it('every paired rule is still stated in BOTH documents', () => {
        expect({
            goneFromClaudeMd: PAIRED.filter((p) => !CLAUDE_MD.includes(p.claudeMd)).map(
                (p) => p.rule
            ),
            goneFromHandbook: PAIRED.filter((p) => !HANDBOOK.includes(p.handbook)).map(
                (p) => p.rule
            ),
        }).toEqual({ goneFromClaudeMd: [], goneFromHandbook: [] });
    });

    it('CONTROL: a probe that should not match, does not', () => {
        // Proves the assertion above is reading the documents rather than matching
        // everything — a substring check that always passes is not a check.
        expect(CLAUDE_MD.includes('a rule nobody has ever written down here')).toBe(false);
        expect(HANDBOOK.includes('a rule nobody has ever written down here')).toBe(false);
    });

    it('the convention count CLAUDE.md quotes matches the handbook scorecard', () => {
        // CLAUDE.md summarises the handbook's totals for a reader who will not open
        // it. That is a count written in prose, which this repo has watched rot in
        // four places today alone — so it is pinned to the handbook's own claim,
        // which is itself pinned to the callouts by handbook-links.test.ts.
        const raw = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
        const quoted = raw.match(/(\d+) of them, (\d+) with an enforcer/);
        expect(quoted).not.toBeNull();

        const hb = readFileSync(join(ROOT, 'docs/development/handbook.md'), 'utf8');
        const scorecard = hb.match(/states (\d+) conventions\. (\d+) of them are enforced/);
        expect(scorecard).not.toBeNull();

        expect({ total: quoted![1], enforced: quoted![2] }).toEqual({
            total: scorecard![1],
            enforced: scorecard![2],
        });
    });

    it('the handbook is the document CLAUDE.md points at for conventions', () => {
        // Structural: CLAUDE.md may restate a rule, but a reader who wants the full
        // set must be told where it lives, or the two drift into rival lists.
        expect(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')).toContain(
            'docs/development/handbook.md'
        );
    });
});
