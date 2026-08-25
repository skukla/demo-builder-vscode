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
import { setEvaluationServerFactory } from '@/features/ai/evaluation/evaluationServer';
import { ToolTraceRecorder } from '@/features/ai/server/toolTraceRecorder';
import type { Logger } from '@/types/logger';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const logger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
} as unknown as Logger;

/** A CLI stand-in that records what it was asked to run. */
function fakeRunner(stdout = '{}', onRun?: () => void) {
    const commands: string[] = [];
    const options: ({ shell?: boolean } | undefined)[] = [];
    return {
        commands,
        options,
        execute: async (command: string, opts?: { shell?: boolean }) => {
            commands.push(command);
            options.push(opts);
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

/** Records the sockets the evaluation server was asked to bind. */
const boundSockets: string[] = [];
const disposed = jest.fn();

describe('evaluating a prompt', () => {
    let trace: ToolTraceRecorder;
    let projectPath: string;

    /** A project with a real `.mcp.json`, including a third-party server. */
    function makeProject(config?: unknown): string {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-proj-'));
        fs.writeFileSync(
            path.join(dir, '.mcp.json'),
            JSON.stringify(
                config ?? {
                    mcpServers: {
                        'demo-builder': {
                            command: 'node',
                            args: ['/dist/mcp-proxy.js'],
                            env: { DEMO_BUILDER_MCP_SOCKET: '/the/ordinary/socket.sock' },
                        },
                        playwright: { command: 'npx', args: ['@playwright/mcp'] },
                    },
                },
            ),
        );
        return dir;
    }

    beforeEach(() => {
        resetEvaluationSession();
        trace = new ToolTraceRecorder();
        jest.clearAllMocks();
        boundSockets.length = 0;
        disposed.mockReset();
        projectPath = makeProject();
        // A stand-in for the real dry-run listener. The property under test is
        // that ONE is started and the spawn is pointed at it — not what it does,
        // which `agentDryRun.test.ts` already covers by execution.
        setEvaluationServerFactory((socketPath: string) => {
            boundSockets.push(socketPath);
            return { start: async () => {}, dispose: disposed } as never;
        });
    });

    it('reports cost in dollars, from the run\'s own output', async () => {
        const runner = fakeRunner(RUN_JSON);

        const result = (await evaluatePrompt('set up bodea', {
            runner,
            trace,
            logger,
            projectPath,
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
            projectPath,
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
            projectPath,
        })) as EvaluationResult;

        expect(result.trace).toEqual([]);
    });

    it('points the run at a DEDICATED dry-run server, not the ordinary one', async () => {
        // The whole of step 05. Before this, an evaluation forced the dry run
        // window-wide, so the producer's other chats silently stopped changing
        // anything — and if the spawned agent landed on a DIFFERENT window's
        // server, its writes executed for real while the workbench said nothing
        // was changed.
        const runner = fakeRunner(RUN_JSON);

        await evaluatePrompt('anything', { runner, trace, logger, projectPath, runId: 'r1' });

        expect(boundSockets).toHaveLength(1);
        const command = runner.commands[0];
        expect(command).toContain('--mcp-config');
        // strict, so the project's own .mcp.json cannot resolve demo-builder
        // back to the ordinary socket.
        expect(command).toContain('--strict-mcp-config');
        expect(command).toContain(boundSockets[0]);
        expect(command).not.toContain('/the/ordinary/socket.sock');
    });

    it('KEEPS the project\'s other MCP servers', async () => {
        // The trap --strict-mcp-config introduces: it ignores every other MCP
        // configuration. An evaluation without Playwright measures a path the
        // producer would never take, which contradicts the reason reads execute
        // during a dry run at all.
        const runner = fakeRunner(RUN_JSON);

        await evaluatePrompt('anything', { runner, trace, logger, projectPath });

        expect(runner.commands[0]).toContain('playwright');
    });

    it('disposes the dry-run server even when the run THROWS', async () => {
        // A leftover listener is discoverable by the next ordinary session,
        // which would silently put it in dry run.
        const runner = {
            execute: async () => {
                throw new Error('claude exploded');
            },
        };

        await expect(
            evaluatePrompt('anything', { runner, trace, logger, projectPath }),
        ).rejects.toThrow();

        expect(disposed).toHaveBeenCalledTimes(1);
    });

    it('REFUSES rather than running against the ordinary server', async () => {
        // No .mcp.json means no config to point at the dry-run socket. Running
        // anyway would reach the real server and could change things, which is
        // the failure this design exists to make impossible.
        const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-bare-'));
        const runner = fakeRunner(RUN_JSON);

        await expect(
            evaluatePrompt('anything', { runner, trace, logger, projectPath: bare }),
        ).rejects.toThrow(/no \.mcp\.json/i);

        expect(runner.commands).toHaveLength(0);
    });

    it('refuses without a project at all', async () => {
        const result = await evaluatePrompt('anything', {
            runner: fakeRunner(RUN_JSON),
            trace,
            logger,
        });

        expect(result).toEqual({ refused: expect.stringContaining('Open a project') });
    });

    it('marks the session while running, for the recursion guard only', async () => {
        // Not by reading a flag. The spawned agent reaches the same MCP server
        // this window serves, so the only guarantee that holds is the server
        // refusing writes while the run is in flight.
        let duringRun: boolean | undefined;
        const runner = fakeRunner(RUN_JSON, () => {
            duringRun = isEvaluating();
        });

        expect(isEvaluating()).toBe(false);
        await evaluatePrompt('anything', { runner, trace, logger, projectPath });

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

        await expect(evaluatePrompt('anything', { runner, trace, logger, projectPath })).rejects.toThrow();

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
                    projectPath,
                });
                return runner.execute(command);
            },
        };

        await evaluatePrompt('the outer prompt', {
            runner: reentrant,
            trace,
            logger,
            projectPath,
        });

        expect(inner).toEqual({ refused: expect.stringContaining('already running') });
        // And it never spawned: one command, the outer one.
        expect(runner.commands).toHaveLength(1);
    });

    it('runs through a SHELL, or nothing starts at all', async () => {
        // CommandExecutor defaults shell to FALSE and hands the whole string to
        // execa as the executable NAME, so a command with arguments fails
        // instantly — and with reject:false it does not even throw. The first
        // real evaluation returned in TWO MILLISECONDS and rendered as
        // "Nothing was changed. 0 steps, $0.00, 0s". Eleven other callers in
        // this repo pass shell:true; this one did not.
        const runner = fakeRunner(RUN_JSON);

        await evaluatePrompt('anything', { runner, trace, logger, projectPath });

        expect(runner.options[0]?.shell).toBe(true);
    });

    it('also tells the spawned run the tool is off limits', async () => {
        // Belt and braces beside the guard above. Asserted because it is cheap,
        // NOT because a string is evidence — the previous test is the evidence.
        const runner = fakeRunner(RUN_JSON);

        await evaluatePrompt('anything', { runner, trace, logger, projectPath });

        expect(runner.commands[0]).toContain('--disallowedTools');
        expect(runner.commands[0]).toContain(DISALLOWED_IN_EVALUATION);
    });

    it('quotes the prompt so it cannot escape into the shell', async () => {
        // The prompt is the USER's text and can contain anything.
        const runner = fakeRunner(RUN_JSON);

        await evaluatePrompt("it's fine; rm -rf /", { runner, trace, logger, projectPath });

        expect(runner.commands[0]).not.toMatch(/;\s*rm -rf \/(?!')/);
        expect(runner.commands[0]).toContain(`'\\''`);
    });

    it('refuses an empty prompt as DATA, not an error', async () => {
        const result = await evaluatePrompt('   ', {
            runner: fakeRunner(RUN_JSON),
            trace,
            logger,
            projectPath,
        });

        expect(result).toEqual({ refused: expect.stringContaining('nothing to evaluate') });
    });

    it('FAILS LOUDLY when the run output cannot be read', async () => {
        // The first version caught the parse error and defaulted every field to
        // 0, so a total failure arrived on screen as "Nothing was changed.
        // 0 steps, $0.00, 0s, nothing wasted" — indistinguishable from a working
        // feature reporting an empty result. The owner hit exactly that and
        // could not tell anything had gone wrong.
        await expect(
            evaluatePrompt('anything', {
                runner: fakeRunner('not json at all'),
                trace,
                logger,
                projectPath,
            }),
        ).rejects.toThrow(/did not finish/i);
    });

    it('says what the run actually answered, so the cause is findable', async () => {
        await expect(
            evaluatePrompt('anything', {
                runner: fakeRunner('claude: command not found'),
                trace,
                logger,
                projectPath,
            }),
        ).rejects.toThrow(/command not found/);
    });

    it('says so plainly when there was NO output at all', async () => {
        // Empty output and unreadable output need different advice: one means
        // the process produced nothing, which is a different problem.
        await expect(
            evaluatePrompt('anything', {
                runner: fakeRunner(''),
                trace,
                logger,
                projectPath,
            }),
        ).rejects.toThrow(/no output at all/i);
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
