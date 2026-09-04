/**
 * A test may not kill a mutant by asserting a LOGGER call's arguments.
 *
 * `expect(logger.debug).toHaveBeenCalledWith('[X] something failed: reason')` pins
 * wording, not behaviour. The mutation ratchet exists to refuse a score raised that
 * way, and it cannot see it when the padding is mixed with genuine work: on
 * 2026-09-03 four such assertions hid behind 53 real kills in one run and were caught
 * only by a person reading the file. Yesterday's triage of the same module had
 * deliberately NOT written them — all four HTTP failure branches produce an identical
 * outcome, and asserting the message entrenches an open product question (a
 * rate-limited SC sees "no update" indefinitely, identical to being current).
 *
 * SHRINK-ONLY. 286 such assertions existed in 123 files when this landed, and
 * rewriting them tonight is not the work. The ledger pins each file's count; a file
 * may lower it or disappear, never rise, and a file not listed may have none. The
 * exemption is by RULE, not by list: under `tests/core/logging/` the logger is the
 * subject, and asserting what it was called with is the whole point.
 *
 * `not.toHaveBeenCalled()` on a logger asserts silence, not wording, and is allowed.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');
const LEDGER = join(__dirname, 'logger-wording-assertions.ledger.json');
const EXEMPT_PREFIX = 'tests/core/logging/';

const WORDING =
    /expect\(\s*[\w.]*[lL]ogger[\w.]*\s*\)\s*\.(?:toHaveBeenCalledWith|toHaveBeenLastCalledWith|toHaveBeenNthCalledWith)\(/g;

function testFiles(dir: string): string[] {
    const out: string[] = [];
    // See the note in no-credential-shaped-fixtures: one syscall instead of two, so a
    // probe file another suite deletes mid-walk cannot fail this run (2026-09-04).
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...testFiles(p));
        else if (/\.test\.tsx?$/.test(entry.name)) out.push(p);
    }
    return out;
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as { ceilings: Record<string, number> };

describe('no test asserts a logger call’s arguments beyond its recorded ceiling', () => {
    const counts = new Map<string, number>();
    for (const f of testFiles(join(ROOT, 'tests'))) {
        const rel = relative(ROOT, f);
        // This file's own control strings are the pattern; it is not a test of a logger.
        if (f === __filename) continue;
        if (rel.startsWith(EXEMPT_PREFIX)) continue;
        const n = (readFileSync(f, 'utf8').match(WORDING) ?? []).length;
        if (n) counts.set(rel, n);
    }

    it('CONTROL: the pattern matches what it bans and not what it allows', () => {
        const hit = (s: string) => (s.match(WORDING) ?? []).length;
        expect(hit("expect(logger.debug).toHaveBeenCalledWith('[X] failed');")).toBe(1);
        expect(hit('expect(mockLogger.error).toHaveBeenCalledWith(')).toBe(1);
        expect(hit('expect(this.debugLogger.warn).toHaveBeenNthCalledWith(2,')).toBe(1);
        expect(hit('expect(logger.debug).not.toHaveBeenCalled();')).toBe(0);
        expect(hit('expect(logger.warn).toHaveBeenCalledTimes(1);')).toBe(0);
        expect(hit("expect(result.message).toHaveBeenCalledWith('x')")).toBe(0);
    });

    it('CONTROL: the scan sees the corpus', () => {
        expect(counts.size).toBeGreaterThan(50);
    });

    it('no file exceeds its ceiling, and no unlisted file has any', () => {
        const over: string[] = [];
        for (const [file, n] of counts) {
            const ceiling = ledger.ceilings[file] ?? 0;
            if (n > ceiling) over.push(`${file}: ${n} (ceiling ${ceiling})`);
        }
        // Lower a ceiling when you remove an assertion; never raise one. A new file
        // has a ceiling of zero. If the only observable difference is which log line
        // prints, the mutant belongs in scripts/mutation-equivalents.ledger.json.
        expect(over).toEqual([]);
    });

    it('the ledger only shrinks: no ceiling stands above the count on disk', () => {
        const stale = Object.entries(ledger.ceilings)
            .filter(([file, ceiling]) => (counts.get(file) ?? 0) < ceiling)
            .map(
                ([file, ceiling]) => `${file}: ceiling ${ceiling}, on disk ${counts.get(file) ?? 0}`
            );
        // A ceiling above the real count is headroom nobody chose. Lower it.
        expect(stale).toEqual([]);
    });
});
