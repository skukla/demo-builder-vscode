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

import type { HandlerContext } from '@/types/handlers';

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
        } else if (type.endsWith('-complete')) {
            timeline.push({ phase: 'complete', status: 'complete' });
        } else if (type.endsWith('-error')) {
            timeline.push({
                phase: String(d.phase ?? 'error'),
                status: 'error',
                message: typeof d.error === 'string' ? d.error : typeof d.message === 'string' ? d.message : undefined,
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

/** Find the last `*-error` event's data (the failure payload), if any. */
export function lastErrorData(events: CapturedEvent[]): Record<string, unknown> | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].type.endsWith('-error')) {
            return (events[i].data ?? {}) as Record<string, unknown>;
        }
    }
    return undefined;
}
