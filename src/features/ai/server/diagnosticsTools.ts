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

/**
 * Register `read_debug_logs` on `server`.
 *
 * @param server - McpServer (typed `any`; see registerProjectTools docstring)
 * @param logDirPath - the extension's log directory (`context.logUri.fsPath`)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerDiagnosticsTools(server: any, logDirPath: string): void {
    server.registerTool(
        'read_debug_logs',
        {
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
                    .string()
                    .max(200)
                    .optional()
                    .describe(
                        'Case-insensitive substring; only matching lines count toward the tail ' +
                            '(e.g. "Entity Fetcher", "error", a tool name)',
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
            const filter = typeof args?.filter === 'string' ? args.filter.toLowerCase() : '';

            const all = content.split('\n').filter((line) => line.trim().length > 0);
            const matched = filter
                ? all.filter((line) => line.toLowerCase().includes(filter))
                : all;
            let tail = matched
                .slice(-requested)
                .map((line) =>
                    line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line,
                );
            // Enforce the byte cap newest-first: keep trailing lines while they fit.
            let budget = MAX_RESPONSE_BYTES;
            let keepFrom = tail.length;
            while (keepFrom > 0 && budget - tail[keepFrom - 1].length - 1 > 0) {
                budget -= tail[keepFrom - 1].length + 1;
                keepFrom--;
            }
            tail = tail.slice(keepFrom);

            const header =
                `--- last ${tail.length} of ${matched.length} ` +
                `${filter ? `lines matching "${args.filter}"` : 'lines'} (${fileName}) ---`;
            return asRawText([header, ...tail].join('\n'));
        },
    );
}
