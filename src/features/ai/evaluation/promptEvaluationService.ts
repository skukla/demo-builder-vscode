/**
 * Evaluating a prompt — the one implementation all three doors call.
 *
 * Evaluating a prompt is a capability, not a screen. The agent can ask for it
 * ("evaluate this prompt"), a command can, and the workbench can, and all three
 * land here so the paths cannot drift — the `call-path-audit` rule that a user
 * action has ONE definitive path.
 *
 * ## What a run is
 *
 * A headless `claude -p --output-format json` against the user's own prompt,
 * with the dry run forced on, joined with the trace the MCP server recorded
 * while it ran. Two halves that answer different questions: the run's own JSON
 * says what it COST, and the trace says what it DID.
 *
 * The cost half is measured, not derived — verified 2026-08-24 that the CLI
 * returns `usage`, `modelUsage` (with `costUSD`), `total_cost_usd`, `num_turns`,
 * `duration_ms` and `permission_denials` in one object. There is deliberately no
 * transcript parser here: `scripts/trace/transcript.mjs` already exists offline,
 * and duplicating it inside `src/` is the thing this repo fixes rather than
 * files.
 *
 * ## Dollars, not tokens — REVERSED 2026-08-26, pending step 11
 *
 * The surface is moving to TOKENS. Dollars measure OUR cost; tokens measure the
 * producer's remaining ability to work, and a quota that runs out costs them the
 * afternoon rather than seven cents. A probe also killed the premise: 33,819
 * tokens to answer "pong", of which the prompt was 10 — wording is not the
 * lever, ROUND TRIPS are, because each turn re-reads the whole context. This
 * service already returns everything needed (`usage` carries the cache split);
 * what changes is what the UI leads with. See `step-11-two-tools.md`.
 *
 * The original reasoning, kept because the reversal is about SCARCITY rather
 * than legibility and the legibility point still stands on its own:
 *
 * "$0.21" means something to a demo builder; "47,550 tokens" does not. Tokens
 * ride along for the expanded view, beside the tool names.
 *
 * @module features/ai/evaluation/promptEvaluationService
 */

import type { ToolTraceRecorder, TraceEntry } from '../server/toolTraceRecorder';
import { buildEvaluationMcpConfig } from './evaluationMcpConfig';
import { withEvaluationServer } from './evaluationServer';
import { isEvaluating, runAsEvaluation } from './evaluationSession';
import type { Logger } from '@/types/logger';

/** The MCP tool an evaluation must never reach — see `evaluationSession`. */
export const EVALUATE_PROMPT_TOOL = 'evaluate_prompt';

/** How Claude Code names this server's tools to its own allowlist. */
export const DISALLOWED_IN_EVALUATION = `mcp__demo-builder__${EVALUATE_PROMPT_TOOL}`;

/** What one evaluation answers. */
export interface EvaluationResult {
    /** The prompt, verbatim. Persisted with the result on purpose — see below. */
    prompt: string;
    /** Real dollars for the run, from the CLI's own output. */
    costUSD: number;
    /** Assistant turns the run took. */
    numTurns: number;
    /** Wall clock, from the CLI. */
    durationMs: number;
    /** Did the run itself fail (as opposed to the work being refused)? */
    isError: boolean;
    /**
     * What the agent said at the end — its own answer, in its own words.
     *
     * The CLI returns it as `result` alongside the cost fields (verified
     * 2026-08-25 against `claude -p --output-format json`, which answers a
     * top-level `result` string). Capturing it is what turns the workbench from
     * a log of tool calls into a conversation: the phases say what it DID, this
     * says what it would TELL you.
     *
     * Absent when a run produced no final message. The transcript renders
     * without it rather than showing an empty speaker.
     */
    reply?: string;
    /** Every Demo Builder tool call the run made, in order. */
    trace: TraceEntry[];
    /** The calls that asked something already asked — the waste. */
    repeats: TraceEntry[];
    /** Calls the dry run stopped. Nothing was changed. */
    blocked: TraceEntry[];
}

