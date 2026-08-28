/**
 * The durable half of the agent activity record (AI-2c).
 *
 * The recorder captures every tool call in memory and dies with the window;
 * this sink writes each entry to a per-session file so "what did the agent do
 * yesterday?" has an answer. One JSON line per call, carrying the entry's own
 * fields plus an absolute timestamp (the in-memory `at` is relative on
 * purpose — it orders a session; a file needs wall-clock time).
 *
 * Privacy posture is UNCHANGED from the recorder: argument names and a
 * one-way fingerprint of values — never a value. The line is built from a
 * fixed field list, not by spreading the entry, so a future field cannot
 * reach disk without someone deciding it should (the privacy test pins this).
 *
 * Bounded twice: at most MAX_SESSIONS files are kept (oldest pruned at
 * startup), and a session stops recording after MAX_LINES with a final
 * truncation marker — an agent run wild must not fill a disk.
 *
 * vscode-free on purpose: constructed by extension.ts, testable without a
 * host.
 *
 * @module features/ai/server/agentTraceSink
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TraceEntry } from './toolTraceRecorder';

/** Sessions kept on disk; the oldest beyond this are pruned at startup. */
export const MAX_SESSIONS = 10;
/** Lines per session before the sink stops and marks truncation. */
export const MAX_LINES = 5000;

const FILE_PREFIX = 'agent-trace-';

/** What one persisted line carries. A fixed list — see the module docstring. */
export interface PersistedTraceLine {
    ts: string;
    tool: string;
    readOnly: boolean;
    argumentKeys: string[];
    argumentFingerprint: string;
    resultBytes: number;
    durationMs: number;
    outcome: string;
    projectShape?: string;
}

/** The handle extension.ts wires into the recorder. */
export interface AgentTraceFileSink {
    sink: (entry: TraceEntry) => void;
    /** Absolute path of this session's file. */
    file: string;
}

/** Session files in the directory, oldest first (the name embeds the time). */
export function listSessionFiles(dir: string): string[] {
    try {
        return fs
            .readdirSync(dir)
            .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith('.jsonl'))
            .sort();
    } catch {
        return [];
    }
}

/**
 * Create this session's trace file and the sink that appends to it.
 *
 * @param dir - where session files live (extension log storage)
 * @param now - injectable clock (tests); defaults to Date
 * @returns the sink and the session file's path
 */
export function createAgentTraceFileSink(
    dir: string,
    now: () => Date = () => new Date(),
): AgentTraceFileSink {
    fs.mkdirSync(dir, { recursive: true });

    // Prune to leave room for this session's file.
    const existing = listSessionFiles(dir);
    for (const stale of existing.slice(0, Math.max(0, existing.length - (MAX_SESSIONS - 1)))) {
        try {
            fs.rmSync(path.join(dir, stale));
        } catch {
            // A prune failure costs disk, not correctness.
        }
    }

    const file = path.join(dir, `${FILE_PREFIX}${now().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    let lines = 0;
    let truncated = false;

    const sink = (entry: TraceEntry): void => {
        if (truncated) return;
        if (lines >= MAX_LINES) {
            truncated = true;
            fs.appendFileSync(file, JSON.stringify({ truncated: true, atLine: lines }) + '\n');
            return;
        }
        const line: PersistedTraceLine = {
            ts: now().toISOString(),
            tool: entry.tool,
            readOnly: entry.readOnly,
            argumentKeys: entry.argumentKeys,
            argumentFingerprint: entry.argumentFingerprint,
            resultBytes: entry.resultBytes,
            durationMs: entry.durationMs,
            outcome: entry.outcome,
            ...(entry.projectShape ? { projectShape: entry.projectShape } : {}),
        };
        fs.appendFileSync(file, JSON.stringify(line) + '\n');
        lines++;
    };

    return { sink, file };
}
