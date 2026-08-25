/**
 * Visibility for agent-triggered MCP mutations.
 *
 * The first slice of the consent/visibility design
 * (`.rptc/backlog/2026-08-23-mcp-destructive-ops-native-consent.md`): an
 * MCP-invoked republish/sync/refresh/reset used to run for minutes against
 * live resources with ZERO VS Code surface — on 2026-08-23 a two-minute
 * library refresh's only evidence was the CDN's `last-modified` header,
 * because the probe client had timed out and the chat was elsewhere.
 *
 * This is the `longRunningNotifier` the in-extension MCP server injects
 * around every non-read-shaped tool call (`isReadOnlyToolName` decides —
 * an allowlist that fails closed into "mutating"):
 *
 * - WHILE the call runs: a `withProgress` notification names the operation,
 *   exactly like the dashboard button for the same work would.
 * - WHEN it ends: the OUTCOME lands in the window — a status-bar message on
 *   success (quiet; agent bursts must not stack toasts), a warning toast on
 *   failure. The agent's own report cannot be relied on to reach the user:
 *   a disconnected client or a closed chat swallows it, and both happened
 *   live the day this was built.
 *
 * The consent dialog (the design's second leg) slots into this same wrapper
 * later — before `run()`, same classification.
 *
 * @module features/ai/server/agentOperationNotifier
 */

import * as vscode from 'vscode';
import { alertCopyFor } from './agentAlertCopy';
import type { ConsentVerdict } from './inExtensionMcpServer';
import { asRawText } from './mcpToolResult';
import { narrationFor } from './toolNarration';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** Longest arg value the consent dialog will print before eliding. */
const CONSENT_DETAIL_VALUE_MAX = 60;

/**
 * Friendlier labels for argument keys a producer would not recognise.
 *
 * `confirmName` is the surface's proof-of-intent echo — the agent repeats the
 * target's name to show it means this one. As a dialog line it read
 * "confirmName: bodea", which is a field name from our schema leaking into a
 * question we are asking a human.
 */
const CONSENT_KEY_LABELS: Record<string, string> = {
    confirmName: 'Name',
    projectName: 'Project',
};

/**
 * The authored phrase for a VS Code frame, or the bare tool name if a tool has
 * somehow shipped without one. The tool NAME is the honest fallback here: it is
 * visibly a fallback rather than prose pretending to be authored, and
 * `toolNarration.test.ts` makes the case unreachable.
 */
function label(toolName: string): string {
    return narrationFor(toolName) ?? toolName;
}

/** `blockId` / `block_id` → "Block id". A label, not an identifier. */
function humanizeKey(key: string): string {
    const labelled = CONSENT_KEY_LABELS[key];
    if (labelled) return labelled;
    const spaced = key
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Arg keys whose VALUES must never reach a dialog (or anywhere else). */
const SECRET_KEY_RE = /token|secret|password|credential|apikey|api_key/i;

/**
 * Render a call's args for the consent dialog — the informed half of
 * informed consent. Scalars only (an object arg is structure, not a decision
 * input), the `confirm` marker itself skipped, secret-shaped keys masked,
 * long values elided. This deliberately DOES show values where the logging
 * wrapper shows only keys: "publish /products/x" is the substance the user
 * is consenting to.
 */
function renderArgsForConsent(args: unknown): string {
    if (!args || typeof args !== 'object') return '';
    const lines: string[] = [];
    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
        if (key === 'confirm') continue;
        if (SECRET_KEY_RE.test(key)) {
            lines.push(`${humanizeKey(key)}: ***`);
            continue;
        }
        if (typeof value === 'string') {
            lines.push(
                `${humanizeKey(key)}: ${
                    value.length > CONSENT_DETAIL_VALUE_MAX
                        ? `${value.slice(0, CONSENT_DETAIL_VALUE_MAX)}… (${value.length} chars)`
                        : value
                }`,
            );
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            lines.push(`${humanizeKey(key)}: ${value}`);
        }
    }
    return lines.join('\n');
}

