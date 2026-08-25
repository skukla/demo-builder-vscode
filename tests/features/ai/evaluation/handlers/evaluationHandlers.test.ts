/**
 * `evaluate-prompt` — the workbench's one handler.
 *
 * The contract every webview caller branches on: RETURN failures, never throw.
 * That is not style here, it is load-bearing — a handler that returns
 * `{success:false}` arrives on the webview side looking exactly like a success,
 * because only a THROW sets the response's error field. So the shape of a
 * refusal is what the UI reads to know it failed.
 */

import { evaluationHandlers, setEvaluationRecorder } from '@/features/ai/evaluation/handlers/evaluationHandlers';
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
        }),
    );
    return dir;
}

let projectDir = '';

/** The project object the handler mutates, so a test can read it after. */
let savedProject: { evaluationHistory?: unknown[] } | undefined;
/** Module-scoped: BOTH describe blocks drive it. */
let trace: ToolTraceRecorder;
const saveProject = jest.fn();

function contextWith(
    projectName?: string,
    history?: unknown[],
): HandlerContext {
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
        setEvaluationServerFactory(
            () => ({ start: async () => {}, dispose: () => {} }) as never,
        );
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
            { prompt: 'deploy the mesh' },
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

        const named = await dispatchHandler(evaluationHandlers, contextWith('bodea'), 'evaluate-prompt', {
            prompt: 'deploy',
        });
        const withSuggestions = named.data as { suggestions: { append?: string }[] };

        // Guessing the name would give a one-click button that rewrites the
        // prompt to the WRONG project.
        expect(withSuggestions.suggestions[0].append).toBe(' for bodea');
    });

    it('RETURNS a refusal for an empty prompt rather than throwing', async () => {
        const result = await dispatchHandler(evaluationHandlers, contextWith('bodea'), 'evaluate-prompt', {
            prompt: '   ',
        });

        expect(result).toEqual({ success: false, error: expect.stringContaining('Type a prompt') });
    });

    it('RETURNS a failure when the run throws, rather than propagating it', async () => {
        mockExecute.mockRejectedValue(new Error('claude is not installed'));

        const result = await dispatchHandler(evaluationHandlers, contextWith('bodea'), 'evaluate-prompt', {
            prompt: 'anything',
        });

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
        setEvaluationServerFactory(
            () => ({ start: async () => {}, dispose: () => {} }) as never,
        );
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

    it('reports what the prompt cost LAST time', async () => {
        const ctx = contextWith('bodea', [
            {
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
        });

        const data = res.data as { previousRun?: { costUSD: number }; priorRuns: number };
        expect(data.previousRun?.costUSD).toBe(0.31);
        expect(data.priorRuns).toBe(1);
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
            /argumentKeys|fingerprint|abc123|get_current_project/,
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
