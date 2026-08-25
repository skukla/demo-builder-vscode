/**
 * The workbench's handlers — running a prompt, and resuming a piece of work.
 *
 * The contract every webview caller branches on: RETURN failures, never throw.
 * That is not style here, it is load-bearing — a handler that returns
 * `{success:false}` arrives on the webview side looking exactly like a success,
 * because only a THROW sets the response's error field. So the shape of a
 * refusal is what the UI reads to know it failed.
 *
 * The THREAD assertions here are the ones that matter most: history keyed on
 * prompt TEXT meant improving a prompt destroyed its past, so the delta fired
 * only when re-running something unchanged.
 */

import { evaluationHandlers } from '@/features/ai/evaluation/handlers/evaluationHandlers';
import { setEvaluationRecorder } from '@/features/ai/evaluation/handlers/traceRecorderAccess';
import { ToolTraceRecorder } from '@/features/ai/server/toolTraceRecorder';
import { dispatchHandler } from '@/core/handlers';
import { setEvaluationServerFactory } from '@/features/ai/evaluation/evaluationServer';
import type { HandlerContext } from '@/types/handlers';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockExecute = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: () => ({ execute: mockExecute }) },
}));

/** A project with a real `.mcp.json` — an evaluation is launched with one. */
function makeProject(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-handler-'));
    fs.writeFileSync(
        path.join(dir, '.mcp.json'),
        JSON.stringify({
            mcpServers: {
                'demo-builder': { command: 'node', args: ['/p.js'], env: {} },
            },
        })
    );
    return dir;
}

let projectDir = '';

/** The project object the handler mutates, so a test can read it after. */
let savedProject: { evaluationHistory?: unknown[] } | undefined;
/** Module-scoped: BOTH describe blocks drive it. */
let trace: ToolTraceRecorder;
const saveProject = jest.fn();

function contextWith(projectName?: string, history?: unknown[]): HandlerContext {
    savedProject = projectName
        ? ({ name: projectName, path: projectDir, evaluationHistory: history } as never)
        : undefined;
    return {
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
        stateManager: {
            getCurrentProject: async () => savedProject,
            saveProject,
        },
    } as unknown as HandlerContext;
}

const RUN_JSON = JSON.stringify({ total_cost_usd: 0.21, num_turns: 5, duration_ms: 38_000 });

describe('evaluate-prompt', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // mockReset, not clearAllMocks: an implementation set in one test
        // survives into every later one, and the failure belongs to a different
        // test's setup.
        mockExecute.mockReset();
        mockExecute.mockResolvedValue({ stdout: RUN_JSON });
        trace = new ToolTraceRecorder();
        setEvaluationRecorder(trace);
        projectDir = makeProject();
        saveProject.mockReset();
        saveProject.mockResolvedValue(undefined);
        setEvaluationServerFactory(() => ({ start: async () => {}, dispose: () => {} }) as never);
    });

    it('returns the verdict, the trace and the suggestions', async () => {
        mockExecute.mockImplementation(async () => {
            trace.record({
                tool: 'get_current_project',
                readOnly: true,
                argumentKeys: [],
                argumentFingerprint: 'none',
                resultBytes: 20,
                durationMs: 2,
                outcome: 'ok',
            });
            trace.record({
                tool: 'get_current_project',
                readOnly: true,
                argumentKeys: [],
                argumentFingerprint: 'none',
                resultBytes: 20,
                durationMs: 2,
                outcome: 'ok',
            });
            return { stdout: RUN_JSON };
        });

        const result = await dispatchHandler(
            evaluationHandlers,
            contextWith('bodea'),
            'evaluate-prompt',
            { prompt: 'deploy the mesh' }
        );

        expect(result.success).toBe(true);
        const data = result.data as { costUSD: number; trace: unknown[]; suggestions: unknown[] };
        expect(data.costUSD).toBe(0.21);
        expect(data.trace).toHaveLength(2);
        expect(data.suggestions.length).toBeGreaterThan(0);
    });

    it('offers a one-click fix ONLY when the project name is known', async () => {
        mockExecute.mockImplementation(async () => {
            for (let i = 0; i < 2; i++) {
                trace.record({
                    tool: 'get_current_project',
                    readOnly: true,
                    argumentKeys: [],
                    argumentFingerprint: 'none',
                    resultBytes: 20,
                    durationMs: 2,
                    outcome: 'ok',
                });
            }
            return { stdout: RUN_JSON };
        });

        const named = await dispatchHandler(
            evaluationHandlers,
            contextWith('bodea'),
            'evaluate-prompt',
            {
                prompt: 'deploy',
            }
        );
        const withSuggestions = named.data as { suggestions: { append?: string }[] };

        // Guessing the name would give a one-click button that rewrites the
        // prompt to the WRONG project.
        expect(withSuggestions.suggestions[0].append).toBe(' for bodea');
    });

    it('RETURNS a refusal for an empty prompt rather than throwing', async () => {
        const result = await dispatchHandler(
            evaluationHandlers,
            contextWith('bodea'),
            'evaluate-prompt',
            {
                prompt: '   ',
            }
        );

        expect(result).toEqual({ success: false, error: expect.stringContaining('Type a prompt') });
    });

    it('RETURNS a failure when the run throws, rather than propagating it', async () => {
        mockExecute.mockRejectedValue(new Error('claude is not installed'));

        const result = await dispatchHandler(
            evaluationHandlers,
            contextWith('bodea'),
            'evaluate-prompt',
            {
                prompt: 'anything',
            }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('claude is not installed');
    });
});

