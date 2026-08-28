/**
 * `get_agent_trace` — what did the agent actually do? (AI-2c)
 *
 * Serves the activity record the server keeps of every tool call: the current
 * session from the in-memory recorder, past sessions from the files the
 * {@link createAgentTraceFileSink} keeps. The record carries names, argument
 * KEYS, a one-way fingerprint of values, sizes, durations and outcomes —
 * never argument values, so serving it re-exposes nothing.
 *
 * Bounded on purpose: `limit` caps entries (default 50, max 200), so the
 * response cannot outgrow its ceiling however long the session ran. The
 * repeats count rides along because "asked the same thing twice" is the
 * single most useful waste signal the record holds.
 *
 * @module features/ai/server/agentTraceTool
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { listSessionFiles } from './agentTraceSink';
import { asText } from './mcpToolResult';
import type { ToolTraceRecorder } from './toolTraceRecorder';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Register `get_agent_trace`.
 *
 * @param server - McpServer (typed `any`; see registerProjectTools docstring)
 * @param recorder - the live per-window recorder
 * @param traceDir - where the file sink keeps past sessions
 */
export function registerAgentTraceTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    recorder: ToolTraceRecorder,
    traceDir: string,
): void {
    server.registerTool(
        'get_agent_trace',
        {
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Get Agent Trace',
            description:
                'The activity record of tool calls agents have made this session (or a past one): ' +
                'tool, argument names, result size, duration, outcome — never argument values. ' +
                'Use to review what was done, answer "what did you just do?", or spot repeated ' +
                'calls. Pass session (a filename from sessions[]) to read a past session.',
            inputSchema: {
                limit: z
                    .number()
                    .optional()
                    .describe(
                        `Newest entries to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
                    ),
                session: z
                    .string()
                    .optional()
                    .describe(
                        'A past session file name from sessions[]; omit for the live session',
                    ),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const limit = Math.min(Math.max(1, Number(args?.limit) || DEFAULT_LIMIT), MAX_LIMIT);
            const sessions = listSessionFiles(traceDir);

            if (args?.session) {
                const name = String(args.session);
                // The list is the allowlist — no path from an argument.
                if (!sessions.includes(name)) {
                    return asText({
                        error: `Unknown session "${name}". Pick one of sessions[].`,
                        sessions,
                    });
                }
                const lines = fs
                    .readFileSync(path.join(traceDir, name), 'utf8')
                    .trim()
                    .split('\n')
                    .filter(Boolean)
                    .map((l) => JSON.parse(l) as Record<string, unknown>);
                return asText({ session: name, entries: lines.slice(-limit), sessions });
            }

            const all = recorder.all();
            return asText({
                session: 'live',
                totalThisSession: all.length,
                repeatsThisSession: recorder.repeats().length,
                entries: all.slice(-limit),
                sessions,
            });
        },
    );
}
