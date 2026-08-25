/**
 * Evaluating a prompt: one service, a recursion guard that holds, and a dry run
 * that cannot be switched off from outside.
 *
 * WHY THIS EXISTS. Two failures here are expensive in ways tests usually are
 * not: an evaluation that can evaluate itself BILLS IN A LOOP, and an evaluation
 * whose dry run is not actually forced changes a real project while telling the
 * user nothing happened.
 *
 * So both are tested BY EXECUTION. The plan is explicit about why: the git-sync
 * hook read an env var Claude Code never sets, did nothing on every EDS project
 * ever generated, and shipped green because its tests asserted the command
 * STRING. The spawned run IS launched with `--disallowedTools`, and this suite
 * checks that too — but the guard that actually holds is server-side state, and
 * that is the one driven here.
 */

import {
    evaluatePrompt,
    summariseForAgent,
    DISALLOWED_IN_EVALUATION,
    type EvaluationResult,
} from '@/features/ai/evaluation/promptEvaluationService';
import { isEvaluating, resetEvaluationSession } from '@/features/ai/evaluation/evaluationSession';
import { ToolTraceRecorder } from '@/features/ai/server/toolTraceRecorder';
import type { Logger } from '@/types/logger';

const logger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as unknown as Logger;

/** A CLI stand-in that records what it was asked to run. */
function fakeRunner(stdout = '{}', onRun?: () => void) {
    const commands: string[] = [];
    return {
        commands,
        execute: async (command: string) => {
            commands.push(command);
            onRun?.();
            return { stdout };
        },
    };
}

const RUN_JSON = JSON.stringify({
    total_cost_usd: 0.21,
    num_turns: 5,
    duration_ms: 38_000,
    is_error: false,
});

