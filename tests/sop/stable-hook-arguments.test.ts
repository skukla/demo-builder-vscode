/**
 * A value handed to a hook that DEPENDS on it must be stable across renders.
 *
 * A FLAT BAN, adopted 2026-09-01 with the corpus emptied the same day (12 findings
 * -> 0). This is the trap `src/core/ui/CLAUDE.md` called "the one no tool catches",
 * and that claim was half right in a way worth stating precisely, because it is the
 * reason this went unenforced for so long.
 *
 * WHAT `exhaustive-deps` GENUINELY CANNOT DO. It reads the dependency array from
 * INSIDE a hook. The value's freshness is decided OUTSIDE, by the caller who wrote
 * `useThing({ items: [] })`. Neither end can see the other, and the types are
 * identical either way, so the compiler is silent too. That much of the claim holds
 * and always will.
 *
 * WHAT CAN. The type checker crosses the boundary that a lint rule cannot: it
 * resolves the call to the hook's declaration, and the dependency arrays are then
 * plain text to read. So "does this inline literal reach a dependency array?" is
 * answerable for every hook declared in this repo. `scripts/codemod/survey-unstable-refs.mjs`
 * asks it; this pins the answer at zero.
 *
 * THE THREE THINGS IT MUST NOT FLAG, each of which it did on its first run — this
 * detector was wrong three times before it was right, and the corrections are more
 * of its value than the finding:
 *
 *   a DESTRUCTURED parameter   `useWizardState({ … })` tears the object apart in
 *                              its own signature, so nothing can depend on the
 *                              object. This was the MAJORITY of the first report
 *   a SPREAD dependency        `[...conditions, setX]` depends on the ELEMENTS;
 *                              the array's identity is irrelevant
 *   React's own hooks          `useState([])` reads its argument once, and the
 *                              `[]` in `useMemo(fn, [])` IS the dependency array.
 *                              1,077 sites, every one correct
 *
 * AND IT GRADES WHAT IT FINDS. An effect that re-runs every render LOOPS only if it
 * sets state on the way through; one that registers a listener re-subscribes and
 * settles; a `useMemo` merely fails to memoise. Calling all three "infinite loop"
 * would overstate two and devalue the first.
 *
 * WHAT EMPTYING IT ACTUALLY FIXED — the findings were real, not theoretical:
 *   - `useSelectionStep` defaulted `messagePayload = {}` and `searchFields = []`
 *     INSIDE its destructure, so both were rebuilt every render for every caller
 *     that omitted them. Callers doing nothing wrong paid for it.
 *   - the same hook named three caller-written callbacks in dependency arrays,
 *     re-subscribing its message listener on every render of three wizard surfaces.
 *   - `useActivateOnKey` handed all five tile call sites a new keydown handler
 *     every render.
 *
 * @see scripts/codemod/survey-unstable-refs.mjs — the detector, and its limits
 * @see docs/development/handbook.md
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');
const SCRIPT = 'scripts/codemod/survey-unstable-refs.mjs';

interface Survey {
    LOOP: string[];
    CHURN: string[];
    MEMO: string[];
    INERT: string[];
    EXTERNAL: string[];
    BUILTIN: number;
}

function survey(globs?: string): Survey {
    const args = [SCRIPT, '--json', ...(globs ? ['--globs', globs] : [])];
    const out = execFileSync('node', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(out) as Survey;
}

const FIXTURE = 'tests/fixtures/unstable-hook-args/*.tsx';

describe('a value handed to a hook is stable across renders', () => {
    jest.setTimeout(120_000);

    let control: Survey;
    let production: Survey;

    beforeAll(() => {
        control = survey(FIXTURE);
        production = survey();
    });

    it('CONTROL: it still catches each severity, and still ignores correct code', () => {
        /**
         * A ban over an empty corpus passes whether or not the detector can see
         * anything, so this fixture is the only evidence it works. It is a separate
         * tree rather than a probe planted in `src/` on purpose: jest runs suites in
         * parallel, and a file appearing and vanishing under another scanner's walk
         * is a race that broke four of them here on 2026-09-01.
         */
        const at = (rows: string[]) => rows.map((r) => r.split(/\s+/)[1]);

        expect({
            loops: at(control.LOOP),
            churn: at(control.CHURN),
            memos: at(control.MEMO),
        }).toEqual({
            loops: ['useLoopingProbe(arg'],
            churn: ['useChurningProbe(arg'],
            memos: ['useMemoProbe(arg'],
        });

        // The three must-not-flag cases. Each was a real false positive first.
        const flagged = [...control.LOOP, ...control.CHURN, ...control.MEMO].join('\n');
        expect(flagged).not.toMatch(/useDestructuredProbe/); // destructured parameter
        expect(flagged).not.toMatch(/useSpreadProbe/); // spread dependency
        expect(control.BUILTIN).toBeGreaterThan(0); // React's own hooks were seen and excluded
    });

    it('CONTROL: the production scan actually read the tree', () => {
        // Distinguishes "nothing left" from "the walk returned nothing" — the two
        // print an identical zero.
        expect(control.BUILTIN + production.BUILTIN).toBeGreaterThan(500);
        expect(production.INERT.length).toBeGreaterThan(0);
    });

    it('no hook is handed a value that is new on every render', () => {
        const fix =
            'hoist it to a module constant, memoise it, or hold it in a ref inside the hook';
        expect({
            loops: production.LOOP,
            churn: production.CHURN,
            defeatedMemos: production.MEMO,
            fix,
        }).toEqual({ loops: [], churn: [], defeatedMemos: [], fix });
    });
});
