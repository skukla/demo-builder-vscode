/**
 * Descriptor-driven tool registration tests.
 *
 * Verifies that a descriptor row becomes an MCP tool that dispatches to its
 * handler map, shapes the response (compact JSON / error text), and enforces
 * `confirm` gating — all without touching vscode.
 */

import { defaultShape, registerDescriptorTools, type ToolDescriptor } from '@/features/ai/server/toolDescriptors';
import type { HandlerContext, HandlerMap, HandlerResponse } from '@/types/handlers';

/** Fake McpServer capturing registrations. */
function fakeServer() {
     
    const tools = new Map<string, { inputSchema: any; handler: (args: any) => Promise<any> }>();
    return {
         
        registerTool(name: string, def: { inputSchema: any }, handler: (args: any) => Promise<any>) {
            tools.set(name, { inputSchema: def.inputSchema, handler });
        },
        tools,
    };
}

const ctxFactory = () => ({}) as HandlerContext;

function textOf(result: { content: Array<{ text: string }> }): string {
    return result.content[0].text;
}

describe('defaultShape', () => {
    it('unwraps a lone data field to compact JSON', () => {
        expect(defaultShape({ success: true, data: { a: 1 } } as HandlerResponse)).toBe('{"a":1}');
    });

    it('strips the success flag and keeps remaining fields', () => {
        const res = { success: true, status: 'ok', count: 2 } as unknown as HandlerResponse;
        expect(defaultShape(res)).toBe('{"status":"ok","count":2}');
    });

    it('renders errors as terse text with the code', () => {
        const res = { success: false, error: 'nope', code: 'X1' } as unknown as HandlerResponse;
        expect(defaultShape(res)).toBe('Error: nope [X1]');
    });

    it('never pretty-prints (no newlines)', () => {
        const res = { success: true, data: { a: { b: [1, 2, 3] } } } as HandlerResponse;
        expect(defaultShape(res)).not.toContain('\n');
    });
});

describe('registerDescriptorTools', () => {
    it('registers each descriptor and dispatches to its handler map', async () => {
        const map: HandlerMap = {
            'my-type': async (_ctx, args) => ({ success: true, data: { echoed: args } }),
        };
        const descriptors: ToolDescriptor[] = [
            { tool: 'my_tool', description: 'x', map, type: 'my-type' },
        ];
        const server = fakeServer();

        registerDescriptorTools(server, descriptors, ctxFactory);

        expect(server.tools.has('my_tool')).toBe(true);
        const result = await server.tools.get('my_tool')!.handler({ foo: 'bar' });
        expect(textOf(result)).toBe('{"echoed":{"foo":"bar"}}');
    });

    it('refuses a confirm-gated tool unless confirm:true', async () => {
        const handler = jest.fn(async () => ({ success: true }));
        const map: HandlerMap = { 'do-it': handler };
        const server = fakeServer();

        registerDescriptorTools(
            server,
            [{ tool: 'danger', description: 'x', map, type: 'do-it', confirm: true }],
            ctxFactory,
        );

        const blocked = await server.tools.get('danger')!.handler({});
        expect(textOf(blocked)).toMatch(/requires confirm:true/);
        expect(handler).not.toHaveBeenCalled();

        const allowed = await server.tools.get('danger')!.handler({ confirm: true });
        expect(textOf(allowed)).toBeDefined();
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('adds a confirm field to the input schema only for gated tools', () => {
        const map: HandlerMap = { t: async () => ({ success: true }) };
        const server = fakeServer();
        registerDescriptorTools(
            server,
            [
                { tool: 'safe', description: 'x', map, type: 't' },
                { tool: 'gated', description: 'x', map, type: 't', confirm: true },
            ],
            ctxFactory,
        );

        expect(server.tools.get('safe')!.inputSchema.confirm).toBeUndefined();
        expect(server.tools.get('gated')!.inputSchema.confirm).toBeDefined();
    });

    it('applies a custom shape when provided', async () => {
        const map: HandlerMap = { t: async () => ({ success: true, data: { n: 5 } }) };
        const server = fakeServer();
        registerDescriptorTools(
            server,
            [{ tool: 'custom', description: 'x', map, type: 't', shape: () => 'SHAPED' }],
            ctxFactory,
        );

        const result = await server.tools.get('custom')!.handler({});
        expect(textOf(result)).toBe('SHAPED');
    });
});

// ─── capturePayloadFrom ──────────────────────────────────────────────────────
//
// The rule this replaces was wrong. Step 01 of phase 4 disqualified 21 handlers
// for pushing their result through sendMessage and returning {success:true} —
// but progressCapture already solves that, and createProjectTool has used it in
// production since it shipped. A dispatch-only handler is one descriptor field
// away from being a tool, and the handler is not modified.

describe('capturePayloadFrom', () => {
    /** A handler that computes an answer, pushes it, and returns bare success. */
    const dispatchOnly: HandlerMap = {
        'check-thing': async (ctx: HandlerContext) => {
            await ctx.sendMessage('thing-status', { isReady: true, detail: 'all good' });
            return { success: true };
        },
    };

    function serverFor(row: Partial<ToolDescriptor>) {
        const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
        const server = {
            registerTool(name: string, _d: unknown, h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>) {
                tools.set(name, h);
            },
        };
        registerDescriptorTools(
            server,
            [{ tool: 't', description: 'd', map: dispatchOnly, type: 'check-thing', ...row } as ToolDescriptor],
            () => ({ sendMessage: async () => {} }) as unknown as HandlerContext,
        );
        return async () => JSON.parse((await tools.get('t')!({})).content[0].text);
    }

    it('WITHOUT it, the tool returns nothing — the "cannot fail" defect', async () => {
        expect(await serverFor({})()).toEqual({});
    });

    it('WITH it, the pushed payload becomes the tool result', async () => {
        expect(await serverFor({ capturePayloadFrom: 'thing-status' })()).toEqual({
            isReady: true,
            detail: 'all good',
        });
    });

    it('ignores an event name that never fires, rather than inventing one', async () => {
        expect(await serverFor({ capturePayloadFrom: 'never-sent' })()).toEqual({});
    });

    it('lets the handler\'s own return win over the captured payload', async () => {
        const both: HandlerMap = {
            'check-thing': async (ctx: HandlerContext) => {
                await ctx.sendMessage('thing-status', { isReady: false });
                return { success: true, isReady: true };
            },
        };
        const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
        registerDescriptorTools(
            { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
            [{ tool: 't', description: 'd', map: both, type: 'check-thing', capturePayloadFrom: 'thing-status' }],
            () => ({ sendMessage: async () => {} }) as unknown as HandlerContext,
        );
        const out = JSON.parse((await tools.get('t')!({})).content[0].text);
        expect(out.isReady).toBe(true);
    });

    it('does not capture over an error result', async () => {
        const failing: HandlerMap = {
            'check-thing': async (ctx: HandlerContext) => {
                await ctx.sendMessage('thing-status', { isReady: true });
                return { success: false, error: 'nope' };
            },
        };
        const tools = new Map<string, (a: unknown) => Promise<{ content: Array<{ text: string }> }>>();
        registerDescriptorTools(
            { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
            [{ tool: 't', description: 'd', map: failing, type: 'check-thing', capturePayloadFrom: 'thing-status' }],
            () => ({ sendMessage: async () => {} }) as unknown as HandlerContext,
        );
        expect((await tools.get('t')!({})).content[0].text).toMatch(/^Error: nope/);
    });
});
