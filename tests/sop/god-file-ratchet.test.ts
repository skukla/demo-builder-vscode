/**
 * SOURCE FILE SIZE — the rule that was stated for a long time and enforced by nothing.
 *
 * NOT A DUPLICATE, and the neighbours were read first — `31-registry-dir` delivered
 * the listing and this paragraph is the answer it asks for.
 * `architecture-rules.test.ts` enforces ADR-015's dependency direction and measures
 * no file size; `ratchet-controls.test.ts` is the mutation ratchet's own selftest;
 * `stylesheet-bundles.test.ts` owns `godFileTopLevelRules`, which counts CSS rules in
 * the CSS god file and has nothing to do with TypeScript source size.
 *
 * The thresholds are `/sop-scan` Agent 11's, which CLAUDE.md also states:
 *   service >400 · component >350 · handler >500 · util/helper >300
 * with Agent 11's exclusions: tests, type-definition files, barrels, config.
 *
 * WHY IT DID NOT EXIST UNTIL 2026-09-10. `godFile` appeared in `tests/sop/` only as
 * the CSS one. `toolingRegistry.ts` holds 39 instruments and none measures source
 * size, so `npm run sweep` ran no such check. The rule's only cadence was a person
 * typing `/sop-scan`. Measured the day this landed: 68 files over their limit, the
 * worst at 1,157 lines against 400.
 *
 * TWO NUMBERS, DELIBERATELY. Line count alone is not a finding — `decompose-god-file`
 * is explicit that a file over threshold WITHOUT coupling should be left alone. So:
 *
 *   `godFileCandidates` — over threshold. The population.
 *   `godFileCoupled`    — over threshold AND showing a coupling signal. The work.
 *
 * Pinning only the first would reward splitting cohesive files to move a number,
 * which is the opposite of the point: `appBuilderComponentRunner.ts` is 1,122 lines
 * with 11 imports and a 7-symbol public surface, and `edsPipeline.ts` is 973 lines
 * with 5 imports and ONE export. Both are long and neither is a god file.
 * Pinning only the second would let the population grow as long as each file stayed
 * simple.
 *
 * The signals are the ones the skill lists that a script can count: >15 non-type
 * imports, >10 public surface (exports + class methods), >7 constructor deps. The
 * others it names — mixed abstraction levels, multiple entity domains, one fallback
 * repeated three times — need a reader, and this does not pretend to measure them.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { basename, join } from 'path';

import { expectCeiling, loadLedger } from './architectureScan';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const LEDGER = loadLedger('architecture-rules.exemptions.json');

/** Agent 11's four kinds and their limits. Anything else has no stated limit. */
function limitFor(path: string): { kind: string; limit: number } | null {
    if (path.includes('/handlers/')) return { kind: 'handler', limit: 500 };
    if (path.includes('/services/')) return { kind: 'service', limit: 400 };
    if (path.endsWith('.tsx')) return { kind: 'component', limit: 350 };
    if (path.includes('/utils/') || path.includes('/helpers/')) return { kind: 'util', limit: 300 };
    return null;
}

/** Agent 11's exclusions, verbatim: tests, type definitions, barrels, config. */
function excluded(path: string): boolean {
    const base = basename(path);
    if (base.includes('.test.') || base.includes('.spec.')) return true;
    if (['types.ts', 'interfaces.ts', 'index.ts', 'index.tsx'].includes(base)) return true;
    return path.includes('/config/');
}

const SOURCES = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
    .filter((f) => !excluded(f));

interface Candidate {
    file: string;
    lines: number;
    limit: number;
    kind: string;
    signals: string[];
}

/** Control-keyword false positives for the method regex. */
const NOT_A_METHOD = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'return',
    'constructor',
    'super',
]);

function measure(file: string): Candidate | null {
    const limit = limitFor(file);
    if (!limit) return null;
    const src = readFileSync(join(ROOT, file), 'utf8');
    const lines = src.split('\n').length;
    if (lines <= limit.limit) return null;

    const imports = src.match(/^import\s+(?!type\b)[^;]+?from\s/gm) ?? [];
    const exports = src.match(/^export\s+(?:async\s+)?(?:function|const|class)\s+\w+/gm) ?? [];
    const methods = (src.match(/^ {4}(?:public |private |protected )?(?:async )?\w+\s*\(/gm) ?? [])
        .map((m) =>
            m
                .trim()
                .replace(/^(?:public |private |protected )?(?:async )?/, '')
                .replace(/\s*\($/, '')
        )
        .filter((m) => !NOT_A_METHOD.has(m));
    const ctor = /constructor\s*\(([^)]*)\)/s.exec(src);
    const ctorDeps = (ctor?.[1] ?? '').split(',').filter((x) => x.trim()).length;

    const signals: string[] = [];
    if (imports.length > 15) signals.push(`${imports.length} imports`);
    if (exports.length + methods.length > 10) {
        signals.push(`${exports.length + methods.length} public surface`);
    }
    if (ctorDeps > 7) signals.push(`${ctorDeps} constructor deps`);

    return { file, lines, limit: limit.limit, kind: limit.kind, signals };
}

const CANDIDATES = SOURCES.map(measure).filter((c): c is Candidate => c !== null);
const COUPLED = CANDIDATES.filter((c) => c.signals.length > 0);

describe('source files stay within the size limits this repo states', () => {
    it('CONTROL: the scan reads a real tree and applies a real limit', () => {
        // A zero here would make both ratchets pass while measuring nothing.
        expect(SOURCES.length).toBeGreaterThan(500);
        // A known-over file is seen, and a comfortably-under one is not.
        expect(measure('src/features/eds/services/daLive/daLiveContentCopy.ts')).not.toBeNull();
        expect(measure('src/core/ui/utils/classNames.ts')).toBeNull();
    });

    it('CONTROL: the exclusions Agent 11 states are honoured', () => {
        expect(excluded('src/features/eds/services/types.ts')).toBe(true);
        expect(excluded('src/core/ui/components/index.ts')).toBe(true);
        expect(excluded('src/features/components/config/anything.ts')).toBe(true);
        expect(excluded('src/features/eds/services/helix/helixService.ts')).toBe(false);
    });

    it('the number of files over their limit only falls', () => {
        expectCeiling(LEDGER, 'godFileCandidates', CANDIDATES.length);
    });

    it('the number ALSO showing a coupling signal only falls', () => {
        // This is the work list. A file over threshold with no coupling signal is
        // left alone on the skill's own instruction, so this is the number that
        // means something — and the one worth lowering deliberately.
        expectCeiling(LEDGER, 'godFileCoupled', COUPLED.length);
    });
});
