/**
 * The equivalent-mutant ledger must still describe the code it claims to describe.
 *
 * WHY THIS EXISTS. The mutation plan defines a module as FINISHED when every
 * remaining survivor is either killed or recorded as equivalent with a reason. Until
 * 2026-09-03 there was nowhere to record the second half: the instrument tracked
 * seven fields per module and none of them was "triaged", so the 2026-09-02 triage
 * went into a prose handoff note that nothing could read. A module with genuinely
 * unkillable mutants could never read as done, and the count never reached zero.
 *
 * WHAT MAKES A LEDGER LIKE THIS ROT. It names code, and code moves. Two of the six
 * entries migrated from that note had ALREADY drifted by line number within a day —
 * which is why entries name their code by source TEXT and this suite checks the text
 * still resolves to exactly one line. A stale entry is worse than a missing one: it
 * silently subtracts from a module's open-gap count on the strength of an argument
 * about code that is no longer there.
 *
 * WHAT THIS CANNOT DO: it proves an entry still points at real, unique code. It
 * cannot prove the equivalence ARGUMENT is sound — that is what `reason` is for, and
 * why a reason is required to be substantial rather than merely present.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const LEDGER = join(ROOT, 'scripts', 'mutation-equivalents.ledger.json');

interface Entry {
    module: string;
    anchors: string[];
    /** 1-based; only when the anchor text is not unique in the module. */
    line?: number;
    mutants: number;
    category: string;
    reason: string;
    decision: string;
    recorded: string;
    source: string;
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as {
    _what: string;
    _rules: string[];
    entries: Entry[];
};

const sourceOf = (module: string): string[] => readFileSync(join(ROOT, module), 'utf8').split('\n');

describe('equivalent-mutant ledger', () => {
    it('has entries (an empty ledger means the wiring is not doing anything)', () => {
        expect(ledger.entries.length).toBeGreaterThan(0);
    });

    it('CONTROL: a drifted anchor is actually caught', () => {
        // Without this, the anchor check passes over any ledger whose entries all
        // happen to match — including one whose matcher stopped working. Plant an
        // anchor that cannot be in the source and prove the same predicate rejects it.
        const entry = ledger.entries[0];
        const lines = sourceOf(entry.module);
        const planted = `${entry.anchors[0]} /* NOT IN SOURCE */`;
        expect(lines.filter((l) => l.trim() === planted)).toHaveLength(0);
        // …and prove the real one does match, so the predicate is not simply always 0.
        expect(lines.filter((l) => l.trim() === entry.anchors[0])).toHaveLength(1);
    });

    describe.each(ledger.entries.map((e, i) => [i, e] as const))('entry %i — %o', (_i, entry) => {
        it('names a module that exists', () => {
            expect(existsSync(join(ROOT, entry.module))).toBe(true);
        });

        it('every anchor resolves to exactly one line of that module', () => {
            const lines = sourceOf(entry.module);
            for (const anchor of entry.anchors) {
                // An entry may carry `line` (1-based) when its anchor text is not unique
                // in the module; the anchor must then sit at exactly that line. Otherwise
                // 0 = the code moved and the equivalence claim was never re-checked, and
                // >1 = the anchor no longer names one mutant site.
                const atLine = (lines[(entry.line ?? 0) - 1] ?? '').trim() === anchor ? 1 : 0;
                const hits =
                    entry.line !== undefined
                        ? atLine
                        : lines.filter((l) => l.trim() === anchor).length;
                expect({ anchor, line: entry.line, hits }).toEqual({
                    anchor,
                    line: entry.line,
                    hits: 1,
                });
            }
        });

        it('accounts for at least one mutant', () => {
            expect(entry.mutants).toBeGreaterThan(0);
        });

        it('carries an argument, not just a label', () => {
            // A one-line reason is a note; this ledger subtracts from a quality
            // measure, so an entry has to say why no test can kill the mutant.
            expect(entry.reason.length).toBeGreaterThan(120);
            expect(entry.decision).toBeTruthy();
            expect(entry.source).toBeTruthy();
        });
    });

    it('does not double-count one anchor under two entries', () => {
        // `line` is part of the identity, not decoration: a module may repeat one line of
        // source (two effects opening with the same guard), and the anchor check above
        // already relies on `line` to tell those sites apart. Keying on the text alone
        // called two distinct mutant sites one entry and refused the second.
        const seen = ledger.entries.flatMap((e) =>
            e.anchors.map((a) => `${e.module}::${e.line ?? '*'}::${a}`),
        );
        expect(seen).toHaveLength(new Set(seen).size);
    });
});