/**
 * Build the consent gate the extension passes to `InExtensionMcpServer`.
 *
 * Fires only for calls carrying `confirm: true` (the server's
 * `callRequestsConsent` decides — that parameter is the surface's own
 * destructive marker, and it is agent-supplied: the whole gap this gate
 * closes is that nothing verified the user was actually asked). MODAL on
 * purpose: a QuickPick dismisses on focus loss and a non-modal toast can sit
 * unseen while the agent's client times out; the modal is answered or the
 * refusal is explicit.
 *
 * The `demoBuilder.ai.requireAgentConsent` setting (default on) is the
 * headless escape hatch, read live per call so flipping it needs no reload.
 * A decline answers a ready prose refusal that names what happened and how
 * to change the policy — the agent gets a well-shaped answer, never a hang.
 *
 * @param logger - extension logger (verdicts are logged)
 * @returns the gate: `(toolName, args) => ConsentVerdict`
 */
export function createAgentConsentGate(
    logger: Logger,
): (toolName: string, args: unknown, description?: string) => Promise<ConsentVerdict> {
    // `_description` is accepted and deliberately NOT shown — see the dialog
    // block below and agentAlertCopy for why the agent-facing text is not human
    // copy. Kept in the signature so the gate's contract is stable.
    return async (toolName, args, _description) => {
        const required = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>('ai.requireAgentConsent', true);
        if (!required) {
            return { allowed: true };
        }

        // AUTHORED copy, not derived. `description` is still accepted so the
        // signature stays stable, but it is deliberately NOT shown: it is written
        // for an agent, and four passes of transforming it still produced text a
        // producer should not have been handed. See agentAlertCopy.
        // `copy` is always present in practice — AGENT_ALERT_COPY membership IS
        // what makes this gate fire (`raisesConsentDialog`). The fallback below
        // is the bare tool name: visibly a fallback, rather than prose that
        // pretends to be authored copy.
        const copy = alertCopyFor(toolName);
        const params = renderArgsForConsent(args);
        const detail = [copy?.consequence, params].filter(Boolean).join('\n\n');
        const choice = await vscode.window.showWarningMessage(
            `Demo Builder: ${copy?.action ?? toolName}?`,
            { modal: true, detail: detail || undefined },
            'Allow',
        );

        if (choice === 'Allow') {
            logger.info(`[MCP] user allowed agent operation: ${toolName}`);
            return { allowed: true };
        }
        logger.info(`[MCP] user declined agent operation: ${toolName}`);
        return {
            allowed: false,
            refusal: asRawText(
                `The user declined "${toolName}" in the VS Code consent dialog — the operation ` +
                    'was NOT run. Ask the user how to proceed; do not retry without new ' +
                    'instructions. (They can turn this dialog off with the ' +
                    'demoBuilder.ai.requireAgentConsent setting, e.g. for unattended use.)',
            ),
        };
    };
}

/**
 * Build the notifier the extension passes to `InExtensionMcpServer`.
 *
 * @param logger - extension logger (failures are logged as well as shown)
 * @returns the wrapper: runs the tool call inside a progress notification
 *          and lands its outcome in the window
 */
export function createAgentOperationNotifier(
    logger: Logger,
): (
    toolName: string,
    run: (report: (message: string) => void) => Promise<unknown>,
) => Promise<unknown> {
    return (toolName, run) =>
        Promise.resolve(
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Demo Builder — agent: ${label(toolName)}…`,
                    cancellable: false,
                },
                async (progress) => {
                    try {
                        // Hand our reporter to the caller so the operation's own
                        // phase strings reach this notification. Previously `run`
                        // took nothing, so the notification could only ever show
                        // the tool's title while the phases went nowhere.
                        const result = await run((message) => progress.report({ message }));
                        vscode.window.setStatusBarMessage(
                            `$(check) ${label(toolName)} — done`,
                            TIMEOUTS.STATUS_BAR_SUCCESS,
                        );
                        return result;
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        logger.warn(`[MCP] agent operation ${toolName} failed: ${message}`);
                        // A toast, not a status-bar flash: a failed live-site
                        // mutation is the one outcome the user must not miss.
                        void vscode.window.showWarningMessage(
                            `Demo Builder — ${label(toolName)} failed: ${message}`,
                        );
                        throw error;
                    }
                },
            ),
        );
}
