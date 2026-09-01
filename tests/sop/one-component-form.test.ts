/**
 * A component is declared ONE way: `function Name(props: NameProps)`.
 *
 * A FLAT BAN on `React.FC`, adopted 2026-09-01 with the corpus already emptied by
 * `scripts/codemod/react-fc-to-function.mjs` — 36 sites across 32 files.
 *
 * WHY THE PLAIN FUNCTION AND NOT `React.FC`. It won on numbers before it won on
 * merit: 98 files already declared components this way against 31 that did not, so
 * the convention picks the majority rather than imposing a new habit on everyone.
 * On merit, `React.FC` used to add an implicit `children` prop (React 18's types
 * dropped it, which is most of why it fell out of favour), it pins the return type,
 * and it obstructs generic components. Nothing in this codebase needs what it gives.
 *
 * WHY THE RULE IS ABOUT CONSISTENCY, NOT CORRECTNESS. Both forms compile and both
 * work. The cost of two is that every reader holds two shapes, every example has a
 * dialect, and a new component copies whichever neighbour it landed next to. That is
 * the whole argument, and it is enough.
 *
 * `React.memo(...)` IS STILL ALLOWED and is not what this rule is about. Memoisation
 * is a performance decision taken per component; declaration style is a house style.
 * Five components use `React.memo` correctly and are untouched.
 *
 * @see docs/development/handbook.md
 * @see scripts/codemod/react-fc-to-function.mjs — how the corpus was emptied
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const srcDir = path.join(repoRoot, 'src');

/** Blank out comments, preserving offsets — prose about React.FC is not a use. */
function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

function walk(dir: string): string[] {
    const out: string[] = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules') continue;
            out.push(...walk(full));
        } else if (e.name.endsWith('.tsx')) {
            out.push(path.relative(repoRoot, full));
        }
    }
    return out;
}

const PATTERN = /\bReact\.(FC|FunctionComponent)\b/g;

describe('components are declared one way', () => {
    const files = walk(srcDir);

    it('CONTROL: the detector reads code and not prose', () => {
        // A ban over an empty corpus passes whether or not it can see anything.
        expect(stripComments('const X: React.FC<P> = () => null;')).toMatch(PATTERN);
        expect(stripComments('const X: React.FunctionComponent<P> = () => null;')).toMatch(PATTERN);
        // a MENTION is not a use — this file and the handbook both discuss it
        expect(stripComments('// prefer a function over React.FC')).not.toMatch(PATTERN);
        // and the allowed forms must not be caught
        expect(stripComments('export function X(props: XProps) { return null; }')).not.toMatch(
            PATTERN
        );
        expect(stripComments('export const X = React.memo<XProps>(() => null);')).not.toMatch(
            PATTERN
        );
        // the tree was actually read
        expect(files.length).toBeGreaterThan(100);
    });

    it('no component is declared as React.FC', () => {
        const offenders: string[] = [];
        for (const f of files) {
            let raw: string;
            try {
                raw = fs.readFileSync(path.join(repoRoot, f), 'utf8');
            } catch {
                continue;
            }
            const body = stripComments(raw);
            for (const m of body.matchAll(PATTERN)) {
                offenders.push(`${f}:${body.slice(0, m.index).split('\n').length}`);
            }
        }
        expect({
            offenders,
            fix: 'declare it as `function Name(props: NameProps)` — React.memo is unaffected',
        }).toEqual({
            offenders: [],
            fix: 'declare it as `function Name(props: NameProps)` — React.memo is unaffected',
        });
    });
});
