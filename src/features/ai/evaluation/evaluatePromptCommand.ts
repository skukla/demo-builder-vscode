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
    'This runs your prompt to see what it WOULD do. It takes up to two minutes ' +
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
                title: 'Simulate a prompt',
                prompt: 'What would you ask the agent to do?',
                placeHolder: 'Set up Bodea with B2B',
                ignoreFocusOut: true,
            });
            if (!prompt?.trim()) return;

            // Cost is stated BEFORE the run, not after. The agent-facing door
            // does the same through the consent dialog.
            const go = await vscode.window.showWarningMessage(
                'Simulate this prompt?',
                { modal: true, detail: COST_WARNING },
                'Run it',
            );
            if (go !== 'Run it') return;

            const result = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Simulating the prompt…',
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

            // Dollars, not tokens — REVERSED 2026-08-26, pending step 11. The
            // surface is moving to tokens: dollars measure our cost, tokens
            // measure the producer's remaining ability to work. See
            // `step-11-two-tools.md`. Unchanged here until that step lands, so
            // the quick command and the panel do not disagree mid-flight.
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
