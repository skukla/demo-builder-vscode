/**
 * One builder, one home (PL-16).
 *
 * WHY THIS EXISTS. The test suite does not lack shared fixtures — it has 98
 * builder functions. What it lacks is a canonical one for each thing, so the
 * same NAME is defined in several files and writing another is cheaper than
 * finding the existing one. Measured 2026-08-28: 14 names defined more than
 * once, 43 redundant definitions, and `createMockContext` alone existing ten
 * times across SIX different return types — ten things wearing one name, not
 * one thing being shared.
 *
 * This check does not require anyone to consolidate. It requires the number not
 * to GROW while consolidation happens, which is the only property that makes the
 * work finishable: 43 became 43 one forgivable duplicate at a time.
 *
 * When you consolidate a name, delete its row. A row whose name is no longer
 * duplicated FAILS — the ledger may only shrink, same contract as the ADR-015
 * ledgers.
 */

import * as fs from 'fs';
import * as path from 'path';

const TESTS_ROOT = path.resolve(__dirname, '..');

/**
 * Names duplicated as of 2026-08-28, each with how many definitions existed.
 * These are the consolidation queue, most-copied first. Delete a row when its
 * name has exactly one definition left.
 */
/**
 * EMPTY as of 2026-08-28 — every duplicated builder name is consolidated.
 *
 * It began at 14 names / 43 redundant definitions. The list only ever shrank,
 * which is the property that made the work finishable: without it, 43 became 43
 * one forgivable duplicate at a time.
 *
 * Keeping the (now empty) ledger rather than deleting it is deliberate: the
 * checks below still run, so a new duplicate fails immediately instead of
 * quietly starting a fresh pile.
 */
const KNOWN_DUPLICATES: Record<string, number> = {};

/**
 * The builder convention, in BOTH declaration forms.
 *
 * The first version of this check matched only `export function`. That missed
 * every `export const createX = () => ...` — about a fifth of the corpus, and
 * three more logger builders that a consolidation had just been declared
 * complete without. A check blind to one form reports clean while duplicates
 * accumulate in the other, which is the precise failure this repo keeps paying
 * for: a zero from a probe that cannot see is indistinguishable from a zero
 * from a probe that found nothing.
 */
const BUILDER_FORMS = [
    /export\s+(?:async\s+)?function\s+((?:create|make|build)[A-Z]\w*)\s*\(/g,
    /export\s+const\s+((?:create|make|build)[A-Z]\w*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|function)/g,
];

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            out.push(...walk(full));
        } else if (/\.tsx?$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

/** name -> files defining it */
function collectBuilders(): Map<string, string[]> {
    const found = new Map<string, string[]>();
    for (const file of walk(TESTS_ROOT)) {
        const src = fs.readFileSync(file, 'utf8');
        for (const form of BUILDER_FORMS) {
            for (const m of src.matchAll(form)) {
                const rel = path.relative(TESTS_ROOT, file);
                found.set(m[1], [...(found.get(m[1]) ?? []), rel]);
            }
        }
    }
    return found;
}

const BUILDERS = collectBuilders();
const DUPLICATED = [...BUILDERS.entries()].filter(([, files]) => files.length > 1);

describe('PL-16: a builder name has one definition', () => {
    it('POSITIVE CONTROL: the scan finds builders at all', () => {
        // A zero here would make every assertion below pass vacuously.
        expect(BUILDERS.size).toBeGreaterThan(100);
        // Both declaration forms must be visible, or the check is half-blind.
        expect(BUILDERS.has('createSuccessResult')).toBe(true); // export const form
        expect(BUILDERS.has('createMockLogger')).toBe(true);
    });

    it('no NEW name becomes duplicated', () => {
        const unlisted = DUPLICATED.map(([name]) => name)
            .filter((name) => !(name in KNOWN_DUPLICATES))
            .sort();
        expect(unlisted).toEqual([]);
    });

    it('a consolidated name leaves the ledger — the list may only shrink', () => {
        const duplicatedNames = new Set(DUPLICATED.map(([name]) => name));
        const stale = Object.keys(KNOWN_DUPLICATES)
            .filter((name) => !duplicatedNames.has(name))
            .sort();
        expect(stale).toEqual([]);
    });

    it('no listed name grows MORE copies than it had at baseline', () => {
        const grown = DUPLICATED.filter(
            ([name, files]) => name in KNOWN_DUPLICATES && files.length > KNOWN_DUPLICATES[name]
        ).map(([name, files]) => `${name}: ${KNOWN_DUPLICATES[name]} -> ${files.length}`);
        expect(grown).toEqual([]);
    });
});
