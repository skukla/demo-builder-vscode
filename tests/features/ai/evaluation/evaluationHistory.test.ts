/**
 * Remembering what a piece of WORK used to cost.
 *
 * WHY THIS EXISTS. "Is this getting better?" is the question the whole feature
 * answers, and until step 07 it could only be answered inside one sitting —
 * close the window and "$0.14, down from $0.21" was gone.
 *
 * The shipped version then keyed on the prompt TEXT, which broke it during the
 * loop it was built for: improve a word and the prompt had no past, so the delta
 * appeared ONLY when re-running something unchanged. History is now keyed by
 * THREAD — a declared piece of work that survives editing.
 *
 * Three rules carry the weight, and all three are easy to get subtly wrong:
 *
 *   - A thread is DECLARED, never inferred from similarity.
 *   - Eviction keeps the CHEAPEST run as well as the newest, because the best
 *     version of a prompt is the one a producer comes back for.
 *   - The trace is never stored. It is the diagnostic read once, it is large,
 *     and keeping it would recreate the unbounded-log concern the in-memory
 *     recorder was capped to avoid.
 */

import {
    RUNS_PER_THREAD,
    THREADS_PER_PROJECT,
    anchorThread,
    appendRun,
    findDelta,
    migrateHistory,
    runsInThread,
    threadForPrompt,
    toStoredRun,
} from '@/features/ai/evaluation/evaluationHistory';
import type { EvaluationRun } from '@/types/base';

function run(threadId: string, costUSD: number, extra: Partial<EvaluationRun> = {}): EvaluationRun {
    return {
        threadId,
        prompt: `prompt for ${threadId}`,
        costUSD,
        steps: 5,
        wastedSteps: 1,
        durationMs: 1000,
        at: '2026-08-25T00:00:00.000Z',
        ...extra,
    };
}

describe('finding what this work cost last time', () => {
    it('returns the most recent run of the SAME thread', () => {
        const history = [run('t1', 0.3), run('other', 0.9), run('t1', 0.21)];

        expect(findDelta(history, 't1')?.previous.costUSD).toBe(0.21);
    });

    it('keeps the history when the PROMPT changes but the thread does not', () => {
        // The defect this replacement exists to fix. A producer refines the
        // wording; the comparison must still be against where they started.
        const history = [
            run('t1', 0.3, { prompt: 'deploy the mesh' }),
            run('t1', 0.24, { prompt: 'deploy the mesh for bodea' }),
        ];

        const delta = findDelta(history, 't1');

        expect(delta?.previous.costUSD).toBe(0.24);
        expect(delta?.priorRuns).toBe(2);
    });

    it('reports UNDEFINED for a thread with no past, not a zero delta', () => {
        // "No change" and "never run before" are different facts, and a zero
        // would read as the first.
        expect(findDelta([], 'anything')).toBeUndefined();
        expect(findDelta(undefined, 'anything')).toBeUndefined();
    });

    it('names the CHEAPEST run, which is what going back would mean', () => {
        const history = [run('t1', 0.12), run('t1', 0.4), run('t1', 0.3)];

        expect(findDelta(history, 't1')?.best.costUSD).toBe(0.12);
    });

    it('counts how many earlier runs there were', () => {
        const history = [run('t', 0.3), run('t', 0.25), run('t', 0.21)];

        expect(findDelta(history, 't')?.priorRuns).toBe(3);
    });
});

describe('coming back to a saved prompt', () => {
    it('finds the thread a saved prompt was last run in', () => {
        const history = [run('t1', 0.3, { promptId: 'saved-1' }), run('t2', 0.2)];

        expect(threadForPrompt(history, 'saved-1')).toBe('t1');
    });

    it('finds nothing for a prompt never evaluated here', () => {
        // Normal, not a failure: the thread simply starts on the first run.
        expect(threadForPrompt([run('t1', 0.3)], 'saved-1')).toBeUndefined();
    });

    it('stamps the runs that ALREADY happened when a prompt is saved', () => {
        // Saving happens after the refining. Anchoring only future runs would
        // leave the thread unreachable from the library until it was run again.
        const history = [run('t1', 0.3), run('t1', 0.2), run('t2', 0.9)];

        const anchored = anchorThread(history, 't1', 'saved-1');

        expect(anchored.filter((r) => r.promptId === 'saved-1')).toHaveLength(2);
        expect(threadForPrompt(anchored, 'saved-1')).toBe('t1');
        expect(anchored[2].promptId).toBeUndefined();
    });

    it('returns every run of a thread, oldest first', () => {
        const history = [run('t1', 0.3), run('t2', 1), run('t1', 0.2)];

        expect(runsInThread(history, 't1').map((r) => r.costUSD)).toEqual([0.3, 0.2]);
    });
});

