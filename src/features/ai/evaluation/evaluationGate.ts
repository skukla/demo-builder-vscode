/**
 * Evaluation tools gate
 *
 * The evaluation surface — Prompt Workbench, quick simulate, agent trace, dry
 * run — exists to measure how an agent uses Demo Builder's tools. That is
 * extension-development work, not demo-building work, and it arrived as four
 * Command Palette entries with no way to turn them off. A producer opening the
 * palette met commands for a feature they have no use for.
 *
 * So the commands stay registered (they are cheap, and an agent or a keybinding
 * can still reach them) while their PALETTE VISIBILITY is bound to a context
 * key that mirrors the setting. `package.json` carries the `when` clauses; this
 * module owns the key.
 *
 * Modelled on `dryRunMode` in the sibling directory: setting read live, never
 * cached, and re-synced on change.
 *
 * @module features/ai/evaluation/evaluationGate
 */

import * as vscode from 'vscode';

/** The setting, without its `demoBuilder.` prefix (how `getConfiguration` wants it). */
export const EVALUATION_TOOLS_SETTING = 'ai.enableEvaluationTools';

/**
 * Fully-qualified key, for `onDidChangeConfiguration` and for prose.
 *
 * Written out rather than composed from the constant above: `manifest-mirrors`
 * proves every setting declared in `package.json` is actually read by code, and
 * it can only see literals — a composed key reads as a declared-but-dead
 * setting, which is UI that does nothing. It also makes the key greppable.
 */
export const EVALUATION_TOOLS_SETTING_KEY = 'demoBuilder.ai.enableEvaluationTools';

/**
 * The context key the `when` clauses in `package.json` read. Kept in this
 * module so the two literals that must agree sit next to their reason; the
 * pairing is pinned by `evaluationGate.test.ts`, which reads the manifest.
 */
export const EVALUATION_TOOLS_CONTEXT_KEY = 'demoBuilder.evaluationToolsEnabled';

/**
 * Are the evaluation tools switched on right now?
 *
 * Read live rather than cached — a cached answer goes stale the moment someone
 * edits settings, and this gates what is VISIBLE, so stale reads are seen.
 *
 * @returns true when the palette entries and sidebar item should show
 */
export function isEvaluationToolsEnabled(): boolean {
    // `=== true`, not a cast: settings.json is user-editable text, so this can
    // arrive as a string or a number, and the value crosses into a webview
    // message where a truthy non-boolean would silently show the door.
    return (
        vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>(EVALUATION_TOOLS_SETTING, false) === true
    );
}

/**
 * Publish the context key and keep it in step with the setting.
 *
 * Call once during activation. Sets the key immediately so the palette is
 * correct on the first open, then re-sets it whenever the setting changes.
 *
 * @param context - extension context; the change listener is disposed with it
 */
export function registerEvaluationToolsGate(context: vscode.ExtensionContext): void {
    const sync = (): void => {
        void vscode.commands.executeCommand(
            'setContext',
            EVALUATION_TOOLS_CONTEXT_KEY,
            isEvaluationToolsEnabled(),
        );
    };
    sync();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(EVALUATION_TOOLS_SETTING_KEY)) sync();
        }),
    );
}
