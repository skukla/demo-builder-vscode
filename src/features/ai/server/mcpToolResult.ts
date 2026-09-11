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

/** An MCP tool response: one text content block, and whether the call FAILED. */
export interface McpTextResult {
    content: Array<{ type: 'text'; text: string }>;
    /**
     * Set when the tool ran and failed — a "tool execution error" in MCP's terms.
     *
     * The protocol has two error mechanisms and they are not interchangeable. A
     * JSON-RPC error means the REQUEST was wrong (unknown tool, malformed call) and
     * is opaque to a model. `isError` on a normal result means the CALL ran and
     * failed, and the spec asks clients to hand those to the model: "Tool Execution
     * Errors contain actionable feedback that language models can use to self-correct
     * and retry with adjusted parameters ... Clients SHOULD provide tool execution
     * errors to language models to enable self-correction."
     *
     * Until 2026-09-11 this field did not exist here and was set nowhere in `src/`,
     * so every failed tool call returned as a SUCCESSFUL result whose text happened
     * to contain `success: false`. A client could not tell the two apart, which is
     * exactly the distinction it is asked to act on — and the agent lost its best
     * recovery path.
     *
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools
     */
    isError?: true;
}

/**
 * Did this answer represent a FAILED call?
 *
 * ONLY the top-level `success` counts, and that is the whole subtlety. Cancellation
 * is deliberately modelled as `{ success: true, data: { success: false, error:
 * 'cancelled' } }` — the handler ran and answered correctly, and the thing it reports
 * is that the user backed out. A check that recursed would mark every cancelled
 * operation as a tool failure and teach agents to retry something the user just
 * declined.
 */
function isFailedAnswer(value: unknown): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { success?: unknown }).success === false
    );
}

/**
 * Wrap a JSON-serializable value as an MCP text result.
 *
 * A value whose OWN `success` is `false` is marked as a tool execution error, because
 * this repo's handlers answer by returning `{ success, … }` (Pattern B) — so that
 * field already carries the fact, and translating it into the protocol's envelope is
 * a restatement rather than a new judgement.
 *
 * @param value - anything JSON-serializable; the tool's answer
 * @returns the MCP envelope carrying it
 */
export function asText(value: unknown): McpTextResult {
    const result: McpTextResult = {
        content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    };
    return isFailedAnswer(value) ? { ...result, isError: true } : result;
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
export function asRawText(text: string, options?: { isError?: true }): McpTextResult {
    const result: McpTextResult = { content: [{ type: 'text' as const, text }] };
    // Explicit rather than inferred: this takes a STRING, so there is no `success`
    // field to read. The caller knows whether the call failed and has to say so.
    return options?.isError ? { ...result, isError: true } : result;
}
