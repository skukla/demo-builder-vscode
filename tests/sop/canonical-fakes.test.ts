/**
 * SOP Compliance Test: a fake with a canonical builder is not hand-rolled again.
 *
 * `tests/helpers/` holds the builders for fakes that more than one feature
 * directory needs. Writing another copy inline is not a discipline failure — it is
 * what happens when finding the existing one is harder than typing it again, which
 * is how `createMockLogger` came to be defined nine times across four return types
 * while 500-odd more logger literals accumulated inline (PL-16).
 *
 * So this guard is a RATCHET, not a sweep. Every file that already hand-rolls one
 * is grandfathered in `canonical-fakes.ledger.json`; the list may only SHRINK. A
 * NEW test file that hand-rolls a covered fake fails here and is told what to
 * import instead. That is the half that matters: the measured problem was the
 * RATE, roughly twenty new hand-rolled fakes in a single day of conversion work,
 * so stopping the bleeding beats draining the pool.
 *
 * To convert a grandfathered file: import the builder, delete the literal, remove
 * the ledger entry. One file per commit is fine — that is the intended cadence.
 *
 * @see .rptc/backlog/2026-08-28-shared-test-builders.md
 * @see tests/helpers/loggerFake.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import LEDGER from './canonical-fakes.ledger.json';

const testsDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(testsDir, '..');

/** This guard's own file, and the builder it points at. Neither may self-trip. */
const EXEMPT = new Set([
    path.relative(repoRoot, __filename).replace(/\\/g, '/'),
    'tests/helpers/loggerFake.ts',
]);

/**
 * One covered fake: how to recognise a hand-rolled copy, and what to import.
 *
 * `required` are the keys a literal must have to count; `allowed` bounds it, so an
 * unrelated object that happens to carry `info` and `error` alongside six other
 * methods is not mistaken for a logger.
 */
interface CanonicalFake {
    readonly kind: string;
    readonly required: readonly string[];
    readonly allowed: readonly string[];
    readonly importFrom: string;
    readonly builder: string;
}

/**
 * Deliberately just the logger for now.
 *
 * It is the highest-count fake in the corpus and the lowest-risk to get wrong — a
 * logger fake missing a method fails loudly and immediately. The other candidates
 * PL-16 names (state manager, project, token provider) each need their builder
 * settled first; adding a row here before that would fail files with nothing to
 * import.
 */
const COVERED: readonly CanonicalFake[] = [
    {
        kind: 'logger',
        required: ['debug', 'info', 'warn', 'error'],
        allowed: ['trace', 'debug', 'info', 'warn', 'error'],
        importFrom: 'tests/helpers/loggerFake',
        builder: 'createMockLogger()',
    },
];

/**
 * Character ranges covered by a `jest.mock(...)` call.
 *
 * A literal inside one is EXEMPT, and not as a convenience. Babel hoists a
 * `jest.mock` factory above the imports of its module, so the factory runs before
 * any import exists — referencing `createMockLogger` from inside one throws
 * "The module factory of jest.mock() is not allowed to reference any out-of-scope
 * variables". Failing a file for that would demand something the runtime forbids.
 */
