/**
 * IMPORT CYCLES — none in `src/`, and no ledger to write one into.
 *
 * Until 2026-10-08 cycles had a periodic cadence only: `circular-dependency-scan` ran
 * when somebody typed it. Four sat in `src/` unnoticed, three of them through the
 * dashboard command, each hidden behind an `await import()` that kept load order
 * working while the loop stayed real. PR-1a broke all four; this keeps the count at
 * the zero they reached, as a ban rather than a ratchet, because a ratchet at zero
 * is a ban with a slot for exceptions.
 *
 * Same scope as the scan: RUNTIME edges only. `.madgerc` sets `skipTypeImports`, so
 * an `import type` (erased at compile, no init-order hazard) does not count. An
 * `await import()` DOES count — deferring a loop does not remove it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// madge ships no types; this suite uses three members of its result.
const madge = require('madge') as (
    path: string,
    config: object,
) => Promise<{ circular(): string[][]; obj(): Record<string, string[]> }>;

/** `.madgerc`'s options, plus the tsconfig so `@/` aliases resolve to files. */
const CONFIG = {
    fileExtensions: ['ts', 'tsx'],
    tsConfig: 'tsconfig.json',
    detectiveOptions: { ts: { skipTypeImports: true }, tsx: { skipTypeImports: true } },
};

/** Scanning ~1,200 modules takes a few seconds. */
const SCAN_TIMEOUT = 60_000;

describe('src has no import cycles', () => {
    let graph: Record<string, string[]>;
    let cycles: string[][];

    beforeAll(async () => {
        const result = await madge('src', CONFIG);
        graph = result.obj();
        cycles = result.circular();
    }, SCAN_TIMEOUT);

    it('CONTROL: the scan reads the real tree and follows @/ aliases', () => {
        // Most imports use `@/`. If aliases stopped resolving, those edges would vanish
        // and every cycle through one would go unseen while this suite stayed green.
        expect(Object.keys(graph).length).toBeGreaterThan(500);
        expect(graph['features/dashboard/services/projectPanelPushes.ts']).toContain(
            'core/base/baseWebviewCommand.ts',
        );
    });

    it('CONTROL: a planted cycle is reported', async () => {
        // Planted outside tests/ on purpose: a probe inside the tree races every suite
        // that walks it (PL-44).
        const dir = mkdtempSync(join(tmpdir(), 'import-cycle-probe-'));
        try {
            writeFileSync(join(dir, 'a.ts'), "import { b } from './b';\nexport const a = () => b;\n");
            writeFileSync(join(dir, 'b.ts'), "import { a } from './a';\nexport const b = () => a;\n");
            const planted = await madge(dir, CONFIG);
            expect(planted.circular()).toEqual([['a.ts', 'b.ts']]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }, SCAN_TIMEOUT);

    it('no module reaches itself through its own imports', () => {
        // To break one, move the shared piece into a module both sides can import
        // (projectPanelPushes.ts is the worked example), or invert the edge with a
        // callback. See the circular-dependency-scan skill.
        expect(cycles).toStrictEqual([]);
    });
});