/**
 * What the AGENT gets back — a summary, never the whole trace.
 *
 * The trace can hold hundreds of entries, and an agent that asked "how did this
 * prompt do?" needs the verdict and the waste, not a transcript. The full trace
 * goes to the workbench, which reads the recorder directly and in-process.
 *
 * This split exists because a response-size guard caught the first version
 * returning every entry — the surface has already been bitten twice by a list
 * with no page size (725 Adobe projects, 111KB; 1,099 datapack rows, 25KB).
 *
 * The run's `reply` is left out for the same reason: it is unbounded prose, and
 * an agent that asked how a prompt performed wants the numbers. The workbench
 * renders it, because a person reading a transcript wants the answer.
 */
export interface EvaluationSummary {
    prompt: string;
    costUSD: number;
    numTurns: number;
    durationMs: number;
    isError: boolean;
    /** How many Demo Builder tools the run called. */
    steps: number;
    /** How many of those asked something already asked. */
    wastedSteps: number;
    /** Which tools were asked twice — names only, deduplicated. */
    repeatedTools: string[];
    /** Which tools the dry run stopped — names only, deduplicated. */
    blockedTools: string[];
}

/**
 * Reduce a full result to what an agent should read.
 *
 * @param result - the full evaluation
 * @returns the bounded summary
 */
export function summariseForAgent(result: EvaluationResult): EvaluationSummary {
    return {
        prompt: result.prompt,
        costUSD: result.costUSD,
        numTurns: result.numTurns,
        durationMs: result.durationMs,
        isError: result.isError,
        steps: result.trace.length,
        wastedSteps: result.repeats.length,
        repeatedTools: [...new Set(result.repeats.map((e) => e.tool))],
        blockedTools: [...new Set(result.blocked.map((e) => e.tool))],
    };
}

/** Why an evaluation could not run. Data, never an exception. */
export interface EvaluationRefusal {
    refused: string;
}

/**
 * Runs a shell command and returns its stdout.
 *
 * `shell` is in the signature and is NOT optional in practice. `CommandExecutor`
 * defaults it to FALSE (`commandExecutor.ts`: `options.shell || false`) and hands
 * the whole string to execa as the executable NAME — so a command with arguments
 * fails instantly with no process ever starting. It does not throw either
 * (`reject: false`), so the caller receives empty stdout and a successful-looking
 * result.
 *
 * That cost a whole test session on 2026-08-25: the first evaluation returned in
 * TWO MILLISECONDS and rendered as "Nothing was changed. 0 steps, $0.00, 0s".
 * Eleven other callers in this repo pass `shell: true`; this one did not.
 */
export interface CommandRunner {
    execute(
        command: string,
        options?: { timeout?: number; shell?: boolean },
    ): Promise<{ stdout: string }>;
}

/** What the CLI's JSON output carries that this service reads. */
interface ClaudeRunOutput {
    total_cost_usd?: number;
    num_turns?: number;
    duration_ms?: number;
    is_error?: boolean;
    /** The final assistant message. See `EvaluationResult.reply`. */
    result?: string;
}

/**
 * Quote a prompt for the shell.
 *
 * Single quotes, with embedded single quotes closed and reopened. The prompt is
 * the USER's text and can contain anything; a naive interpolation here is a
 * command injection with the user's own shell.
 */
