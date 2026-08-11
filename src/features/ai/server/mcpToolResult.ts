/**
 * mcpToolResult — the MCP tool result shape, in one place.
 *
 * Every tool in this directory returns the same envelope: a JSON-serialized value
 * wrapped as a single text content block. That two-line helper had been pasted
 * into EIGHT tool files (in two trivial variants — some declaring the return
 * type, some inferring it), which is what a duplication scan on 2026-07-31
 * surfaced.
 *
 * It takes no parameters because nothing about it varies: the whole point is that
 * every tool answers in one shape, so an agent parsing a response never has to
 * care which tool produced it.
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
