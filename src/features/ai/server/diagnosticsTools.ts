/**
 * Diagnostics tools — read the extension's own output channels.
 *
 * Born from a measured blindness (2026-08-27): `create_adobe_project` failed
 * opaquely and the real cause — a Console 400 naming the exact rule — sat in
 * the Debug Logs channel, unreachable from the agent surface. Eight diagnostic
 * calls were spent rediscovering what one read of the channel would have said.
 *
 * VS Code mirrors every LogOutputChannel to a file under the extension's log
 * directory (`context.logUri`), so this reads the complete record — including
 * debug/trace lines the in-memory export buffer deliberately drops — with no
 * logger changes and no second buffer. Channel writes are secret-sanitized at
 * write time (`sanitizeErrorForLogging`), so the file carries no raw tokens.
 *
 * vscode-free: the log directory path is injected from `extension.ts`.
 *
 * @module features/ai/server/diagnosticsTools
 */

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { asRawText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';

/**
 * Channel-name → on-disk filename. VS Code names the mirror file after the
 * channel with the ": " separator collapsed to a space (observed live:
 * "Demo Builder: Debug Logs" → "Demo Builder Debug Logs.log").
 */
const CHANNEL_FILES: Record<string, string> = {
    debug: 'Demo Builder Debug Logs.log',
    user: 'Demo Builder User Logs.log',
};

const DEFAULT_LINES = 120;
const MAX_LINES = 500;
/** Long lines (JSON dumps) are truncated so one entry cannot blow the response. */
const MAX_LINE_CHARS = 500;
/**
 * Hard byte cap on the whole response (newest lines win). 500 lines × 500 chars
 * would otherwise permit ~250KB — the no-page-size shape the response-size
 * audit calls out.
 */
const MAX_RESPONSE_BYTES = 45_000;

const STAMPED = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/u;
const BARE_TIME = /^\d{2}:\d{2}/u;

/**
 * A bound as the log writes it. A bare time ("09:30") is that time on the day of the log's newest line:
 * compared as written, it sorts after every dated stamp and the window comes back empty, which reads as
 * "nothing was logged" (2026-11-06, a live call).
 */
function onLogDay(lines: readonly string[], bound: unknown): unknown {
    if (typeof bound !== 'string' || !BARE_TIME.test(bound)) return bound;
    const newest = [...lines].reverse().find((line) => STAMPED.test(line));
    return newest ? `${newest.slice(0, 10)} ${bound}` : bound;
}

/**
 * The lines inside a time window, compared by the timestamp each line starts with (`2026-11-06
 * 09:38:29.127`, local time). A line without one (a stack trace's) goes with the line before it.
 * 2026-11-06: one install's timeline was read off the log file by hand, since runs interleave and 500
 * lines from the end held only the last one's tail.
 */
function inWindow(lines: readonly string[], sinceArg: unknown, untilArg: unknown): string[] {
    if (typeof sinceArg !== 'string' && typeof untilArg !== 'string') return [...lines];
    const since = onLogDay(lines, sinceArg);
    const until = onLogDay(lines, untilArg);
    const out: string[] = [];
    let keep = false;
    for (const line of lines) {
        const stamp = STAMPED.test(line) ? line.slice(0, 23) : undefined;
        if (stamp !== undefined)
            keep =
                (typeof since !== 'string' || stamp >= since) &&
                (typeof until !== 'string' || stamp < until);
        if (keep) out.push(line);
    }
    return out;
}

/** The most terms one filter list takes. */
const MAX_TERMS = 10;

/** The filter as a list of terms, as given: one string, a list, or none. */
function filterTerms(filter: unknown): string[] {
    if (typeof filter === 'string') return filter ? [filter] : [];
    return Array.isArray(filter)
        ? filter.filter((term): term is string => typeof term === 'string' && term.length > 0)
        : [];
}

/** Whether a line holds any of the terms (or every term, with `all`), ignoring case. */
function lineMatches(line: string, terms: readonly string[], all: boolean): boolean {
    if (terms.length === 0) return true;
    const lower = line.toLowerCase();
    const holds = (term: string): boolean => lower.includes(term.toLowerCase());
    return all ? terms.every(holds) : terms.some(holds);
}

/** The terms for the header, as the agent sent them: "a" or "b", "a" and "b". */
function termsLabel(terms: readonly string[], all: boolean): string {
    return terms.map((term) => `"${term}"`).join(all ? ' and ' : ' or ');
}

/**
 * Register `read_debug_logs` on `server`.
 *
 * @param server - McpServer (typed `any`; see registerProjectTools docstring)
 * @param logDirPath - the extension's log directory (`context.logUri.fsPath`)
 */
export function registerDiagnosticsTools(server: McpToolServer, logDirPath: string): void {
    server.registerTool(
        'read_debug_logs',
        {
            // Reviewed 2026-08-31: no service and no token on any path.
            needsAuth: false,
            annotations: { readOnlyHint: true, destructiveHint: false },
            title: 'Read Debug Logs',
            description:
                "The extension's own Debug Logs channel (or User Logs) — the complete record " +
                'of what it actually did. Use when a tool fails with a vague error: the real ' +
                'cause (an SDK 400, a spawn failure, a guard refusal) is usually logged here.',
            inputSchema: {
                channel: z
                    .enum(['debug', 'user'])
                    .optional()
                    .describe("Which channel to read (default 'debug' — the complete record)"),
                lines: z
                    .number()
                    .int()
                    .min(1)
                    .max(MAX_LINES)
                    .optional()
                    .describe(`How many trailing lines to return (default ${DEFAULT_LINES})`),
                filter: z
                    .union([
                        z.string().max(200),
                        z.array(z.string().max(200)).min(1).max(MAX_TERMS),
                    ])
                    .optional()
                    .describe(
                        'Case-insensitive substring, or a list of them; only matching lines count toward the tail ' +
                            '(e.g. "Entity Fetcher", "error", a tool name, "Data Installer #7" for one install). ' +
                            'A list keeps a line that matches ANY term, or EVERY term with matchAll: ' +
                            '["Data Installer #7", "error"] reads one install\'s errors in one call',
                    ),
                matchAll: z
                    .boolean()
                    .optional()
                    .describe(
                        'With a list in filter: keep only lines that match every term (default: any term)',
                    ),
                since: z
                    .string()
                    .max(23)
                    .optional()
                    .describe(
                        'Only lines at or after this local time, as the log writes it: "2026-11-06 09:30" (any leading part); a bare "09:30" is on the log\'s latest day',
                    ),
                until: z
                    .string()
                    .max(23)
                    .optional()
                    .describe('Only lines before this local time, the same form as since'),
                fromStart: z
                    .boolean()
                    .optional()
                    .describe(
                        'Return the first matching lines rather than the last: to read one run from its beginning',
                    ),
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            const channel = (args?.channel as string) ?? 'debug';
            const fileName = CHANNEL_FILES[channel] ?? CHANNEL_FILES.debug;
            const filePath = path.join(logDirPath, fileName);

            let content: string;
            try {
                content = await fsPromises.readFile(filePath, 'utf8');
            } catch {
                return asRawText(
                    `No channel log at ${fileName} — the window may be freshly started ` +
                        'and nothing has been logged yet.',
                );
            }

            const requested = Math.min(Number(args?.lines) || DEFAULT_LINES, MAX_LINES);
            const terms = filterTerms(args?.filter);
            const matchAll = args?.matchAll === true;

            const all = content.split('\n').filter((line) => line.trim().length > 0);
            const matched = inWindow(all, args?.since, args?.until).filter((line) =>
                lineMatches(line, terms, matchAll),
            );
            let tail = (
                args?.fromStart === true ? matched.slice(0, requested) : matched.slice(-requested)
            ).map((line) =>
                line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line,
            );
            // Enforce the byte cap from the end being read: the newest lines, or the first from the start.
            const fromStart = args?.fromStart === true;
            const ordered = fromStart ? tail : [...tail].reverse();
            // The header echoes the terms (up to ten of 200 characters), so they come out of
            // the same budget; with no filter this takes nothing off it.
            const label = terms.length > 0 ? termsLabel(terms, matchAll) : '';
            let budget = MAX_RESPONSE_BYTES - label.length;
            let kept = 0;
            while (kept < ordered.length && budget - ordered[kept].length - 1 > 0) {
                budget -= ordered[kept].length + 1;
                kept++;
            }
            tail = fromStart ? ordered.slice(0, kept) : ordered.slice(0, kept).reverse();

            const header =
                `--- ${fromStart ? 'first' : 'last'} ${tail.length} of ${matched.length} ` +
                `${label ? `lines matching ${label}` : 'lines'} (${fileName}) ---`;
            return asRawText([header, ...tail].join('\n'));
        },
    );
}