describe('keeping the list bounded — PER THREAD', () => {
    it('appends, oldest first', () => {
        const out = appendRun([run('a', 1)], run('b', 2));

        expect(out.map((r) => r.threadId)).toEqual(['a', 'b']);
    });

    it('does NOT let other threads evict a trend', () => {
        // The bug in the first version. A single global cap evicted by recency
        // across ALL prompts, so alternating between five left four runs of
        // each — and the trend a producer was building disappeared because of
        // runs that had nothing to do with it.
        let history: ReturnType<typeof appendRun> = [];
        for (let i = 0; i < 30; i++) {
            history = appendRun(history, run(['A', 'B', 'C', 'D', 'E'][i % 5], i));
        }

        expect(history.filter((r) => r.threadId === 'A')).toHaveLength(6);
    });

    it('caps one thread, keeping the newest', () => {
        let history: ReturnType<typeof appendRun> = [];
        // Costs climb, so the cheapest run is also the oldest — isolated in the
        // next test. Here the newest are all that should survive.
        for (let i = 0; i < RUNS_PER_THREAD + 5; i++) {
            history = appendRun(history, run('t', 100 - i));
        }

        const mine = history.filter((r) => r.threadId === 't');
        expect(mine).toHaveLength(RUNS_PER_THREAD);
        expect(mine[mine.length - 1].costUSD).toBe(100 - (RUNS_PER_THREAD + 4));
    });

    it('keeps the BEST run even when it is the oldest', () => {
        // The change from pure recency, and the whole reason to look at history:
        // the cheapest version of a prompt must still be there to go back to.
        let history: ReturnType<typeof appendRun> = [];
        history = appendRun(history, run('t', 0.01, { prompt: 'the good one' }));
        for (let i = 0; i < RUNS_PER_THREAD + 5; i++) {
            history = appendRun(history, run('t', 1 + i));
        }

        const mine = history.filter((r) => r.threadId === 't');
        expect(mine).toHaveLength(RUNS_PER_THREAD);
        expect(mine.find((r) => r.prompt === 'the good one')).toBeDefined();
    });

    it('drops the LEAST RECENTLY RUN thread whole, not a stump', () => {
        // A single remaining run is not comparable against anything, so keeping
        // one would cost bytes and buy nothing.
        let history: ReturnType<typeof appendRun> = [];
        for (let i = 0; i < THREADS_PER_PROJECT; i++) history = appendRun(history, run(`t${i}`, i));
        // Re-run the oldest so it is no longer the least recent.
        history = appendRun(history, run('t0', 99));

        history = appendRun(history, run('brand-new', 1));

        const threads = new Set(history.map((r) => r.threadId));
        expect(threads.size).toBe(THREADS_PER_PROJECT);
        expect(threads.has('brand-new')).toBe(true);
        expect(threads.has('t1')).toBe(false);
        expect(threads.has('t0')).toBe(true);
    });

    it('does NOT favour a thread just because its prompt was saved', () => {
        // A preference for saved prompts was built and removed on 2026-08-25: it
        // needed both prompt stores read and passed in, and could only change
        // WHICH thread fell off past twenty-five — invisible to anyone using it.
        // Recency alone decides, and this pins that.
        let history: ReturnType<typeof appendRun> = [];
        history = appendRun(history, run('saved-and-old', 1, { promptId: 'p1' }));
        for (let i = 0; i < THREADS_PER_PROJECT; i++) history = appendRun(history, run(`t${i}`, i));

        const threads = new Set(history.map((r) => r.threadId));
        expect(threads.has('saved-and-old')).toBe(false);
        expect(threads.size).toBe(THREADS_PER_PROJECT);
    });

    it('handles a project with no history yet', () => {
        expect(appendRun(undefined, run('first', 1))).toHaveLength(1);
    });

    it('stays small enough for a manifest', () => {
        // Worst case, so the cap can be judged rather than assumed.
        let history: ReturnType<typeof appendRun> = [];
        const prompt = 'x'.repeat(200);
        for (let t = 0; t < THREADS_PER_PROJECT; t++) {
            for (let i = 0; i < RUNS_PER_THREAD + 3; i++) {
                history = appendRun(history, run(`t${t}`, i, { prompt }));
            }
        }

        expect(history).toHaveLength(THREADS_PER_PROJECT * RUNS_PER_THREAD);
        expect(JSON.stringify(history).length).toBeLessThan(120_000);
    });
});

