/**
 * A failed tool call is REPORTED as failed — `isError: true` on the result.
 *
 * NOT a duplicate of `responseEnvelope.test.ts`, and the neighbour was read first.
 * That suite owns the SHAPE — every tool answers in one `{content:[{type,text}]}`
 * envelope — and is indifferent to whether the call succeeded. This one owns the
 * FLAG, which is a different question with a different failure mode: a response can
 * be perfectly shaped and still lie about whether it worked.
 *
 * WHY IT EXISTS. MCP defines two error mechanisms. A JSON-RPC error means the REQUEST
 * was wrong — unknown tool, malformed call — and is opaque to a model. `isError` on a
 * normal result means the CALL ran and failed, and the specification asks clients to
 * treat those differently:
 *
 *   "Tool Execution Errors contain actionable feedback that language models can use to
 *    self-correct and retry with adjusted parameters ... Clients SHOULD provide tool
 *    execution errors to language models to enable self-correction."
 *
 * Until 2026-09-11 this repo set `isError` NOWHERE — measured, zero occurrences in
 * `src/`. Every failed tool call returned as a SUCCESSFUL result whose text happened
 * to contain `success: false`, so a client could not tell the two apart at the
 * protocol level and could not hand the failure back for self-correction. The agent
 * surface lost its best recovery path, silently, for as long as it has existed.
 *
 * THE TRAP THIS SUITE EXISTS TO HOLD. Only the TOP-LEVEL `success` counts.
 * Cancellation is deliberately modelled as `{ success: true, data: { success: false,
 * error: 'cancelled' } }` — the handler ran and answered correctly, and what it
 * reports is that the user backed out. A check that recursed would mark every
 * cancelled operation as a tool failure and teach agents to retry something a person
 * just declined. That case is pinned below and is the reason this is a suite rather
 * than a one-line assertion.
 *
 * @see https://modelcontextprotocol.io/specification/2025-11-25/server/tools
 * @see tests/features/ai/server/responseEnvelope.test.ts — the shape half
 */
import { asRawText, asText, type McpTextResult } from '@/features/ai/server/mcpToolResult';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import type { HandlerMap } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

/** Captures what the registrar hands the SDK, without an SDK. */
function capture(handlerResult: unknown, confirm?: true) {
    const tools = new Map<string, (args: unknown) => Promise<unknown>>();
    const server = {
        registerTool(name: string, _def: unknown, handler: (args: unknown) => Promise<unknown>) {
            tools.set(name, handler);
        },
    };
    const map = { probe: async () => handlerResult } as unknown as HandlerMap;

    registerDescriptorTools(
        server,
        [
            {
                needsAuth: false,
                tool: 'probe_tool',
                description: 'probe',
                map,
                type: 'probe',
                readOnly: true,
                ...(confirm ? { confirm: true } : {}),
            },
        ],
        () => createMockHandlerContext()
    );
    return tools.get('probe_tool')!;
}

describe('the builders declare failure', () => {
    it('asText marks a failed answer', () => {
        expect(asText({ success: false, error: 'nope' }).isError).toBe(true);
    });

    it('asText leaves a successful answer unmarked', () => {
        // Absent, not `false`. The protocol treats the field as optional, and an
        // explicit false on every success would be noise on the wire.
        expect(asText({ success: true, data: { a: 1 } }).isError).toBeUndefined();
    });

    // THE ONE THAT MATTERS. Cancellation carries a nested failure inside a success.
    it('asText does NOT mark a cancellation, whose failure is nested', () => {
        const cancelled = { success: true, data: { success: false, error: 'cancelled' } };
        expect(asText(cancelled).isError).toBeUndefined();
    });

    it('asText ignores non-objects and objects without success', () => {
        expect(asText('hi').isError).toBeUndefined();
        expect(asText(null).isError).toBeUndefined();
        expect(asText({ installed: false }).isError).toBeUndefined();
    });

    it('asRawText is told, never inferred — it is handed a string', () => {
        expect(asRawText('anything').isError).toBeUndefined();
        expect(asRawText('anything', { isError: true }).isError).toBe(true);
    });

    // Control: the assertions above must be capable of failing.
    it('control: the flag is readable and distinguishes the two cases', () => {
        expect(asText({ success: false }).isError).not.toEqual(asText({ success: true }).isError);
    });
});

describe('every descriptor row declares its failures', () => {
    it('marks a handler failure', async () => {
        const result = (await capture({ success: false, error: 'nope' })({})) as McpTextResult;
        expect(result.isError).toBe(true);
        // The text is unchanged — only the envelope now says it failed.
        expect(result.content[0].text).toContain('nope');
    });

    it('leaves a handler success unmarked', async () => {
        const result = (await capture({ success: true, data: { a: 1 } })({})) as McpTextResult;
        expect(result.isError).toBeUndefined();
    });

    it('does NOT mark a cancellation that came back through a descriptor', async () => {
        const result = (await capture({
            success: true,
            data: { success: false, error: 'cancelled' },
        })({})) as McpTextResult;
        expect(result.isError).toBeUndefined();
    });

    it('marks a confirm refusal — an input validation error the agent can correct', async () => {
        // MCP names input validation as a tool execution error, and the correction
        // here is mechanical: call again with confirm: true.
        const result = (await capture({ success: true }, true)({})) as McpTextResult;
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('requires confirm:true');
    });

    it('a confirmed call is not a refusal', async () => {
        const result = (await capture(
            { success: true, data: { ok: 1 } },
            true
        )({
            confirm: true,
        })) as McpTextResult;
        expect(result.isError).toBeUndefined();
    });
});
