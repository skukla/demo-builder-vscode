/**
 * Door 2 — evaluating a prompt from the command palette.
 *
 * For a producer who does not want to chat. It asks for the prompt, runs the
 * SAME service the agent's `evaluate_prompt` tool runs, and reports the verdict.
 *
 * One service behind both doors on purpose: two implementations of "evaluate a
 * prompt" would drift, and the one that drifted would be the one nobody was
 * watching. Door 3 (the workbench) joins them in step 04.
 *
 * @module features/ai/evaluation/evaluatePromptCommand
 */

import * as vscode from 'vscode';
import type { ToolTraceRecorder } from '../server/toolTraceRecorder';
import { evaluatePrompt, type CommandRunner } from './promptEvaluationService';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** Money and minutes — stated before either is spent. */
const COST_WARNING =
    'This runs your prompt for real to see what it would do. It takes up to two minutes ' +
    'and costs money. Nothing in your project is changed.';

/**
 * Register the command.
 *
 * @param context - extension context (owns the disposable)
 * @param deps - the same dependencies the MCP tool is given
 */
export function registerEvaluatePromptCommand(
    context: vscode.ExtensionContext,
    deps: {
        runner: CommandRunner;
        trace: ToolTraceRecorder;
        logger: Logger;
        currentProjectPath: () => Promise<string | undefined>;
    },
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('demoBuilder.evaluatePrompt', async () => {
            const prompt = await vscode.window.showInputBox({
                title: 'Try a prompt out',
                prompt: 'What would you ask the agent to do?',
                placeHolder: 'Set up Bodea with B2B',
                ignoreFocusOut: true,
            });
            if (!prompt?.trim()) return;

            // Cost is stated BEFORE the run, not after. The agent-facing door
            // does the same through the consent dialog.
            const go = await vscode.window.showWarningMessage(
                'Try this prompt out?',
                { modal: true, detail: COST_WARNING },
                'Run it',
            );
            if (go !== 'Run it') return;

            const result = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Trying the prompt out…',
                    cancellable: false,
                },
                async () =>
                    evaluatePrompt(prompt, {
                        ...deps,
                        projectPath: await deps.currentProjectPath(),
                    }),
            );

            if ('refused' in result) {
                await vscode.window.showWarningMessage(result.refused);
                return;
            }

            // Dollars, not tokens: "$0.21" means something to a demo builder and
            // "47,550 tokens" does not. The tokens ride along in the trace for
            // whoever wants them.
            const cost = `$${result.costUSD.toFixed(2)}`;
            const seconds = Math.round(result.durationMs / 1000);
            const waste = result.repeats.length
                ? `, ${result.repeats.length} of ${result.trace.length} steps wasted`
                : '';
            vscode.window.setStatusBarMessage(
                `$(beaker) ${result.trace.length} steps, ${cost}, ${seconds}s${waste}`,
                TIMEOUTS.STATUS_BAR_SUCCESS,
            );
            await vscode.window.showInformationMessage(
                `Nothing was changed. ${result.trace.length} steps, ${cost}, ${seconds}s${waste}.`,
            );
        }),
    );
}
