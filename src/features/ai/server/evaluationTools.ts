/**
 * `evaluate_prompt` — the agent's door into Evaluation Mode.
 *
 * A producer can say "evaluate this prompt" in normal chat and get back what the
 * prompt WOULD do, what it would cost, and where it wasted steps — without a
 * single change reaching a real project.
 *
 * ## Three constraints, none optional
 *
 * 1. **It refuses to recurse.** An evaluation that can evaluate itself bills in
 *    a loop. The spawned run is launched with the tool disallowed AND the server
 *    refuses while one is in flight; the second is the guard that counts,
 *    because a CLI flag is a string and this repo has already shipped a
 *    string-asserted guard that never ran.
 * 2. **It declares `readOnly: false`.** Nothing it does outlives the call — the
 *    dry run is forced for the whole run — but it spawns a real paid process,
 *    and a dry run that promises "nothing happens" must not quietly spend $0.21.
 *    So the dry run blocks it, which is the conservative and honest answer.
 * 3. **It requires `confirm: true`.** The one place a non-destructive tool earns
 *    a consent dialog: not because it destroys, but because it SPENDS. The
 *    dialog states the cost before the money is gone.
 *
 * @module features/ai/server/evaluationTools
 */

import { z } from 'zod';
import { asText } from './mcpToolResult';
import type { ToolTraceRecorder } from './toolTraceRecorder';
import {
    evaluatePrompt,
    summariseForAgent,
    type CommandRunner,
} from '@/features/ai/evaluation/promptEvaluationService';
import type { Logger } from '@/types/logger';

/**
 * Register the evaluation tool.
 *
 * @param server - the logging-wrapped MCP server
 * @param deps - the command runner, trace recorder and logger, injected so this
 *   module carries no vscode import and the service stays testable
 */
export function registerEvaluationTools(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    deps: {
        runner: CommandRunner;
        trace: ToolTraceRecorder;
        logger: Logger;
        currentProjectPath: () => Promise<string | undefined>;
    },
): void {
    server.registerTool(
        'evaluate_prompt',
        {
            title: 'Evaluate Prompt',
            description:
                'Run a prompt with every change simulated, and report what it would do, what it ' +
                'would cost in dollars, and which steps it wasted. Requires confirm:true — it ' +
                'spawns a real paid run taking 30s to 2 minutes. Use when asked to test, ' +
                'evaluate or improve a prompt.',
            // NOT read-only: it spends money and spawns a process. See the module
            // note — a dry run must not quietly pay for a run.
            annotations: { readOnlyHint: false, destructiveHint: false },
            inputSchema: {
                prompt: z.string().describe('The prompt to evaluate, exactly as it would be sent'),
                confirm: z
                    .boolean()
                    .optional()
                    .describe('Must be true — this spawns a real run and costs money'),
            },
        },
        async (args: { prompt?: string; confirm?: boolean }) => {
            if (args?.confirm !== true) {
                return asText({
                    error:
                        'evaluate_prompt spawns a real run and costs money. Call again with ' +
                        'confirm:true once the user has agreed.',
                });
            }
            // The project is resolved PER CALL: an evaluation is launched with
            // that project's own MCP configuration, and the current project can
            // change between calls.
            const project = await deps.currentProjectPath();
            const result = await evaluatePrompt(String(args?.prompt ?? ''), {
                ...deps,
                projectPath: project,
            });
            // A SUMMARY, never the whole trace. The trace can hold hundreds of
            // entries; the workbench reads it in-process, and an agent asking
            // "how did this prompt do?" wants the verdict and the waste.
            return asText('refused' in result ? result : summariseForAgent(result));
        },
    );
}
