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
import type { ConsentVerdict } from './inExtensionMcpServer';
import { asRawText } from './mcpToolResult';
import { humanize } from './toolDisplayName';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** Longest arg value the consent dialog will print before eliding. */
const CONSENT_DETAIL_VALUE_MAX = 60;

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
            lines.push(`${key}: ***`);
            continue;
        }
        if (typeof value === 'string') {
            lines.push(
                `${key}: ${
                    value.length > CONSENT_DETAIL_VALUE_MAX
                        ? `${value.slice(0, CONSENT_DETAIL_VALUE_MAX)}… (${value.length} chars)`
                        : value
                }`,
            );
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            lines.push(`${key}: ${value}`);
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
): (toolName: string, args: unknown) => Promise<ConsentVerdict> {
    return async (toolName, args) => {
        const required = vscode.workspace
            .getConfiguration('demoBuilder')
            .get<boolean>('ai.requireAgentConsent', true);
        if (!required) {
            return { allowed: true };
        }

        const detail = renderArgsForConsent(args);
        const choice = await vscode.window.showWarningMessage(
            `Demo Builder — an AI agent requests: ${humanize(toolName)}. Allow it?`,
            {
                modal: true,
                detail: detail || 'No parameters beyond the confirmation itself.',
            },
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
): (toolName: string, run: () => Promise<unknown>) => Promise<unknown> {
    return (toolName, run) =>
        Promise.resolve(
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Demo Builder — agent: ${humanize(toolName)}…`,
                    cancellable: false,
                },
                async () => {
                    try {
                        const result = await run();
                        vscode.window.setStatusBarMessage(
                            `$(check) Agent: ${humanize(toolName)} completed`,
                            TIMEOUTS.STATUS_BAR_SUCCESS,
                        );
                        return result;
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        logger.warn(`[MCP] agent operation ${toolName} failed: ${message}`);
                        // A toast, not a status-bar flash: a failed live-site
                        // mutation is the one outcome the user must not miss.
                        void vscode.window.showWarningMessage(
                            `Demo Builder — agent operation "${humanize(toolName)}" failed: ${message}`,
                        );
                        throw error;
                    }
                },
            ),
        );
}