describe('history', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExecute.mockReset();
        mockExecute.mockResolvedValue({ stdout: RUN_JSON });
        trace = new ToolTraceRecorder();
        setEvaluationRecorder(trace);
        projectDir = makeProject();
        saveProject.mockReset();
        saveProject.mockResolvedValue(undefined);
        setEvaluationServerFactory(() => ({ start: async () => {}, dispose: () => {} }) as never);
    });

    it('stores the run against the project', async () => {
        const ctx = contextWith('bodea');

        await dispatchHandler(evaluationHandlers, ctx, 'evaluate-prompt', {
            prompt: 'deploy the mesh',
        });

        expect(saveProject).toHaveBeenCalledTimes(1);
        const stored = savedProject?.evaluationHistory as { prompt: string; costUSD: number }[];
        expect(stored).toHaveLength(1);
        expect(stored[0].prompt).toBe('deploy the mesh');
        expect(stored[0].costUSD).toBe(0.21);
    });

    it('reports what this work cost LAST time', async () => {
        const ctx = contextWith('bodea', [
            {
                threadId: 't1',
                prompt: 'deploy the mesh',
                costUSD: 0.31,
                steps: 9,
                wastedSteps: 4,
                durationMs: 50_000,
                at: '2026-08-24T10:00:00.000Z',
            },
        ]);

        const res = await dispatchHandler(evaluationHandlers, ctx, 'evaluate-prompt', {
            prompt: 'deploy the mesh',
            threadId: 't1',
        });

        const data = res.data as { previousRun?: { costUSD: number }; priorRuns: number };
        expect(data.previousRun?.costUSD).toBe(0.31);
        expect(data.priorRuns).toBe(1);
    });

    it('keeps the comparison when the WORDING changes', async () => {
        // The defect this replaced: keyed on text, editing a prompt lost its
        // history, so "down from $0.31" appeared only when nothing had changed.
        const ctx = contextWith('bodea', [
            {
                threadId: 't1',
                prompt: 'deploy the mesh',
                costUSD: 0.31,
                steps: 9,
                wastedSteps: 4,
                durationMs: 50_000,
                at: '2026-08-24T10:00:00.000Z',
            },
        ]);

        const res = await dispatchHandler(evaluationHandlers, ctx, 'evaluate-prompt', {
            prompt: 'deploy the mesh for bodea',
            threadId: 't1',
        });

        const data = res.data as { previousRun?: { costUSD: number }; threadId: string };
        expect(data.previousRun?.costUSD).toBe(0.31);
        expect(data.threadId).toBe('t1');
    });

    it('mints a thread when the workbench has none yet, and hands it back', async () => {
        const ctx = contextWith('bodea');

        const res = await dispatchHandler(evaluationHandlers, ctx, 'evaluate-prompt', {
            prompt: 'a first run',
        });

        const data = res.data as { threadId: string };
        expect(data.threadId).toMatch(/^thread-/);
        const stored = savedProject?.evaluationHistory as { threadId: string }[];
        expect(stored[0].threadId).toBe(data.threadId);
    });

    it('upgrades history written before threads existed', async () => {
        // Each distinct text becomes its own thread on the first write, so a
        // manifest does not end up carrying two shapes.
        const ctx = contextWith('bodea', [
            {
                prompt: 'an old row',
                costUSD: 0.5,
                steps: 3,
                wastedSteps: 0,
                durationMs: 1000,
                at: '2026-08-01T00:00:00.000Z',
            },
        ]);

        await dispatchHandler(evaluationHandlers, ctx, 'evaluate-prompt', { prompt: 'new' });

        const stored = savedProject?.evaluationHistory as { threadId: string }[];
        expect(stored).toHaveLength(2);
        expect(stored.every((r) => typeof r.threadId === 'string' && r.threadId)).toBe(true);
    });

    it('records the saved prompt a thread came from', async () => {
        const ctx = contextWith('bodea');

        await dispatchHandler(evaluationHandlers, ctx, 'evaluate-prompt', {
            prompt: 'p',
            threadId: 't1',
            promptId: 'saved-1',
        });

        const stored = savedProject?.evaluationHistory as { promptId?: string }[];
        expect(stored[0].promptId).toBe('saved-1');
    });

    it('compares against the past BEFORE appending, not after', async () => {
        // Append first and the run finds ITSELF, so every delta reads as zero.
        const ctx = contextWith('bodea');

        const res = await dispatchHandler(evaluationHandlers, ctx, 'evaluate-prompt', {
            prompt: 'a brand new prompt',
        });

        const data = res.data as { previousRun?: unknown; priorRuns: number };
        expect(data.previousRun).toBeUndefined();
        expect(data.priorRuns).toBe(0);
    });

    it('never stores the trace', async () => {
        mockExecute.mockImplementation(async () => {
            trace.record({
                tool: 'get_current_project',
                readOnly: true,
                argumentKeys: ['secretish'],
                argumentFingerprint: 'abc123',
                resultBytes: 10,
                durationMs: 1,
                outcome: 'ok',
            });
            return { stdout: RUN_JSON };
        });
        const ctx = contextWith('bodea');

        await dispatchHandler(evaluationHandlers, ctx, 'evaluate-prompt', { prompt: 'p' });

        expect(JSON.stringify(savedProject?.evaluationHistory)).not.toMatch(
            /argumentKeys|fingerprint|abc123|get_current_project/
        );
    });

    it('still returns the result when the save FAILS', async () => {
        // A producer must not lose a real evaluation to a bookkeeping problem.
        saveProject.mockRejectedValue(new Error('disk full'));
        const ctx = contextWith('bodea');

        const res = await dispatchHandler(evaluationHandlers, ctx, 'evaluate-prompt', {
            prompt: 'p',
        });

        expect(res.success).toBe(true);
        expect((res.data as { costUSD: number }).costUSD).toBe(0.21);
    });
});