function jestMockSpans(source: string): Array<[number, number]> {
    const spans: Array<[number, number]> = [];
    for (const match of source.matchAll(/jest\.mock\(/g)) {
        let depth = 0;
        let k = source.indexOf('(', match.index ?? 0);
        for (; k < source.length; k++) {
            if (source[k] === '(') depth++;
            else if (source[k] === ')' && --depth === 0) break;
        }
        spans.push([match.index ?? 0, k]);
    }
    return spans;
}

/** Every `{ … }` literal in `source` whose values include at least one `jest.fn()`. */
function jestFnLiterals(source: string): Set<string>[] {
    const spans = jestMockSpans(source);
    const shapes: Set<string>[] = [];
    for (const match of source.matchAll(/\{([^{}]*jest\.fn\(\)[^{}]*)\}/g)) {
        const at = match.index ?? 0;
        if (spans.some(([a, b]) => a <= at && at < b)) continue;
        const keys = new Set([...match[1].matchAll(/(\w+)\s*:\s*jest\.fn\(\)/g)].map((k) => k[1]));
        if (keys.size > 0) shapes.push(keys);
    }
    return shapes;
}

/** Which covered fakes `source` hand-rolls, by kind. */
export function handRolledFakes(source: string): string[] {
    const found = new Set<string>();
    for (const shape of jestFnLiterals(source)) {
        for (const fake of COVERED) {
            const withinBounds = [...shape].every((k) => fake.allowed.includes(k));
            const hasRequired = fake.required.every((k) => shape.has(k));
            if (withinBounds && hasRequired) found.add(fake.kind);
        }
    }
    return [...found];
}

function collectTestFiles(dir: string): string[] {
    const files: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        // Removed mid-walk (a concurrent suite's temp dir). This is a static check
        // of committed files, so skipping is correct rather than fatal.
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

const ledger = LEDGER as { logger: string[] };

describe('a fake with a canonical builder is not hand-rolled again', () => {
    const files = collectTestFiles(testsDir).filter((f) => !EXEMPT.has(f));

    // CONTROL. If the walker or the literal matcher breaks, every check below
    // passes vacuously and reads exactly like a clean result. 900 is well under
    // the 1,342 files present and well over anything a real deletion would reach.
    it('CONTROL: scanned the test tree', () => {
        expect(files.length).toBeGreaterThan(900);
    });

    // CONTROL, the other direction: the matcher must actually recognise the thing
    // it is looking for. A regex that matches nothing would report a perfectly
    // clean tree.
    it('CONTROL: recognises a hand-rolled logger', () => {
        expect(
            handRolledFakes(
                'const l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };'
            )
        ).toEqual(['logger']);
        expect(
            handRolledFakes(
                'const l = { trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };'
            )
        ).toEqual(['logger']);
    });

    // The bound matters as much as the match: `execute`/`dispose` fakes that
    // happen to carry a couple of the same names must not be swept up.
    // The exemption is as load-bearing as the match: without it this guard fails a
    // file for something the jest runtime forbids, and the only way to satisfy it
    // would be to put the copy back.
    it('CONTROL: exempts a logger literal inside a jest.mock factory', () => {
        expect(
            handRolledFakes(
                `jest.mock('@/core/logging', () => ({ getLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));`
            )
        ).toEqual([]);
        // ...but a literal AFTER the factory closes is still caught.
        expect(
            handRolledFakes(
                `jest.mock('x', () => ({ a: jest.fn() }));\nconst l = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };`
            )
        ).toEqual(['logger']);
    });

    it('CONTROL: does not mistake an unrelated fake for a logger', () => {
        expect(
            handRolledFakes('const s = { info: jest.fn(), error: jest.fn(), deploy: jest.fn() };')
        ).toEqual([]);
        expect(handRolledFakes('const s = { debug: jest.fn(), info: jest.fn() };')).toEqual([]);
    });

    it('no test file outside the ledger hand-rolls a covered fake', () => {
        const grandfathered = new Set(ledger.logger);
        const offenders: string[] = [];
        for (const file of files) {
            const kinds = handRolledFakes(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
            if (kinds.includes('logger') && !grandfathered.has(file)) offenders.push(file);
        }
        expect({
            offenders,
            fix: 'import { createMockLogger } from tests/helpers/loggerFake',
        }).toEqual({
            offenders: [],
            fix: 'import { createMockLogger } from tests/helpers/loggerFake',
        });
    });

    // The ledger is a debt list, so an entry that no longer describes anything is
    // debt that was paid and never written off — and a stale entry is what lets a
    // file quietly start hand-rolling again without failing anything.
    it('every ledger entry still describes a real, hand-rolling file', () => {
        const stale = ledger.logger.filter((file) => {
            const full = path.join(repoRoot, file);
            if (!fs.existsSync(full)) return true;
            return !handRolledFakes(fs.readFileSync(full, 'utf8')).includes('logger');
        });
        expect({
            stale,
            fix: 'delete these lines from canonical-fakes.ledger.json — the debt is paid',
        }).toEqual({
            stale: [],
            fix: 'delete these lines from canonical-fakes.ledger.json — the debt is paid',
        });
    });
});
