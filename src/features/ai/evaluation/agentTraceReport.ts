/**
 * What the agent just did, read back from the recorder.
 *
 * WHY THIS EXISTS. Turning the dry run on and chatting normally gave a producer
 * the safety and none of the visibility: nothing changed, the agent said what it
 * would have done, and there was no trace and no cost. Meanwhile every call in
 * every chat was already being recorded — `extension.ts` hands the main server
 * the same recorder — and the only thing that ever read it was a workbench run.
 * The data existed and nothing showed it.
 *
 * Pure on purpose: the recorder is a live object in the extension host and the
 * webview needs a shape it can render. Keeping the shaping here means the
 * ordering rules can be tested without a server, a socket, or a panel.
 *
 * @module features/ai/evaluation/agentTraceReport
 */

import type { TraceEntry } from '../server/toolTraceRecorder';

/**
 * Long enough to be worth mentioning.
 *
 * Three seconds is where a call stops feeling like part of the answer and starts
 * being something the producer waited for. Named rather than inlined — the SOP
 * forbids magic timings, and this one is a judgement someone may want to move.
 */
export const SLOW_CALL_MS = 3_000;

/** Why a call is worth looking at before the others. */
export type TraceFlag = 'failed' | 'blocked' | 'repeated' | 'slow';

/** One call, as the trace view renders it. */
export interface TraceRow {
    tool: string;
    outcome: TraceEntry['outcome'];
    durationMs: number;
    resultBytes: number;
    /** Milliseconds since the recorder started. */
    at: number;
    /** Set when this call is one of the ones that stood out. */
    flag?: TraceFlag;
}

/** Everything the trace view needs, already ordered and counted. */
export interface TraceReport {
    /** Every call, in the order it happened. */
    rows: TraceRow[];
    /** The ones worth reading first — failures, blocked writes, repeats, slow calls. */
    standouts: TraceRow[];
    totalCalls: number;
    wastedCalls: number;
    blockedCalls: number;
    failedCalls: number;
}

/**
 * Which call was a repeat — same tool, same arguments, not the first time.
 *
 * Mirrors the recorder's own rule, including skipping errors: asking again after
 * a failure is reasonable, and counting it would report recovery as waste.
 */
function repeatedCalls(trace: readonly TraceEntry[]): Set<TraceEntry> {
    const seen = new Set<string>();
    const repeats = new Set<TraceEntry>();
    for (const e of trace) {
        if (e.outcome === 'error') continue;
        const key = `${e.tool}:${e.argumentFingerprint}`;
        if (seen.has(key)) repeats.add(e);
        else seen.add(key);
    }
    return repeats;
}

/**
 * Why this call stands out, if it does.
 *
 * Ordered by what a producer would act on first: something that failed, then
 * something a dry run stopped, then a wasted step, then merely slow. A helper
 * rather than a nested ternary — the SOP forbids those and a scan enforces it.
 */
function flagFor(entry: TraceEntry, repeats: Set<TraceEntry>): TraceFlag | undefined {
    if (entry.outcome === 'error') return 'failed';
    if (entry.outcome === 'blocked-by-dry-run') return 'blocked';
    if (repeats.has(entry)) return 'repeated';
    if (entry.durationMs >= SLOW_CALL_MS) return 'slow';
    return undefined;
}

/**
 * Shape the recorder's contents for reading.
 *
 * The full list stays in time order, because the story of what the agent did is
 * chronological and re-sorting it destroys that. What is called out separately
 * is the short list of things worth reading first — a raw dump of 500 reads is
 * not something anyone scans in a hurry.
 *
 * @param trace - the recorder's entries, oldest first
 */
export function buildTraceReport(trace: readonly TraceEntry[]): TraceReport {
    const repeats = repeatedCalls(trace);
    const rows: TraceRow[] = trace.map((e) => {
        const flag = flagFor(e, repeats);
        return {
            tool: e.tool,
            outcome: e.outcome,
            durationMs: e.durationMs,
            resultBytes: e.resultBytes,
            at: e.at,
            ...(flag ? { flag } : {}),
        };
    });

    return {
        rows,
        standouts: rows.filter((r) => r.flag !== undefined),
        totalCalls: rows.length,
        wastedCalls: repeats.size,
        blockedCalls: rows.filter((r) => r.outcome === 'blocked-by-dry-run').length,
        failedCalls: rows.filter((r) => r.outcome === 'error').length,
    };
}

/**
 * The same report as plain text, for copying and for saving to a file.
 *
 * Deliberately not JSON: this is pasted into a message to a colleague far more
 * often than it is parsed, and the counts are the part someone quotes.
 */
export function renderTraceText(report: TraceReport): string {
    const lines = [
        `Demo Builder — what the agent did (${report.totalCalls} calls)`,
        `${report.wastedCalls} repeated, ${report.blockedCalls} simulated, ${report.failedCalls} failed.`,
        'Cost is not recorded for a chat session — simulate a prompt to measure it.',
        '',
    ];
    for (const [i, row] of report.rows.entries()) {
        const flag = row.flag ? ` [${row.flag}]` : '';
        lines.push(`${i + 1}. ${row.tool} — ${row.durationMs}ms, ${row.resultBytes} bytes${flag}`);
    }
    return lines.join('\n');
}
