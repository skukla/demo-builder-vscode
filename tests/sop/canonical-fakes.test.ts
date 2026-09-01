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

/**
 * Read a corpus file, or return empty if it vanished between the listing and the
 * read.
 *
 * Jest runs suites in parallel, and another suite may create and delete a temporary
 * file inside `tests/` while this one is walking it. `collectTestFiles` already
 * tolerates that for DIRECTORIES and says so in a comment; the READS were left
 * unguarded, and on 2026-09-01 that became a real ENOENT failure the moment a new
 * suite started writing a probe file.
 *
 * Empty is the right answer, not a throw: this counts COMMITTED files, and a file
 * that no longer exists is not one. The assertions are exact-equality against a
 * pinned number, so a genuinely missing corpus file fails the count rather than
 * slipping through.
 */
function readOrEmpty(rel: string): string {
    try {
        return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
        return '';
    }
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
                `jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));`
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

    /**
     * A FLAT BAN since 2026-09-01: the grandfather list is empty, so every file is
     * judged by the rule and there is nothing left to be exempt. It was seeded at
     * 296 and shrank to zero — the arc `featureBarrels` and `reExportIndex` took.
     *
     * The empty array is kept rather than deleted because the stale-row test below
     * reads it too. Re-adding a name would grandfather a fake again, which is why
     * the ledger's own note says the list is closed.
     */
    it('no test file hand-rolls a fake that has a canonical builder', () => {
        const grandfathered = new Set(ledger.logger);
        expect(grandfathered.size).toBe(0); // the ban: nothing is exempt any more
        const offenders: string[] = [];
        for (const file of files) {
            const kinds = handRolledFakes(readOrEmpty(file));
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

describe('a fake of a real type is not a literal the compiler was told to ignore', () => {
    /**
     * `{...} as unknown as Project` is a fake with the type check switched off. It
     * is also where every defect this suite's siblings found on 2026-08-31 was
     * hiding: 26 StateManager members faked for methods that do not exist, a whole
     * HandlerContext that was `{}`, an argument passed `as never`, and
     * `{ status: 'running' }` standing in for a Project.
     *
     * These nine types each have a builder in tests/helpers already, so the target
     * for every one is ZERO — not a judgement about whether a fake is reasonable,
     * just a count of places a builder exists and was not used.
     *
     * A CEILING rather than a file ledger, deliberately. 324 files carry one of
     * these; that is too many rows for anyone to keep honest, while nine numbers
     * maintain themselves. The assertion demands EXACT equality, so a conversion
     * that lowers a count must lower the pin in the same commit — the ratchet
     * cannot silently slacken, and a regression cannot hide under a stale pin.
     *
     * Casts to types with NO builder are deliberately not counted. Some are
     * legitimate: a fetch `Response` stub carrying three of its twenty members is
     * right when the code reads three. The rule is "use the builder that exists",
     * not "never cast".
     */
    const CEILINGS = (LEDGER as unknown as { castCeilings: Record<string, number> })
        .castCeilings;
    const CAST = /\}\s*as\s+(?:unknown\s+as\s+)?([A-Za-z_][\w.]*(?:\[[^\]]*\])?(?:<[^>]*>)?)/g;

    const counts: Record<string, number> = (() => {
        const out: Record<string, number> = {};
        for (const key of Object.keys(CEILINGS)) out[key] = 0;
        for (const f of collectTestFiles(testsDir)) {
            if (f.startsWith('tests/helpers/')) continue;
            const body = readOrEmpty(f);
            for (const m of body.matchAll(CAST)) {
                if (m[1] in out) out[m[1]] += 1;
            }
        }
        return out;
    })();

    it('CONTROL: the detector sees a cast and not a plain literal', () => {
        const re = /\}\s*as\s+(?:unknown\s+as\s+)?([A-Za-z_][\w.]*)/;
        expect(re.test('const p = {} as unknown as Project;')).toBe(true);
        expect(re.test('const p = {} as Project;')).toBe(true);
        expect(re.test('const p = { a: 1 };')).toBe(false);
        // And the corpus was read, so a zero means "none left", not "never looked".
        expect(collectTestFiles(testsDir).length).toBeGreaterThan(500);
    });

    it.each(Object.keys(CEILINGS))('%s: casts to it only ever fall', (type) => {
        const ceiling = CEILINGS[type];
        const count = counts[type];
        expect({
            type,
            count,
            verdict:
                count > ceiling
                    ? 'GREW — a new fake bypassed the builder'
                    : count < ceiling
                      ? 'LOWER THE PIN in canonical-fakes.ledger.json'
                      : 'at',
        }).toEqual({ type, count, verdict: 'at' });
    });

    /**
     * The families that reached ZERO, kept under enforcement.
     *
     * This exists because of a hole opened on 2026-09-01 and found the same day by
     * the owner asking "can we check our work?". Five families were closed by
     * DELETING their ceiling key — and the test above iterates
     * `Object.keys(CEILINGS)`, so deleting a key deletes its check. All five were
     * silently unenforced: `as Logger` could have come straight back, in any
     * number, with nothing failing.
     *
     * A ceiling of 0 would have kept enforcing. The deletion is what broke it. So
     * a closed family moves HERE rather than vanishing, and this asserts both
     * halves — no occurrences, and no ceiling row to reopen. The same shape as
     * `expectBanned` in architectureScan, which was written three hours earlier
     * for exactly this failure and then not applied here.
     *
     * READ THE SCOPE PRECISELY, because it was overstated once. The pattern is
     * brace-anchored: it bans a hand-rolled OBJECT LITERAL cast to the type — the
     * thing a builder replaces. It does not ban every `as T`. An AST count on
     * 2026-09-01 found casts of other expressions still present at Logger 98,
     * StateManager 63 and CommandExecutor 9, against a ban that reads, if you skim
     * it, like none exist. Those are a different defect — an argument cast is a
     * silenced type error, not a missing builder — and they live in `astTotals`.
     */
    const BANNED = (LEDGER as unknown as { castBans: string[] }).castBans;

    it('CONTROL: the ban list is populated and disjoint from the ceilings', () => {
        // An empty list would make every assertion below vacuous.
        expect(BANNED.length).toBeGreaterThanOrEqual(5);
        expect(BANNED.filter((t) => t in CEILINGS)).toEqual([]);
    });

    it.each(BANNED)('%s: no object literal is cast to it', (type) => {
        const re = new RegExp(
            String.raw`\}\s*as\s+(?:unknown\s+as\s+)?${type.replace(/[.[\]'$]/g, '\\$&')}\b`,
            'g'
        );
        const offenders: string[] = [];
        for (const f of collectTestFiles(testsDir)) {
            if (f.startsWith('tests/helpers/')) continue;
            const body = readOrEmpty(f);
            if (re.test(body)) offenders.push(f);
            re.lastIndex = 0;
        }
        expect({ type, offenders, reopenedCeiling: type in CEILINGS }).toEqual({
            type,
            offenders: [],
            reopenedCeiling: false,
        });
    });
});

describe('a jest.mock factory reaches the builder too', () => {
    /**
     * THE BLIND SPOT THIS CLOSES. The two checks above walk object literals in
     * ordinary test code. Neither looks inside a `jest.mock` factory — so 23
     * hand-rolled loggers sat in factories across 21 files and NOTHING counted
     * them, which is exactly why they outlived every other group and became the
     * last open item on PL-16. They were not hard; they were unmeasured.
     *
     * The excuse for them was real but only half true: a factory is hoisted above
     * the imports, so it cannot reference an imported builder. The factory BODY,
     * however, runs lazily — so `require()` inside it reaches the builder fine:
     *
     *     
     *
     * One trap, which cost a suite-load failure on 2026-08-31: if the factory
     * captures a `mockX` from module scope, read it LAZILY (inside `getLogger`,
     * memoised), never at factory-run time — the factory is hoisted above
     * `const mockX = jest.fn()`, so an eager read throws "cannot access before
     * initialization".
     */
    const LOGGER_METHODS = new Set([
        'debug',
        'error',
        'info',
        'warn',
        'trace',
        'show',
        'clear',
        'log',
    ]);

    /**
     * The one legitimate hand-rolled logger in a factory: the shared node setup
     * IS the canonical global mock, and it cannot import the builder to build
     * itself. Every other factory has somewhere to import from.
     */
    const EXEMPT_FACTORIES = new Set(['tests/setup/node.ts']);

    function factoryLoggerLiterals(body: string): number {
        let found = 0;
        const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of stripped.matchAll(/jest\.mock\(/g)) {
            let depth = 0;
            let j = m.index! + 'jest.mock'.length;
            for (; j < stripped.length; j++) {
                if (stripped[j] === '(') depth += 1;
                else if (stripped[j] === ')') {
                    depth -= 1;
                    if (depth === 0) {
                        j += 1;
                        break;
                    }
                }
            }
            const call = stripped.slice(m.index!, j);
            for (const lit of call.matchAll(/\{[^{}]*\}/g)) {
                const keys = new Set([...lit[0].matchAll(/(\w+)\s*:/g)].map((k) => k[1]));
                const loggerish = [...keys].filter((k) => LOGGER_METHODS.has(k)).length;
                const onlyLoggerish = [...keys].every(
                    (k) =>
                        LOGGER_METHODS.has(k) || k === 'getLogger' || k === 'initializeLogger'
                );
                if (keys.size > 0 && loggerish >= 3 && onlyLoggerish) {
                    found += 1;
                    break;
                }
            }
        }
        return found;
    }

    it('CONTROL: the detector sees a factory logger, and not other factories', () => {
        expect(
            factoryLoggerLiterals(
                "jest.mock('m', () => ({ getLogger: () => ({ debug: 1, info: 2, warn: 3 }) }));"
            )
        ).toBe(1);
        // A factory that reaches the builder is not a hand-roll.
        expect(
            factoryLoggerLiterals(
                "jest.mock('m', () => { const { createMockLogger } = require('x');" +
                    ' return { getLogger: () => createMockLogger() }; });'
            )
        ).toBe(0);
        // An unrelated factory is not a logger.
        expect(
            factoryLoggerLiterals("jest.mock('m', () => ({ read: 1, write: 2, seek: 3 }));")
        ).toBe(0);
        // A logger literal OUTSIDE a factory belongs to the checks above, not this one.
        expect(factoryLoggerLiterals('const l = { debug: 1, info: 2, warn: 3 };')).toBe(0);
    });

    it('no jest.mock factory hand-rolls a logger', () => {
        const offenders = collectTestFiles(testsDir)
            .filter((f) => f !== path.relative(repoRoot, __filename).replace(/\\/g, '/'))
            .filter((f) => !EXEMPT_FACTORIES.has(f))
            .filter((f) => factoryLoggerLiterals(readOrEmpty(f)) > 0);
        expect(offenders).toEqual([]);
    });
});

describe('a fake two feature directories need lives in tests/helpers/', () => {
    /**
     * The placement half of the canonical-fake rule, and the one that was filed as
     * unenforceable. It is not: "does a SECOND feature directory need it?" is a
     * mechanical question once you resolve imports rather than match names.
     *
     * Measured 2026-08-31 before building this: 139 builders are defined outside
     * `tests/helpers/`, and **zero** are imported from a second feature directory.
     * The rule is already kept everywhere, so this is a flat ban rather than a
     * ledger — nothing to grandfather.
     *
     * IT COUNTS IMPORTS, NOT CALLS, and that distinction is the whole check. A
     * first pass matched call sites by NAME and reported nine violations; the worst
     * was `createProject`, which is also a production function, so every handler
     * test calling the real one looked like a consumer of the fake. Resolving the
     * import to the defining module is what separates them.
     *
     * @see .rptc/backlog/2026-08-31-every-convention-enforced.md
     */
    const BUILDER =
        /export\s+(?:async\s+)?function\s+((?:create|make|build)[A-Z]\w*)|export\s+const\s+((?:create|make|build)[A-Z]\w*)\s*(?::[^=]+)?=/g;

    /** Which feature owns a test file — the unit the rule is about. */
    function owningArea(relPath: string): string {
        const parts = relPath.split('/');
        if (parts[1] === 'features' && parts.length > 2) return `features/${parts[2]}`;
        if (parts.length > 2) return parts[1];
        return '<tests-root>';
    }

    it('CONTROL: the detector finds builders and resolves an import to its definition', () => {
        const all = collectTestFiles(testsDir);
        expect(all.length).toBeGreaterThan(500);
        const helper = all.find((f) => f.endsWith('tests/helpers/loggerFake.ts'));
        expect(helper).toBeDefined();
        const body = fs.readFileSync(path.join(repoRoot, helper as string), 'utf8');
        expect([...body.matchAll(BUILDER)].length).toBeGreaterThan(0);
    });

    it('no builder outside tests/helpers/ is imported by a second feature directory', () => {
        const files = collectTestFiles(testsDir);

        // name -> the files outside tests/helpers/ that define it
        const defined = new Map<string, string[]>();
        for (const f of files) {
            if (f.startsWith('tests/helpers/')) continue;
            const body = readOrEmpty(f);
            for (const m of body.matchAll(BUILDER)) {
                const name = m[1] ?? m[2];
                defined.set(name, [...(defined.get(name) ?? []), f]);
            }
        }

        // name -> the areas that IMPORT it from one of those defining files
        const areas = new Map<string, Set<string>>();
        for (const f of files) {
            const body = readOrEmpty(f);
            for (const m of body.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
                const target = path
                    .normalize(path.join(path.dirname(f), m[2]))
                    .replace(/\\/g, '/');
                for (const raw of m[1].split(',')) {
                    const name = raw.trim().split(' as ')[0].trim();
                    const homes = defined.get(name);
                    if (!homes) continue;
                    if (!homes.some((h) => h.replace(/\.tsx?$/, '') === target)) continue;
                    areas.set(name, (areas.get(name) ?? new Set()).add(owningArea(f)));
                }
            }
        }

        const offenders = [...areas.entries()]
            .filter(([, seen]) => seen.size >= 2)
            .map(([name, seen]) => `${name} — needed by ${[...seen].sort().join(', ')}`)
            .sort();
        expect(offenders).toEqual([]);
    });
});
