/**
 * What `tokens.css` IS, now that it is not pretending to be a design system.
 *
 * IT USED TO ASSERT A PALETTE. Roughly sixty `expect(tokensCSS).toContain(
 * '--db-color-gray-100:')` lines, one per token, specifying a ramp of greys,
 * status colours, badges and surfaces. Every one passed for five months while the
 * file reached NO BUNDLE AT ALL — `index.css` pulled it in with an `@import` that
 * the esbuild plugin never resolved, so the whole palette was absent from the
 * product and the suite was green throughout. A test that a file contains a
 * string proves nothing about what ships.
 *
 * It was also specifying the wrong thing. Of 101 tokens, 21 were referenced and
 * 80 were not; the status colours were Tailwind hexes repainting Spectrum's own
 * semantic colours; and the terminal colours pinned VS Code's Dark+ palette into
 * a webview whose user may run any theme. The design system here is ADOBE'S —
 * 519 uses of `--spectrum-*` against 30 of `--db-*`.
 *
 * So this file's job is now narrow and worth stating: map the user's VS Code
 * theme onto a few semantic names, and hold the handful of constants that are
 * genuinely ours. These tests check THAT, and they check invariants rather than
 * strings — the strongest of them is that nothing here is dead, which is the
 * property the old suite could never have caught.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../../../../');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf-8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const tokensCSS = read('src/core/ui/styles/tokens.css');
const defined = (css: string) => [...strip(css).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);

/** Every file that could reference a token: our stylesheets and our components. */
const consumers = execSync(
    'git ls-files "*.css" "src/**/*.ts" "src/**/*.tsx"',
    { cwd: ROOT, encoding: 'utf8' }
)
    .split('\n')
    .filter((f) => f && !f.includes('node_modules') && !f.endsWith('styles/tokens.css'));

describe('tokens.css', () => {
    it('is wrapped in @layer theme', () => {
        expect(tokensCSS).toContain('@layer theme');
    });

    it('every token it defines is reachable — nothing here is dead', () => {
        const defs = new Set(defined(tokensCSS));
        // Control: the file must actually define tokens, or this passes on nothing.
        expect(defs.size).toBeGreaterThan(20);

        const referenced = new Set<string>();
        for (const f of consumers) {
            for (const m of strip(read(f)).matchAll(/var\(\s*(--[\w-]+)/g)) {
                if (defs.has(m[1])) referenced.add(m[1]);
            }
        }
        // Control: the consumer scan must find something, or "reachable" is vacuous.
        expect(referenced.size).toBeGreaterThan(5);

        // A token is reachable if something outside this file names it, or if a
        // reachable token resolves through it.
        const chains = new Map(
            [...strip(tokensCSS).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2]])
        );
        const reachable = new Set(referenced);
        let frontier = [...referenced];
        while (frontier.length) {
            const next: string[] = [];
            for (const t of frontier) {
                for (const m of (chains.get(t) ?? '').matchAll(/var\(\s*(--[\w-]+)/g)) {
                    if (defs.has(m[1]) && !reachable.has(m[1])) {
                        reachable.add(m[1]);
                        next.push(m[1]);
                    }
                }
            }
            frontier = next;
        }

        expect([...defs].filter((t) => !reachable.has(t)).sort()).toStrictEqual([]);
    });

    it('terminal colours defer to the user VS Code theme, with a fallback', () => {
        // Hard-coding Dark+ into a webview means an SC on a light theme reads
        // terminal output in colours their editor never uses. The fallback keeps
        // today's rendering for a theme that supplies nothing.
        const terminal = [...strip(tokensCSS).matchAll(/(--db-terminal-[\w-]+)\s*:\s*([^;]+);/g)];
        expect(terminal.length).toBeGreaterThan(3);
        for (const [, name, value] of terminal) {
            expect(`${name} -> ${value.trim()}`).toMatch(/var\(--vscode-terminal-[\w-]+,\s*var\(/);
        }
    });

    it('defines no status colour — those are Spectrum\'s', () => {
        // `--db-status-*` was #10b981/#ef4444/#f59e0b/#3b82f6: Tailwind, used to
        // repaint elements Spectrum had already coloured through its own
        // `color="positive"` prop. Replaced by --spectrum-semantic-*-color-status.
        expect(defined(tokensCSS).filter((t) => t.startsWith('--db-status'))).toStrictEqual([]);
    });
});
