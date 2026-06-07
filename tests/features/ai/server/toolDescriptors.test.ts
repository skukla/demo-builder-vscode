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
