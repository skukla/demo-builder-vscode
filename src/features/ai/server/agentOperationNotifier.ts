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
import { buildConsentPrompt } from './consentText';
import type { ConsentVerdict } from './inExtensionMcpServer';
import { asRawText } from './mcpToolResult';
import { narrationFor } from './toolNarration';
import { ServiceLocator } from '@/core/di/serviceLocator';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * Tools the user has said "don't ask again this session" for.
 *
 * Module state, and it dies with the window — that is the whole point of the
 * word SESSION. A grant that survived a reload would be a preference the user
 * never set, hiding in a place they cannot see it.
 *
 * Only tools whose copy sets `sessionGrant` can enter this set, so the two tests
 * that decide it (recoverable, and does not reach another person) are enforced
 * where they are authored rather than at the call site.
 */
const sessionGrants = new Set<string>();

/** Forget every grant. Test seam, and the reset a future "lock again" would use. */
export function clearSessionGrants(): void {
    sessionGrants.clear();
}

/**
 * The open project's name, for tools that act on it and take no argument
 * naming it — `republish`, `sync_content`, `reset_eds_project`.
 *
 * Best-effort: the dialog must still appear if state is unavailable. A missing
 * name costs the reader context; a thrown error would cost them the gate.
 *
 * @returns the "Project: x" line, or '' when it cannot be resolved
 */
async function currentProjectLine(): Promise<string> {
    try {
        const project = await ServiceLocator.getStateManager()?.getCurrentProject();
        return project?.name ? `Project: ${project.name}` : '';
    } catch {
        return '';
    }
}

/**
 * The authored phrase for a VS Code frame, or the bare tool name if a tool has
 * somehow shipped without one. The tool NAME is the honest fallback here: it is
 * visibly a fallback rather than prose pretending to be authored, and
 * `toolNarration.test.ts` makes the case unreachable.
 */
function label(toolName: string): string {
    return narrationFor(toolName) ?? toolName;
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
        // Three lines and no more: what happens, what it costs, and WHICH one.
        // An empty `target` means the tool acts on the open project, which is
        // named instead — a reader is never asked to approve an unnamed thing.
        // ONE builder, shared with the chat path. Two surfaces phrasing the
        // same question differently is how they drift.
        const prompt = buildConsentPrompt(toolName, args, await currentProjectLine());
        // A standing grant answers before the dialog opens. Checked AFTER the
        // setting so turning consent back on revokes them, and after the copy
        // lookup so a tool with no copy can never be granted.
        if (copy?.sessionGrant && sessionGrants.has(toolName)) {
            logger.info(`[MCP] ${toolName} allowed by a session grant`);
            return { allowed: true };
        }

        // The third button appears only where the copy allows it. Its wording
        // says what is being granted and for how long — "Allow" and "Always
        // allow" would read as the same promise at a glance.
        const buttons: string[] = ['Allow'];
        if (copy?.sessionGrant) buttons.push('Allow for the rest of this session');

        // Name the wait BEFORE opening the dialog. When nobody was watching the
        // window, this await was a silent indefinite hang — the tool's args line
        // was the last log anywhere, and the hang site took a live bisection to
        // find (AI-5, 2026-08-27).
        logger.info(`[MCP] ${toolName} awaiting the user consent dialog in the VS Code window…`);
        // The dialog cannot be closed programmatically, so an unanswered one
        // resolves as a timeout refusal rather than blocking the agent forever.
        // A click that comes after the timer fires grants nothing — the call
        // already answered "not approved". `timedOut` separates that from a real
        // Cancel/Escape, which also resolves `undefined`.
        let timedOut = false;
        const choice = await Promise.race([
            vscode.window.showWarningMessage(
                prompt?.title ?? `Demo Builder: ${toolName}?`,
                { modal: true, detail: prompt?.detail || undefined },
                ...buttons,
            ),
            new Promise<undefined>((resolve) =>
                setTimeout(() => {
                    timedOut = true;
                    resolve(undefined);
                }, TIMEOUTS.LONG),
            ),
        ]);

        if (choice === 'Allow for the rest of this session') {
            sessionGrants.add(toolName);
            logger.info(`[MCP] user granted ${toolName} for this session`);
            return { allowed: true };
        }
        if (choice === 'Allow') {
            logger.info(`[MCP] user allowed agent operation: ${toolName}`);
            return { allowed: true };
        }
        if (timedOut) {
            logger.warn(`[MCP] ${toolName} consent dialog unanswered — treating as not approved`);
            return {
                allowed: false,
                refusal: asRawText(
                    `Nobody answered the consent dialog for "${toolName}" in the VS Code window, ` +
                        'so the operation was NOT run. The user may be away from that window — ' +
                        'tell them a consent dialog may still be open there, and retry only when ' +
                        'they are ready to answer it. (For unattended use they can turn the dialog ' +
                        'off with the demoBuilder.ai.requireAgentConsent setting.)',
                ),
            };
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
    run: (report: (message: string) => void) => Promise<unknown>
) => Promise<unknown> {
    return (toolName, run) =>
        Promise.resolve(
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    // "Agent:" and nothing more — the old "Demo Builder — agent:"
                    // prefix plus the phase message wrapped every card onto two
                    // lines (owner feedback, 2026-08-27). The source is already
                    // on the card ("Source: Adobe Demo Builder").
                    title: `Agent: ${label(toolName)}…`,
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