describe('history written before threads existed', () => {
    it('gives each distinct prompt text a thread of its own', () => {
        // Lossless, and it preserves exactly the comparisons the old shape could
        // make — no decision to get wrong.
        const old = [
            { prompt: 'a', costUSD: 1, steps: 1, wastedSteps: 0, durationMs: 1, at: 'x' },
            { prompt: 'b', costUSD: 2, steps: 1, wastedSteps: 0, durationMs: 1, at: 'y' },
            { prompt: 'a', costUSD: 3, steps: 1, wastedSteps: 0, durationMs: 1, at: 'z' },
        ] as unknown as EvaluationRun[];

        const migrated = migrateHistory(old);

        expect(migrated[0].threadId).toBe(migrated[2].threadId);
        expect(migrated[1].threadId).not.toBe(migrated[0].threadId);
        expect(findDelta(migrated, migrated[0].threadId)?.priorRuns).toBe(2);
    });

    it('leaves rows that already carry a thread alone', () => {
        // Safe to call on every load, which is where it is called.
        const already = [run('t1', 1)];

        expect(migrateHistory(already)[0].threadId).toBe('t1');
    });

    it('handles a manifest with no history', () => {
        expect(migrateHistory(undefined)).toEqual([]);
    });
});

describe('what is stored', () => {
    it('keeps the thread, the prompt and five numbers — never the trace', () => {
        // The narrow signature is the guard: a caller cannot pass the whole
        // evaluation result through and quietly persist its trace.
        const stored = toStoredRun(
            {
                threadId: 't1',
                promptId: 'saved-1',
                prompt: 'p',
                costUSD: 0.21,
                steps: 8,
                wastedSteps: 3,
                durationMs: 41_000,
            },
            '2026-08-25T12:00:00.000Z'
        );

        expect(Object.keys(stored).sort()).toEqual([
            'at',
            'costUSD',
            'durationMs',
            'prompt',
            'promptId',
            'steps',
            'threadId',
            'wastedSteps',
        ]);
        expect(JSON.stringify(stored)).not.toMatch(/trace|argumentKeys|fingerprint/i);
    });

    it('takes the clock from the caller', () => {
        // Injected so a test can assert ordering without freezing time, and so
        // the module has no ambient dependency.
        expect(
            toStoredRun(
                { threadId: 't', prompt: 'p', costUSD: 0, steps: 0, wastedSteps: 0, durationMs: 0 },
                '2026-01-01T00:00:00.000Z'
            ).at
        ).toBe('2026-01-01T00:00:00.000Z');
    });
});

describe('surviving a reload', () => {
    it('computes the delta from a list that came off disk', () => {
        // The whole point of the step, expressed the way it actually happens:
        // nothing in memory, just a manifest that was read back.
        const fromDisk: EvaluationRun[] = JSON.parse(
            JSON.stringify([run('t1', 0.21, { at: '2026-08-24T10:00:00.000Z' })])
        );

        const delta = findDelta(fromDisk, 't1');

        expect(delta?.previous.costUSD).toBe(0.21);
        expect(delta?.previous.at).toBe('2026-08-24T10:00:00.000Z');
    });
});