function shellQuote(text: string): string {
    return `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * Evaluate one prompt.
 *
 * Refuses rather than throws when an evaluation is already running — that is the
 * recursion guard, and a refusal shaped as an error would invite the retry this
 * exists to prevent.
 *
 * @param prompt - the user's prompt, verbatim
 * @param deps - the command runner, the trace recorder, and a logger
 * @returns the joined result, or a refusal
 */
export async function evaluatePrompt(
    prompt: string,
    deps: {
        runner: CommandRunner;
        trace: ToolTraceRecorder;
        logger: Logger;
        /** The project the prompt runs against. Its `.mcp.json` is the base config. */
        projectPath?: string;
        /** Unique per run — keeps concurrent windows off each other's socket. */
        runId?: string;
    },
): Promise<EvaluationResult | EvaluationRefusal> {
    const text = prompt.trim();
    if (!text) return { refused: 'No prompt was given, so there was nothing to evaluate.' };

    if (isEvaluating()) {
        return {
            refused:
                'An evaluation is already running in this window. Wait for it to finish — ' +
                'an evaluation cannot evaluate itself, and running two at once would ' +
                'mix their traces.',
        };
    }

    const projectPath = deps.projectPath;
    if (!projectPath) {
        return {
            refused:
                'Open a project first. A prompt is evaluated against one, and its MCP ' +
                'configuration is what the run is launched with.',
        };
    }

    const outcome = await runAsEvaluation(async () => {
        // The trace is per-run. Anything recorded before this call belongs to
        // whatever the user was doing, and joining it in would report their work
        // as the prompt's cost.
        deps.trace.clear();

        return withEvaluationServer(deps.runId ?? String(process.pid), async (socketPath) => {
            // The narrowed local, not `deps.projectPath` — narrowing is lost
            // inside this closure, and a `!` here would silence the one check
            // standing between an evaluation and the ordinary server.
            const mcpConfig = await buildEvaluationMcpConfig(projectPath, socketPath);
            if (!mcpConfig) {
                // Refuse rather than run without the flag. Without it the agent
                // reaches the ORDINARY server and its writes execute for real,
                // while the workbench says nothing was changed — the exact
                // failure this design exists to make impossible.
                throw new Error(
                    "This project has no .mcp.json to base an evaluation on. Run " +
                        '"Demo Builder: Regenerate AI Files" and try again.',
                );
            }

            // `--strict-mcp-config` so the project's own .mcp.json is IGNORED
            // rather than merged — a merged config could still resolve
            // demo-builder to the ordinary socket. The config passed in carries
            // the project's other servers, so the agent keeps the tools it
            // would normally have.
            //
            // `--disallowedTools` is belt and braces beside `evaluationSession`;
            // a flag is a string and cannot be proven by execution.
            const command = [
                'claude',
                '-p',
                shellQuote(text),
                '--output-format',
                'json',
                '--mcp-config',
                shellQuote(mcpConfig),
                '--strict-mcp-config',
                '--disallowedTools',
                shellQuote(DISALLOWED_IN_EVALUATION),
            ].join(' ');

            deps.logger.info('[Evaluation] running a prompt evaluation');
            const { stdout } = await deps.runner.execute(command, {
                timeout: EVALUATION_TIMEOUT_MS,
                // NOT optional — see CommandRunner. Without it the executor treats
                // this entire string as an executable name and nothing runs.
                shell: true,
            });

            // A run whose output cannot be read is a FAILED RUN, and must not
            // be rendered as a successful one that happened to do nothing.
            //
            // The first version caught the parse error, logged a warning, and
            // defaulted every field to 0 — so a total failure arrived on screen
            // as "Nothing was changed. 0 steps, $0.00, 0s, nothing wasted",
            // which reads as a working feature reporting an empty result. The
            // owner hit exactly that on 2026-08-25 and could not tell what had
            // gone wrong, because nothing on the surface said anything HAD.
            //
            // The trace is still worth keeping when it has entries — it is the
            // more interesting half — but it is reported as a partial failure,
            // never as a clean zero.
            let parsed: ClaudeRunOutput;
            try {
                parsed = JSON.parse(stdout) as ClaudeRunOutput;
            } catch {
                const head = String(stdout ?? '').trim().slice(0, 400);
                deps.logger.error(
                    `[Evaluation] the run produced no readable output. First 400 bytes: ${
                        head || '(nothing at all)'
                    }`,
                );
                throw new Error(
                    'The run did not finish. Nothing was changed. ' +
                        (head
                            ? `It answered: ${head}`
                            : 'It produced no output at all — check that `claude` runs in a ' +
                              'terminal from this project, then see Demo Builder: Debug Logs.'),
                );
            }

            const entries = [...deps.trace.all()];
            return {
                prompt: text,
                costUSD: parsed.total_cost_usd ?? 0,
                numTurns: parsed.num_turns ?? 0,
                durationMs: parsed.duration_ms ?? 0,
                isError: parsed.is_error === true,
                // Only when there is something to say — an empty string would
                // render a "Claude" heading above nothing.
                ...(typeof parsed.result === 'string' && parsed.result.trim()
                    ? { reply: parsed.result.trim() }
                    : {}),
                trace: entries,
                repeats: deps.trace.repeats(),
                blocked: entries.filter((e) => e.outcome === 'blocked-by-dry-run'),
            } satisfies EvaluationResult;
        });
    });

    // `undefined` means the session guard refused between the check above and
    // the call — two doors racing. Same answer, not an error.
    return (
        outcome ?? {
            refused: 'An evaluation is already running in this window.',
        }
    );
}

/** Longest a single evaluation may run before it is abandoned. */
export const EVALUATION_TIMEOUT_MS = 5 * 60 * 1000;
