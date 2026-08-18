/**
 * mcpToolResult — the MCP tool result shape, in one place.
 *
 * Every tool returns the same envelope: a single text content block. That
 * two-line helper had been pasted into EIGHT tool files (in two trivial variants
 * — some declaring the return type, some inferring it), which is what a
 * duplication scan on 2026-07-31 surfaced. By 2026-08-17 it had grown BACK into
 * ten, one of them a byte-identical copy under this same name.
 *
 * ONE envelope, TWO ways to fill it, and the split is not decoration:
 *
 *   `asText`     — a value this call serializes. The overwhelming default.
 *   `asRawText`  — a string that is ALREADY the final text. Two real cases: a
 *                  confirm refusal or error written as prose, and the descriptor
 *                  registrar's `shape()` output, which is pre-stringified JSON.
 *
 * So an agent cannot assume every response parses as JSON — refusals are prose.
 * It CAN assume the envelope: `responseEnvelope.test.ts` checks the 46 descriptor
 * rows at runtime and every registrar module at the source, in BOTH halves — this
 * directory and `src/mcp-server.ts`. That second half is named there explicitly,
 * because the first version of the guard scanned this directory only and its ten
 * tools escaped.
 *
 * @module features/ai/server/mcpToolResult
 */

/** An MCP tool response: one text content block. */
export interface McpTextResult {
    content: Array<{ type: 'text'; text: string }>;
}

/**
 * Wrap a JSON-serializable value as an MCP text result.
 *
 * @param value - anything JSON-serializable; the tool's answer
 * @returns the MCP envelope carrying it
 */
export function asText(value: unknown): McpTextResult {
    return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

/**
 * Wrap text that is already final — do NOT serialize it again.
 *
 * Use for prose (a confirm refusal, an error sentence the agent reads rather
 * than parses) and for JSON a caller has already stringified. Passing an object
 * here would answer `[object Object]`, which is why the parameter is `string`.
 *
 * @param text - the exact text the agent receives
 * @returns the MCP envelope carrying it
 */
export function asRawText(text: string): McpTextResult {
    return { content: [{ type: 'text' as const, text }] };
}