describe('evaluating a prompt', () => {
    let trace: ToolTraceRecorder;

    beforeEach(() => {
        resetEvaluationSession();
        trace = new ToolTraceRecorder();
        jest.clearAllMocks();
    });

    it('reports cost in dollars, from the run\'s own output', async () => {
        const runner = fakeRunner(RUN_JSON);

        const result = (await evaluatePrompt('set up bodea', {
            runner,
            trace,
            logger,
        })) as EvaluationResult;

        expect(result.costUSD).toBe(0.21);
        expect(result.numTurns).toBe(5);
        expect(result.durationMs).toBe(38_000);
        expect(result.isError).toBe(false);
    });

    it('joins the run with the trace the server recorded WHILE it ran', async () => {
        // The two halves answer different questions: the run's JSON says what it
        // COST, the trace says what it DID. A result carrying only one is half
        // an answer.
        const runner = fakeRunner(RUN_JSON, () => {
            trace.record({
                tool: 'get_current_project',
                readOnly: true,
                argumentKeys: [],
                argumentFingerprint: 'none',
                resultBytes: 40,
                durationMs: 3,
                outcome: 'ok',
            });
            trace.record({
                tool: 'deploy_mesh',
                readOnly: false,
                argumentKeys: [],
                argumentFingerprint: 'none',
                resultBytes: 0,
                durationMs: 1,
                outcome: 'blocked-by-dry-run',
            });
        });

        const result = (await evaluatePrompt('deploy the mesh', {
            runner,
            trace,
            logger,
        })) as EvaluationResult;

        expect(result.trace.map((e) => e.tool)).toEqual(['get_current_project', 'deploy_mesh']);
        expect(result.blocked.map((e) => e.tool)).toEqual(['deploy_mesh']);
    });

    it('starts from an empty trace, so the user\'s own work is not billed to the prompt', async () => {
        trace.record({
            tool: 'list_projects',
            readOnly: true,
            argumentKeys: [],
            argumentFingerprint: 'none',
            resultBytes: 10,
            durationMs: 1,
            outcome: 'ok',
        });

        const result = (await evaluatePrompt('anything', {
            runner: fakeRunner(RUN_JSON),
            trace,
            logger,
        })) as EvaluationResult;

        expect(result.trace).toEqual([]);
    });

    it('forces the dry run for the whole run, by EXECUTION', async () => {
        // Not by reading a flag. The spawned agent reaches the same MCP server
        // this window serves, so the only guarantee that holds is the server
        // refusing writes while the run is in flight.
        let duringRun: boolean | undefined;
        const runner = fakeRunner(RUN_JSON, () => {
            duringRun = isEvaluating();
        });

        expect(isEvaluating()).toBe(false);
        await evaluatePrompt('anything', { runner, trace, logger });

        expect(duringRun).toBe(true);
        expect(isEvaluating()).toBe(false);
    });

    it('releases the dry run even when the run THROWS', async () => {
        // A run that fails must not leave the window stuck in dry run — that
        // would look exactly like the extension having silently broken.
        const runner = {
            execute: async () => {
                throw new Error('claude exploded');
            },
        };

        await expect(evaluatePrompt('anything', { runner, trace, logger })).rejects.toThrow();

        expect(isEvaluating()).toBe(false);
    });

    it('refuses to evaluate while an evaluation is running — the recursion guard', async () => {
        // THE expensive failure. Driven by execution: the inner call happens
        // while the outer one is genuinely in flight.
        //
        // NOTE FOR WHOEVER FALSIFIES THIS. There are TWO independent guards —
        // the `isEvaluating()` check in the service, and `runAsEvaluation`
        // refusing to nest — and removing either ALONE leaves this test green,
        // because the other still refuses. Verified 2026-08-25: it fails only
        // when both are removed. That is defence in depth working as intended,
        // but it means a single-line falsification proves nothing here. Break
        // both, or you will conclude the test is broken when it is not.
        let inner: Awaited<ReturnType<typeof evaluatePrompt>> | undefined;
        const runner = fakeRunner(RUN_JSON);
        const reentrant = {
            execute: async (command: string) => {
                inner = await evaluatePrompt('the inner prompt', {
                    runner,
                    trace,
                    logger,
                });
                return runner.execute(command);
            },
        };

        await evaluatePrompt('the outer prompt', { runner: reentrant, trace, logger });

        expect(inner).toEqual({ refused: expect.stringContaining('already running') });
        // And it never spawned: one command, the outer one.
        expect(runner.commands).toHaveLength(1);
    });

    it('also tells the spawned run the tool is off limits', async () => {
        // Belt and braces beside the guard above. Asserted because it is cheap,
        // NOT because a string is evidence — the previous test is the evidence.
        const runner = fakeRunner(RUN_JSON);

        await evaluatePrompt('anything', { runner, trace, logger });

        expect(runner.commands[0]).toContain('--disallowedTools');
        expect(runner.commands[0]).toContain(DISALLOWED_IN_EVALUATION);
    });

    it('quotes the prompt so it cannot escape into the shell', async () => {
        // The prompt is the USER's text and can contain anything.
        const runner = fakeRunner(RUN_JSON);

        await evaluatePrompt("it's fine; rm -rf /", { runner, trace, logger });

        expect(runner.commands[0]).not.toMatch(/;\s*rm -rf \/(?!')/);
        expect(runner.commands[0]).toContain(`'\\''`);
    });

    it('refuses an empty prompt as DATA, not an error', async () => {
        const result = await evaluatePrompt('   ', {
            runner: fakeRunner(RUN_JSON),
            trace,
            logger,
        });

        expect(result).toEqual({ refused: expect.stringContaining('nothing to evaluate') });
    });

    it('keeps the trace when the run output cannot be parsed', async () => {
        // The trace is the more interesting half. Losing the path because the
        // cost was unreadable would throw away the better answer.
        const result = (await evaluatePrompt('anything', {
            runner: fakeRunner('not json at all'),
            trace,
            logger,
        })) as EvaluationResult;

        expect(result.costUSD).toBe(0);
        expect(result.trace).toEqual([]);
        expect(result.isError).toBe(false);
    });
});

describe('what the agent is handed back', () => {
    it('summarises, and never returns the whole trace', () => {
        // A response-size guard caught the first version returning every entry —
        // the same shape that made list_adobe_projects 111KB.
        const entry = (tool: string, outcome: 'ok' | 'blocked-by-dry-run') => ({
            tool,
            readOnly: false,
            argumentKeys: [],
            argumentFingerprint: 'none',
            resultBytes: 0,
            durationMs: 1,
            outcome,
            at: 0,
        });
        const result: EvaluationResult = {
            prompt: 'p',
            costUSD: 0.21,
            numTurns: 5,
            durationMs: 100,
            isError: false,
            trace: Array.from({ length: 200 }, () => entry('get_project', 'ok')),
            repeats: Array.from({ length: 199 }, () => entry('get_project', 'ok')),
            blocked: [entry('deploy_mesh', 'blocked-by-dry-run')],
        };

        const summary = summariseForAgent(result);

        expect(summary.steps).toBe(200);
        expect(summary.wastedSteps).toBe(199);
        // Deduplicated NAMES, so 199 repeats cost one string, not 199 objects.
        expect(summary.repeatedTools).toEqual(['get_project']);
        expect(summary.blockedTools).toEqual(['deploy_mesh']);
        expect(JSON.stringify(summary).length).toBeLessThan(2_000);
    });
});