describe('resume-evaluation-thread', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        saveProject.mockReset();
        saveProject.mockResolvedValue(undefined);
        projectDir = makeProject();
    });

    it('finds the thread a saved prompt was last run in', async () => {
        const ctx = contextWith('bodea', [
            {
                threadId: 't1',
                promptId: 'saved-1',
                prompt: 'deploy the mesh',
                costUSD: 0.31,
                steps: 9,
                wastedSteps: 4,
                durationMs: 50_000,
                at: '2026-08-24T10:00:00.000Z',
            },
        ]);

        const res = await dispatchHandler(evaluationHandlers, ctx, 'resume-evaluation-thread', {
            promptId: 'saved-1',
        });

        const data = res.data as { threadId?: string; priorRuns: number };
        expect(data.threadId).toBe('t1');
        expect(data.priorRuns).toBe(1);
    });

    it('answers NOTHING FOUND, not an error, for a prompt never run here', async () => {
        // A saved prompt with no history is a normal state — it starts its
        // thread on the next run.
        const ctx = contextWith('bodea', []);

        const res = await dispatchHandler(evaluationHandlers, ctx, 'resume-evaluation-thread', {
            promptId: 'never-run',
        });

        expect(res.success).toBe(true);
        expect((res.data as { threadId?: string }).threadId).toBeUndefined();
        expect((res.data as { priorRuns: number }).priorRuns).toBe(0);
    });
});

describe('anchor-evaluation-thread', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        saveProject.mockReset();
        saveProject.mockResolvedValue(undefined);
        projectDir = makeProject();
    });

    it('stamps the runs that already happened, so saving makes them findable', async () => {
        // Saving comes AFTER the refining. Anchoring only future runs would
        // leave the thread unreachable from the library until it was run again.
        const ctx = contextWith('bodea', [
            {
                threadId: 't1',
                prompt: 'v1',
                costUSD: 0.4,
                steps: 4,
                wastedSteps: 0,
                durationMs: 1000,
                at: '2026-08-24T10:00:00.000Z',
            },
        ]);

        const res = await dispatchHandler(evaluationHandlers, ctx, 'anchor-evaluation-thread', {
            threadId: 't1',
            promptId: 'saved-1',
        });

        expect(res.success).toBe(true);
        const stored = savedProject?.evaluationHistory as { promptId?: string }[];
        expect(stored[0].promptId).toBe('saved-1');
        expect(saveProject).toHaveBeenCalledTimes(1);
    });

    it('RETURNS a refusal when either half is missing', async () => {
        const res = await dispatchHandler(
            evaluationHandlers,
            contextWith('bodea'),
            'anchor-evaluation-thread',
            {
                threadId: 't1',
            }
        );

        expect(res.success).toBe(false);
        expect(saveProject).not.toHaveBeenCalled();
    });
});
