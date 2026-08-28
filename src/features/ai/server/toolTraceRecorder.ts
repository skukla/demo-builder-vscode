/**
 * What an agent actually did, call by call.
 *
 * WHY THIS EXISTS. The server already sees every tool call on BOTH registration
 * paths, because `withToolLogging` wraps them all. Nothing else in the system
 * has that view. It logged the name and the argument keys and threw the rest
 * away, so "how did the agent spend eleven steps answering that?" had no answer
 * short of reading a transcript by hand.
 *
 * ## Reads are recorded exactly like writes
 *
 * Every
 * measured win so far has been a read — the orientation call removed on
 * 2026-08-24 was a read, and it cost 25–57% of three prompts. A recorder that
 * foregrounds blocked writes and treats reads as background would be blind to
 * the class of waste that actually turns up.
 *
 * ## Why a fingerprint, and never the values
 *
 * Argument KEYS cannot tell "asked about project A, then project B" from "asked
 * about project A twice". Only the second is waste, and it is the most common
 * thing worth catching. Values cannot be kept — args carry secrets, which is
 * why the existing log line is keys-only.
 *
 * So each entry carries a short hash of the argument VALUES. Repetition becomes
 * computable (same tool, same fingerprint, twice in a session) while nothing
 * readable is retained, and the digest is one-way: a fingerprint in a trace
 * cannot be turned back into the token that produced it.
 *
 * ## Bounded on purpose
 *
 * A ring buffer, not a growing list, and no file. An unbounded log was raised
 * as a concern before this was built; the consumer (the workbench) lives in the
 * same process, so history across restarts is not needed until something proves
 * it is.
 *
 * @module features/ai/server/toolTraceRecorder
 */

import { createHash } from 'crypto';

/** How many calls are kept. Oldest are dropped first. */
export const TRACE_CAPACITY = 500;

/** How a call ended. */
export type TraceOutcome = 'ok' | 'error';

/** One tool call, as the server saw it. */
export interface TraceEntry {
    /** MCP tool name. */
    tool: string;
    /** What the tool declared about itself — see `toolAnnotations.test.ts`. */
    readOnly: boolean;
    /** Argument names only. NEVER values. */
    argumentKeys: string[];
    /**
     * Hash of the argument VALUES, for spotting a repeated question.
     *
     * `'none'` when the call carried no arguments — distinct from a hash, so a
     * run of no-arg calls does not read as the same question asked twice.
     */
    argumentFingerprint: string;
    /** Bytes of text the tool answered with. 0 for a call that never ran. */
    resultBytes: number;
    /** Wall-clock milliseconds. */
    durationMs: number;
    outcome: TraceOutcome;
    /**
     * The kind of project this ran against, when the host supplies it.
     *
     * Without it a finding like "this tool does nothing on EDS projects" is not
     * expressible — the trace would only say which tool ran, not what it ran
     * against. That exact bug shipped: `start_demo` reported success on EDS
     * storefronts, which have no local server.
     */
    projectShape?: string;
    /** Milliseconds since the recorder was created; orders the trace. */
    at: number;
}

/**
 * Hash a call's argument VALUES.
 *
 * Keys are sorted so argument order cannot change the fingerprint — an agent
 * that sends the same question with the fields swapped asked it twice, and the
 * trace has to say so.
 *
 * @param args - the call's arguments
 * @returns a short hex digest, or 'none' for a call with no arguments
 */
export function fingerprintArgs(args: unknown): string {
    if (!args || typeof args !== 'object') return 'none';
    const record = args as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length === 0) return 'none';
    const values = keys.map((k) => record[k]);
    // Values only, never keys — the keys are stored in the clear beside this,
    // so including them would add nothing and lengthen the preimage.
    return createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 16);
}

/** Bytes of text in an MCP tool result, or 0 when it carries none. */
export function resultByteLength(result: unknown): number {
    const content = (result as { content?: { text?: unknown }[] } | undefined)?.content;
    if (!Array.isArray(content)) return 0;
    let total = 0;
    for (const block of content) {
        // Buffer.byteLength, NOT .length: a JS string's length is UTF-16 code
        // units, so any multi-byte character under-reports. The same mismatch
        // is documented in `read_published_page`, measured against curl.
        if (typeof block?.text === 'string') total += Buffer.byteLength(block.text, 'utf8');
    }
    return total;
}

/** Records tool calls in memory, oldest dropped first. */
export class ToolTraceRecorder {
    private readonly entries: TraceEntry[] = [];

    private readonly startedAt = Date.now();

    /**
     * @param capacity - ring size; oldest entries drop first
     * @param sink - optional listener told about EVERY recorded entry (AI-2c:
     *   the durable file and the Agent Activity channel are two of these). A
     *   sink failure is swallowed — the trace exists to observe calls, and
     *   must never be the reason one fails.
     */
    constructor(
        private readonly capacity: number = TRACE_CAPACITY,
        private readonly sink?: (entry: TraceEntry) => void,
    ) {}

    /**
     * Record one completed call.
     *
     * @param entry - everything but `at`, which the recorder stamps
     */
    record(entry: Omit<TraceEntry, 'at'>): void {
        const stamped = { ...entry, at: Date.now() - this.startedAt };
        this.entries.push(stamped);
        if (this.entries.length > this.capacity) this.entries.shift();
        try {
            this.sink?.(stamped);
        } catch {
            // Deliberately silent — see the constructor docstring.
        }
    }

    /** Every call still held, oldest first. */
    all(): readonly TraceEntry[] {
        return this.entries;
    }

    /**
     * Calls that asked a question already asked — same tool, same arguments.
     *
     * The first occurrence is not waste; every later one is. Errors are
     * excluded: asking again after a failure is reasonable, and counting it
     * would report retries as waste.
     *
     * @returns the repeat entries, in the order they happened
     */
    repeats(): TraceEntry[] {
        const seen = new Set<string>();
        const repeated: TraceEntry[] = [];
        for (const e of this.entries) {
            if (e.outcome === 'error') continue;
            const key = `${e.tool}:${e.argumentFingerprint}`;
            if (seen.has(key)) repeated.push(e);
            else seen.add(key);
        }
        return repeated;
    }

    /** Drop everything — a new evaluation run starts from nothing. */
    clear(): void {
        this.entries.length = 0;
    }
}
