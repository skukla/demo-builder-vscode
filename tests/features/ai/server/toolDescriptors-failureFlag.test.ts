/**
 * A failed call that comes back through a DESCRIPTOR ROW is reported as failed —
 * `isError: true` on the result `registerDescriptorTools` hands the SDK.
 *
 * The registrar half of `toolFailureEnvelope.test.ts`, which explains why the flag
 * exists and holds the half the two builders own. It lives here, named for the
 * module, because the registrar DECIDES the flag itself: `shape` returns a string,
 * so `asRawText` has to be told, and `res.success === false` in
 * `toolDescriptors.ts` is the last thing that still knows. Under the other name a
 * mutation measurement of this module could not see these five tests, and reported
 * every one of those decisions as unconstrained.
 *
 * THE TRAP. Only the TOP-LEVEL `success` counts. A cancellation is
 * `{ success: true, data: { success: false, error: 'cancelled' } }`, and marking it
 * would teach an agent to retry something a person just declined.
 */
import type { McpTextResult } from '@/features/ai/server/mcpToolResult';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import type { HandlerMap } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { fakeServer } from './toolDescriptors.testUtils';

/** Captures what the registrar hands the SDK, without an SDK. */
function capture(handlerResult: unknown, confirm?: true) {
    const server = fakeServer();
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
    return server.tools.get('probe_tool')!.handler;
}

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
