/**
 * Progress capture (Phase 3b) — turn the extension's webview progress events into
 * a structured timeline the agent can narrate to the user.
 *
 * Long-running handlers (storefront setup, project creation) report progress via
 * `context.sendMessage('<x>-progress', { phase, message, progress })` and finish
 * with `'<x>-complete'` / `'<x>-error'`. Headless, those go to a no-op. Here we
 * wrap a base headless context so `sendMessage` records every event, and expose a
 * lean mapping so a single tool call returns the full per-phase progress + outcome
 * (approach A: keep the pipeline whole, narrate it via the captured timeline).
 *
 * Reusable across every long-running action tool (create, reset, deploy, …).
 */

import { reportHandBack, reportPhase, type HandBack } from '@/core/utils/agentPhaseChannel';
import { CODE_SYNC_INSTALL_ACTION } from '@/features/eds/ui/helpers/codeSyncInstallContent';
import type { HandlerContext } from '@/types/handlers';
import type { StorefrontGitHubAppRequiredPayload } from '@/types/webviewPayloads';

/**
 * The one event a storefront setup sends when it needs a PERSON: the AEM Code Sync
 * GitHub App is not on the new repository, and the run pauses (up to
 * `TIMEOUTS.EDS_CODE_SYNC_INSTALL_WAIT`) until it is. The wizard opens its install
 * dialog on it; headless, it reached nobody until 2026-10-08, when an agent-run
 * creation sat on it for 27 minutes with the card reading "Creating the project".
 */
const GITHUB_APP_REQUIRED = 'storefront-setup-github-app-required';

/**
 * The storefront setup's own progress line. The creation executor reports its
 * phases to the agent channel itself (`reportPhase` beside `creationProgress`);
 * the storefront setup, which an EDS creation runs BEFORE the executor, only ever
 * sent to the webview, so the agent's card showed nothing for the whole of it
 * (2026-10-08: "Creating the project" and no phase, for 27 minutes). Forwarded
 * here, and only this type: a handler that already reports its phases would
 * narrate twice.
 */
const STOREFRONT_SETUP_PROGRESS = 'storefront-setup-progress';

/** The phase line a storefront-setup progress event carries, or undefined. */
function storefrontPhaseOf(type: string, data: unknown): string | undefined {
    if (type !== STOREFRONT_SETUP_PROGRESS) return undefined;
    const d = (data ?? {}) as { message?: unknown; subMessage?: unknown };
    if (typeof d.message !== 'string' || !d.message) return undefined;
    return typeof d.subMessage === 'string' && d.subMessage ? `${d.message} — ${d.subMessage}` : d.message;
}

/** The hand-back an event carries, or undefined when it is not one. */
export function handBackOf(type: string, data: unknown): HandBack | undefined {
    if (type !== GITHUB_APP_REQUIRED) return undefined;
    const d = (data ?? {}) as Partial<StorefrontGitHubAppRequiredPayload>;
    if (!d.owner || !d.repo || !d.installUrl) return undefined;
    return {
        title: `install the AEM Code Sync GitHub App on ${d.owner}/${d.repo}`,
        detail: 'The run resumes by itself once it is installed.',
        action: { label: CODE_SYNC_INSTALL_ACTION, url: d.installUrl },
    };
}

/** A raw captured sendMessage event. */
export interface CapturedEvent {
    type: string;
    data: unknown;
}

/** A lean phase entry for the agent to report. */
export interface PhaseEntry {
    phase: string;
    status: 'progress' | 'complete' | 'error';
    message?: string;
    progress?: number;
}

/** Pull a human-readable error message out of an event payload (`error` then `message`). */
function errorMessage(d: Record<string, unknown>): string | undefined {
    if (typeof d.error === 'string') {
        return d.error;
    }
    if (typeof d.message === 'string') {
        return d.message;
    }
    return undefined;
}

/**
 * Wrap `base` so its `sendMessage` appends each event to `sink` (in addition to
 * any logging the base already does). Everything else passes through unchanged,
 * so handlers reached with this context behave identically — they just have their
 * progress observed.
 */
export function withCapturedProgress(base: HandlerContext, sink: CapturedEvent[]): HandlerContext {
    return {
        ...base,
        sendMessage: async (type: string, data?: unknown) => {
            sink.push({ type, data });
            const phase = storefrontPhaseOf(type, data);
            if (phase) reportPhase(phase);
            const handBack = handBackOf(type, data);
            if (handBack) reportHandBack(handBack);
            // Preserve any base behavior (e.g. the in-extension logging no-op).
            await base.sendMessage(type, data);
        },
    };
}

/**
 * Map captured `*-progress` / `*-complete` / `*-error` events to a lean phase
 * timeline. Unrecognized event types are ignored (kept out of the agent payload).
 */
export function toPhaseTimeline(events: CapturedEvent[]): PhaseEntry[] {
    const timeline: PhaseEntry[] = [];
    for (const { type, data } of events) {
        const d = (data ?? {}) as Record<string, unknown>;
        if (type.endsWith('-progress')) {
            timeline.push({
                phase: String(d.phase ?? d.operation ?? ''),
                status: 'progress',
                message: typeof d.message === 'string' ? d.message : undefined,
                progress: typeof d.progress === 'number' ? d.progress : undefined,
            });
        } else if (type === GITHUB_APP_REQUIRED) {
            const handBack = handBackOf(type, data);
            timeline.push({
                phase: String(d.phase ?? 'site-config'),
                status: 'progress',
                message: handBack
                    ? `Waiting for the user to ${handBack.title} (asked in VS Code; the run resumes by itself)`
                    : 'Waiting for the user to install the AEM Code Sync GitHub App',
            });
        } else if (type.endsWith('-complete')) {
            timeline.push({ phase: 'complete', status: 'complete' });
        } else if (type.endsWith('-error')) {
            timeline.push({
                phase: String(d.phase ?? 'error'),
                status: 'error',
                message: errorMessage(d),
            });
        }
    }
    return timeline;
}

/** Find the last `*-complete` event's data (the handler's result payload), if any. */
export function lastCompleteData(events: CapturedEvent[]): Record<string, unknown> | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type.endsWith('-complete')) {
            return (events[i].data ?? {}) as Record<string, unknown>;
        }
    }
    return undefined;
}

/**
 * The payload of the last event with EXACTLY this type.
 *
 * `lastCompleteData` only matches the `*-complete` convention, which long-running
 * orchestrations follow. Most webview-coupled handlers do not: they compute an
 * answer and push it under a domain name — `handleCheckGitHubAuth` sends
 * `'github-auth-status'`, `handleCheckDaLiveAuth` sends `'dalive-auth-status'`.
 * For those the descriptor NAMES the event whose payload is the result, so
 * nothing has to be inferred from a suffix.
 *
 * @param events Captured events, in order.
 * @param type   Exact event type to look for.
 */
export function payloadOfEvent(
    events: CapturedEvent[],
    type: string,
): Record<string, unknown> | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type === type) {
            return (events[i].data ?? {}) as Record<string, unknown>;
        }
    }
    return undefined;
}

/** Find the last `*-error` event's data (the failure payload), if any. */
export function lastErrorData(events: CapturedEvent[]): Record<string, unknown> | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type.endsWith('-error')) {
            return (events[i].data ?? {}) as Record<string, unknown>;
        }
    }
    return undefined;
}
