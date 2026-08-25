/**
 * Remembering what a prompt used to cost.
 *
 * WHY THIS EXISTS. "Is this getting better?" is the question the whole feature
 * answers, and until step 07 it could only be answered inside one sitting —
 * close the window and "$0.14, down from $0.21" was gone.
 *
 * Two rules carry the weight, and both are easy to get subtly wrong:
 *
 *   - The prompt is the key, VERBATIM. Normalising it would silently merge two
 *     prompts differing in exactly the way the producer was testing.
 *   - The trace is never stored. It is the diagnostic read once, it is large,
 *     and keeping it would recreate the unbounded-log concern the in-memory
 *     recorder was capped to avoid.
 */

import {
    RUNS_PER_PROMPT,
    TRACKED_PROMPTS,
    appendRun,
    findDelta,
    toStoredRun,
} from '@/features/ai/evaluation/evaluationHistory';
import type { EvaluationRun } from '@/types/base';

function run(prompt: string, costUSD: number, at = '2026-08-25T00:00:00.000Z'): EvaluationRun {
    return { prompt, costUSD, steps: 5, wastedSteps: 1, durationMs: 1000, at };
}

describe('finding what a prompt cost last time', () => {
    it('returns the most recent run of the SAME prompt', () => {
        const history = [
            run('deploy the mesh', 0.3),
            run('something else', 0.9),
            run('deploy the mesh', 0.21),
        ];

        expect(findDelta(history, 'deploy the mesh')?.previous.costUSD).toBe(0.21);
    });

    it('matches the prompt VERBATIM', () => {
        // Two prompts differing by the thing being tested must not merge. A
        // trimmed or lowercased key would report the wrong past.
        const history = [run('Deploy the mesh for bodea', 0.21)];

        expect(findDelta(history, 'deploy the mesh for bodea')).toBeUndefined();
        expect(findDelta(history, 'Deploy the mesh for bodea ')).toBeUndefined();
        expect(findDelta(history, 'Deploy the mesh for bodea')).toBeDefined();
    });

    it('reports UNDEFINED for a prompt with no past, not a zero delta', () => {
        // "No change" and "never run before" are different facts, and a zero
        // would read as the first.
        expect(findDelta([], 'anything')).toBeUndefined();
        expect(findDelta(undefined, 'anything')).toBeUndefined();
    });

    it('counts how many earlier runs there were', () => {
        const history = [run('p', 0.3), run('p', 0.25), run('p', 0.21)];

        expect(findDelta(history, 'p')?.priorRuns).toBe(3);
    });
});

describe('keeping the list bounded — PER PROMPT', () => {
    it('appends, oldest first', () => {
        const out = appendRun([run('a', 1)], run('b', 2));

        expect(out.map((r) => r.prompt)).toEqual(['a', 'b']);
    });

    it('does NOT let other prompts evict a trend', () => {
        // The bug in the first version. A single global cap evicted by recency
        // across ALL prompts, so alternating between five prompts left four runs
        // of each — and the trend a producer was building disappeared because of
        // runs that had nothing to do with it.
        let history: ReturnType<typeof appendRun> = [];
        for (let i = 0; i < 30; i++) {
            history = appendRun(history, run(['A', 'B', 'C', 'D', 'E'][i % 5], i));
        }

        // Six runs of A happened; all six survive, because B–E cannot evict them.
        expect(history.filter((r) => r.prompt === 'A')).toHaveLength(6);
    });

    it('caps the runs of ONE prompt, keeping the newest', () => {
        let history: ReturnType<typeof appendRun> = [];
        for (let i = 0; i < RUNS_PER_PROMPT + 5; i++) {
            history = appendRun(history, run('p', i));
        }

        const mine = history.filter((r) => r.prompt === 'p');
        expect(mine).toHaveLength(RUNS_PER_PROMPT);
        // The newest survive: costs 5..14 for a limit of 10.
        expect(mine[0].costUSD).toBe(5);
        expect(mine[mine.length - 1].costUSD).toBe(RUNS_PER_PROMPT + 4);
    });

    it('drops the LEAST RECENTLY RUN prompt whole, not a stump', () => {
        // A single remaining run is not comparable against anything, so keeping
        // one would cost bytes and buy nothing.
        let history: ReturnType<typeof appendRun> = [];
        for (let i = 0; i < TRACKED_PROMPTS; i++) history = appendRun(history, run(`p${i}`, i));
        // Re-run the oldest so it is no longer the least recent.
        history = appendRun(history, run('p0', 99));

        history = appendRun(history, run('brand-new', 1));

        const prompts = new Set(history.map((r) => r.prompt));
        expect(prompts.size).toBe(TRACKED_PROMPTS);
        expect(prompts.has('brand-new')).toBe(true);
        // p1 was the least recently run, so it went; p0 was refreshed and stayed.
        expect(prompts.has('p1')).toBe(false);
        expect(prompts.has('p0')).toBe(true);
    });

    it('handles a project with no history yet', () => {
        expect(appendRun(undefined, run('first', 1))).toHaveLength(1);
    });

    it('stays small enough for a manifest', () => {
        // Worst case, so the cap can be judged rather than assumed.
        let history: ReturnType<typeof appendRun> = [];
        const prompt = 'x'.repeat(200);
        for (let p = 0; p < TRACKED_PROMPTS; p++) {
            for (let i = 0; i < RUNS_PER_PROMPT + 3; i++) {
                history = appendRun(history, run(`${prompt}${p}`, i));
            }
        }

        expect(history).toHaveLength(TRACKED_PROMPTS * RUNS_PER_PROMPT);
        expect(JSON.stringify(history).length).toBeLessThan(120_000);
    });
});

describe('what is stored', () => {
    it('keeps five numbers and the prompt — never the trace', () => {
        // The narrow signature is the guard: a caller cannot pass the whole
        // evaluation result through and quietly persist its trace.
        const stored = toStoredRun(
            { prompt: 'p', costUSD: 0.21, steps: 8, wastedSteps: 3, durationMs: 41_000 },
            '2026-08-25T12:00:00.000Z',
        );

        expect(Object.keys(stored).sort()).toEqual([
            'at',
            'costUSD',
            'durationMs',
            'prompt',
            'steps',
            'wastedSteps',
        ]);
        expect(JSON.stringify(stored)).not.toMatch(/trace|argumentKeys|fingerprint/i);
    });

    it('takes the clock from the caller', () => {
        // Injected so a test can assert ordering without freezing time, and so
        // the module has no ambient dependency.
        expect(
            toStoredRun(
                { prompt: 'p', costUSD: 0, steps: 0, wastedSteps: 0, durationMs: 0 },
                '2026-01-01T00:00:00.000Z',
            ).at,
        ).toBe('2026-01-01T00:00:00.000Z');
    });
});

describe('surviving a reload', () => {
    it('computes the delta from a list that came off disk', () => {
        // The whole point of the step, expressed the way it actually happens:
        // nothing in memory, just a manifest that was read back.
        const fromDisk: EvaluationRun[] = JSON.parse(
            JSON.stringify([run('deploy the mesh', 0.21, '2026-08-24T10:00:00.000Z')]),
        );

        const delta = findDelta(fromDisk, 'deploy the mesh');

        expect(delta?.previous.costUSD).toBe(0.21);
        expect(delta?.previous.at).toBe('2026-08-24T10:00:00.000Z');
    });
});
