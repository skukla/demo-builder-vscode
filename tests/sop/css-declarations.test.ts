/**
 * CSS HEALTH THAT IS ABOUT THE DECLARATIONS, not about which bundle a sheet
 * reaches. Split out of `stylesheet-bundles.test.ts` on 2026-09-10 when that
 * file passed the repo's 750-line test-file limit — six checks were added to it
 * in one day and it had stopped being about one subject.
 *
 * Here: reduced-motion wins from `@layer overrides` with NO `!important`,
 * motion timings come from Spectrum's scale, and every sheet actually PARSES.
 * `stylesheet-bundles` keeps the reach and cascade-order questions.
 *
 * (This line said "reduced-motion keeps its `!important`" until 2026-09-10 — a
 * summary written before the block moved, contradicting the describe directly
 * below it. The header is the half nobody re-reads.)
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

describe('ADR-018 §2: reduced-motion blocks live in @layer overrides', () => {
    /**
     * A `prefers-reduced-motion: reduce` block is a KILL SWITCH, so it has to beat
     * every animation rule we wrote. There are two ways to arrange that, and only
     * one of them is honest.
     *
     * These blocks used to sit in `@layer reset` (the LOWEST layer) and in
     * `@layer theme`, fighting upward, and carried `!important` to win. That reads
     * as "reduced motion needs !important". It does not. It needed `!important`
     * because it was in the wrong layer — a kill switch is not a reset, it is an
     * override. Probed live, control first:
     *   theme rule alone                -> 2s infinite
     *   @layer reset,     plain         -> 2s infinite   (loses)
     *   @layer reset,     !important    -> 0.01ms        (wins, the old way)
     *   @layer overrides, plain         -> 0.01ms        (wins, with nothing)
     *
     * Then end-to-end with `prefers-reduced-motion` EMULATED against the real
     * bundle: all 170 elements read `1e-05s` and nothing has real motion, with
     * ZERO `!important` in the repo.
     *
     * This is what took the count from 1,294 to 0 rather than to 6. The six
     * survivors were not a legitimate residue; they were evidence of a misplaced
     * block, and accepting them would have written that mistake down as a rule.
     */
    const SHEETS = execSync('git ls-files "*.css"', { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .filter((f) => f && !f.includes('node_modules'));
    const blank = (css: string): string =>
        css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

    /** For each reduced-motion block: which layer encloses it, and how deeply. */
    const blocks = (css: string): { layer: string; depth: number }[] => {
        const text = blank(css);
        const out: { layer: string; depth: number }[] = [];
        for (const hit of text.matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{/g)) {
            const before = text.slice(0, hit.index);
            let depth = 0;
            const stack: [string, number][] = [];
            for (const tok of before.matchAll(/@layer\s+([\w-]+)\s*\{|\{|\}/g)) {
                if (tok[0].startsWith('@layer')) { stack.push([tok[1], depth]); depth++; }
                else if (tok[0] === '{') depth++;
                else { depth--; if (stack.length && stack[stack.length - 1][1] === depth) stack.pop(); }
            }
            out.push({ layer: stack.length ? stack[stack.length - 1][0] : 'UNLAYERED', depth: stack.length });
        }
        return out;
    };

    it('every reduced-motion block sits directly in @layer overrides', () => {
        const offenders: string[] = [];
        let total = 0;
        for (const f of SHEETS) {
            for (const b of blocks(readFileSync(join(ROOT, f), 'utf8'))) {
                total++;
                if (b.layer !== 'overrides' || b.depth !== 1) {
                    offenders.push(`${f}: in ${b.layer} at depth ${b.depth}`);
                }
            }
        }
        // Control: the blocks must EXIST, or this passes on nothing.
        expect(total).toBeGreaterThanOrEqual(5);
        expect(offenders.sort()).toStrictEqual([]);
    });

    it('and needs no !important to win', () => {
        const withImportant: string[] = [];
        for (const f of SHEETS) {
            const text = blank(readFileSync(join(ROOT, f), 'utf8'));
            for (const hit of text.matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{/g)) {
                let depth = 0;
                let i = hit.index + hit[0].length - 1;
                for (; i < text.length; i++) {
                    if (text[i] === '{') depth++;
                    else if (text[i] === '}') { depth--; if (depth === 0) break; }
                }
                if (text.slice(hit.index, i).includes('!important')) withImportant.push(f);
            }
        }
        expect(withImportant).toStrictEqual([]);
    });

    it('CONTROL: the scan can tell a misplaced block from a correct one', () => {
        expect(blocks('@layer overrides { @media (prefers-reduced-motion: reduce) { .a { x: y; } } }'))
            .toStrictEqual([{ layer: 'overrides', depth: 1 }]);
        expect(blocks('@layer reset { @media (prefers-reduced-motion: reduce) { .a { x: y; } } }'))
            .toStrictEqual([{ layer: 'reset', depth: 1 }]);
    });
});

describe('ADR-018 §7: motion timings come from Spectrum\'s scale', () => {
    /**
     * Durations in `animation`/`transition` are Spectrum duration tokens, not
     * hand-written milliseconds.
     *
     * WHY. Measured 2026-09-10: 72 animation/transition declarations, of which
     * FOUR used a token and 68 hand-wrote their timing, across **11 distinct
     * durations** and 6 easing curves. `--db-motion-*` was three constants with
     * four consumers in a codebase where everyone else typed `0.2s ease` — it
     * unified nothing, and its own curve was a sixth one.
     *
     * The tell that adoption had stalled rather than finished: `--db-motion-fast:
     * 150ms` was deleted as "referenced by nothing", and 150ms is hand-written 17
     * times. A reachability check asks whether anything NAMES a token, never
     * whether anything uses its VALUE.
     *
     * Spectrum's scale was verified usable first — 24 animated elements across all
     * eight surfaces, every one able to resolve the token. The largest shift for a
     * UI timing is 30ms, on one declaration.
     *
     * LOOP DURATIONS ARE EXEMPT. A 1.2s pulse or a 1s spinner is a designed rhythm,
     * not a UI transition, and forcing those onto the scale moves them by up to
     * 500ms. They stay literal, and this check leaves anything >= 1s alone.
     */
    const SHEETS = execSync('git ls-files "*.css"', { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .filter((f) => f && !f.includes('node_modules'));

    const LOOP_MS = 1000;
    const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

    it('no hand-written sub-second duration survives', () => {
        const offenders: string[] = [];
        let scanned = 0;
        for (const f of SHEETS) {
            const css = stripComments(readFileSync(join(ROOT, f), 'utf8'));
            for (const m of css.matchAll(/(?:animation|transition)(?:-duration)?\s*:\s*([^;]+);/g)) {
                scanned++;
                for (const d of m[1].matchAll(/(\d*\.?\d+)(ms|s)\b/g)) {
                    const ms = parseFloat(d[1]) * (d[2] === 'ms' ? 1 : 1000);
                    // Below 10ms is an OFF SWITCH, not a timing — reset.css's
                    // reduced-motion block uses `0.01ms !important` to stop
                    // animation without breaking code that listens for its end.
                    if (ms >= 10 && ms < LOOP_MS) {
                        offenders.push(`${f}: ${d[0]} in "${m[1].trim().slice(0, 46)}"`);
                    }
                }
            }
        }
        // Control: declarations must EXIST to be checked.
        expect(scanned).toBeGreaterThan(50);
        expect(offenders.sort()).toStrictEqual([]);
    });

    it('CONTROL: the scan sees a hand-written duration', () => {
        const planted = join(tmpdir(), `motion-${process.pid}.css`);
        writeFileSync(planted, '.a { transition: opacity 0.2s ease; }\n');
        try {
            const css = stripComments(readFileSync(planted, 'utf8'));
            const found = [...css.matchAll(/(?:animation|transition)\s*:\s*([^;]+);/g)].flatMap((m) =>
                [...m[1].matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map((d) => d[0])
            );
            expect(found).toStrictEqual(['0.2s']);
        } finally {
            unlinkSync(planted);
        }
    });
});

describe('every stylesheet PARSES — a rule the browser drops is not a rule', () => {
    /**
     * A comma-separated selector list interrupted by an at-rule.
     *
     * The migration's mover wraps each rule in `@layer theme { ... }`, and it
     * found rules by their BRACE line. A selector list written across several
     * lines has its brace on the last one, so the wrapper landed in the middle:
     *
     *     .manage-apis-body .intflow-api-picker,
     *     @layer theme {                          <-- the list never closes
     *     .manage-apis-body .intflow-api-scroll { ... }
     *
     * Chrome keeps ZERO rules from that. Measured 2026-09-09 in a real browser
     * against the correct form as a control: flex-grow 0 (initial) versus 1.
     * Three sheets shipped this way — shared-ui, data-installer and
     * connect-services — and nothing anywhere failed, because esbuild injects
     * CSS as a string and never parses it, and the visual baseline had captured
     * the broken state as the "before".
     *
     * This is a PARSE check, not a style opinion, which is why it has no ledger:
     * there is no such thing as a grandfathered unparseable rule.
     */
    const SHEETS = execSync('git ls-files "*.css"', { cwd: ROOT, encoding: 'utf8' })
        .split('\n')
        .filter((f) => f && !f.includes('node_modules'));

    /** Blank out comments, keeping line numbers so a hit can be cited. */
    const stripComments = (text: string): string => {
        let out = '';
        for (let i = 0; i < text.length; ) {
            if (text.startsWith('/*', i)) {
                const close = text.indexOf('*/', i + 2);
                const end = close < 0 ? text.length : close + 2;
                out += text.slice(i, end).replace(/[^\n]/g, ' ');
                i = end;
            } else {
                out += text[i];
                i++;
            }
        }
        return out;
    };

    const scan = (sheets: string[]): { broken: string[]; continued: number } => {
        const broken: string[] = [];
        let continued = 0;
        for (const f of sheets) {
            const lines = stripComments(readFileSync(join(ROOT, f), 'utf8')).split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
                if (!lines[i].trimEnd().endsWith(',')) continue;
                continued++;
                let j = i + 1;
                while (j < lines.length && lines[j].trim() === '') j++;
                if ((lines[j] ?? '').trim().startsWith('@')) {
                    broken.push(`${f}:${i + 1} — selector list broken by ${lines[j].trim()}`);
                }
            }
        }
        return { broken, continued };
    };

    it('no selector list is interrupted by an at-rule', () => {
        const { broken, continued } = scan(SHEETS);
        // Control: multi-line selector lists must EXIST, or this passes on nothing.
        expect(continued).toBeGreaterThan(20);
        expect(broken.sort()).toStrictEqual([]);
    });

    it('CONTROL: the scan detects the shape it is looking for', () => {
        // The exact text that shipped, so a rewrite of `scan` that stops seeing
        // it fails here rather than reporting the corpus clean.
        const planted = join(tmpdir(), `planted-${process.pid}.css`);
        writeFileSync(
            planted,
            '.a .b,\n@layer theme {\n.a .c {\n    flex: 1 1 auto;\n}\n}\n'
        );
        try {
            const rel = relative(ROOT, planted);
            const { broken } = scan([rel]);
            expect(broken).toHaveLength(1);
            expect(broken[0]).toContain('@layer theme {');
        } finally {
            unlinkSync(planted);
        }
    });
});
