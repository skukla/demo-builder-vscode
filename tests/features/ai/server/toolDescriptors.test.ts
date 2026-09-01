/**
 * Descriptor-driven tool registration tests.
 *
 * Verifies that a descriptor row becomes an MCP tool that dispatches to its
 * handler map, shapes the response (compact JSON / error text), and enforces
 * `confirm` gating — all without touching vscode.
 */

import { STATUS_DESCRIPTORS } from '@/features/ai/server/statusDescriptors';
import {
    defaultShape,
    registerDescriptorTools,
    type ToolDescriptor,
} from '@/features/ai/server/toolDescriptors';
import type { HandlerContext, HandlerMap, HandlerResponse } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

/** Fake McpServer capturing registrations. */
function fakeServer() {
    const tools = new Map<string, { inputSchema: any; handler: (args: any) => Promise<any> }>();
    return {
        registerTool(
            name: string,
            def: { inputSchema?: unknown },
            handler: (args: any) => Promise<any>
        ) {
            tools.set(name, { inputSchema: def.inputSchema, handler });
        },
        tools,
    };
}

const ctxFactory = () => createMockHandlerContext();

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

    it('keeps a failure that carries structured data — the needsAuth handoff survives', () => {
        /**
         * The regression this guards is not hypothetical. `dataInstallerHandlers`
         * returns exactly this shape from its headless branch, deliberately, so an
         * AGENT is told to sign in rather than prompted with a modal. Until
         * 2026-08-31 defaultShape rendered it as `Error: … [AUTH_REQUIRED]` and
         * dropped the marker, so the best auth handoff in the repo never reached
         * the agent that needed it.
         */
        const res = {
            success: false,
            error: 'Adobe sign-in required.',
            code: 'AUTH_REQUIRED',
            needsAuth: 'adobe',
        } as unknown as HandlerResponse;
        const out = JSON.parse(defaultShape(res));
        expect(out).toEqual({
            error: 'Adobe sign-in required.',
            code: 'AUTH_REQUIRED',
            needsAuth: 'adobe',
        });
    });

    it('CONTROL: a plain failure still gets the terse string, not JSON', () => {
        // The terse form is deliberate — this output is billed as context tokens
        // on every call. Only a failure carrying MORE than error/code earns JSON.
        const res = { success: false, error: 'plain' } as unknown as HandlerResponse;
        expect(defaultShape(res)).toBe('Error: plain');
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
            {
                needsAuth: false,
                tool: 'my_tool',
                description: 'x',
                map,
                type: 'my-type',
                readOnly: true,
            },
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
            [
                {
                    needsAuth: false,
                    tool: 'danger',
                    description: 'x',
                    map,
                    type: 'do-it',
                    confirm: true,
                    readOnly: false,
                },
            ],
            ctxFactory
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
                {
                    needsAuth: false,
                    tool: 'safe',
                    description: 'x',
                    map,
                    type: 't',
                    readOnly: true,
                },
                {
                    needsAuth: false,
                    tool: 'gated',
                    description: 'x',
                    map,
                    type: 't',
                    confirm: true,
                    readOnly: false,
                },
            ],
            ctxFactory
        );

        expect(server.tools.get('safe')!.inputSchema.confirm).toBeUndefined();
        expect(server.tools.get('gated')!.inputSchema.confirm).toBeDefined();
    });

    it('applies a custom shape when provided', async () => {
        const map: HandlerMap = { t: async () => ({ success: true, data: { n: 5 } }) };
        const server = fakeServer();
        registerDescriptorTools(
            server,
            [
                {
                    needsAuth: false,
                    tool: 'custom',
                    description: 'x',
                    map,
                    type: 't',
                    shape: () => 'SHAPED',
                    readOnly: true,
                },
            ],
            ctxFactory
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
        const tools = new Map<
            string,
            (a: unknown) => Promise<{ content: Array<{ text: string }> }>
        >();
        const server = {
            registerTool(
                name: string,
                _d: unknown,
                h: (a: unknown) => Promise<{ content: Array<{ text: string }> }>
            ) {
                tools.set(name, h);
            },
        };
        registerDescriptorTools(
            server,
            [
                {
                    needsAuth: false,
                    tool: 't',
                    description: 'd',
                    map: dispatchOnly,
                    type: 'check-thing',
                    ...row,
                } as ToolDescriptor,
            ],
            () => createMockHandlerContext({ sendMessage: async () => {} })
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

    it("lets the handler's own return win over the captured payload", async () => {
        const both: HandlerMap = {
            'check-thing': async (ctx: HandlerContext) => {
                await ctx.sendMessage('thing-status', { isReady: false });
                return { success: true, isReady: true };
            },
        };
        const tools = new Map<
            string,
            (a: unknown) => Promise<{ content: Array<{ text: string }> }>
        >();
        registerDescriptorTools(
            { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
            [
                {
                    needsAuth: false,
                    tool: 't',
                    description: 'd',
                    map: both,
                    type: 'check-thing',
                    capturePayloadFrom: 'thing-status',
                    readOnly: true,
                },
            ],
            () => createMockHandlerContext({ sendMessage: async () => {} })
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
        const tools = new Map<
            string,
            (a: unknown) => Promise<{ content: Array<{ text: string }> }>
        >();
        registerDescriptorTools(
            { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
            [
                {
                    needsAuth: false,
                    tool: 't',
                    description: 'd',
                    map: failing,
                    type: 'check-thing',
                    capturePayloadFrom: 'thing-status',
                    readOnly: true,
                },
            ],
            () => createMockHandlerContext({ sendMessage: async () => {} })
        );
        expect((await tools.get('t')!({})).content[0].text).toMatch(/^Error: nope/);
    });
});

// A captured payload can contradict the handler's return, and production does
// exactly that: `handleDiscoverStoreStructure` sends the discovery failure, then
// returns `{success:true}` because the HANDLER ran fine (`edsHandlers.ts:153`).
describe('capturePayloadFrom — when the payload disagrees with the return', () => {
    function run(sent: Record<string, unknown>, returned: HandlerResponse) {
        const map: HandlerMap = {
            'do-thing': async (ctx: HandlerContext) => {
                await ctx.sendMessage('thing-result', sent);
                return returned;
            },
        };
        const tools = new Map<
            string,
            (a: unknown) => Promise<{ content: Array<{ text: string }> }>
        >();
        registerDescriptorTools(
            { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
            [
                {
                    needsAuth: false,
                    tool: 't',
                    description: 'd',
                    map,
                    type: 'do-thing',
                    capturePayloadFrom: 'thing-result',
                    readOnly: false,
                },
            ],
            () => createMockHandlerContext({ sendMessage: async () => {} })
        );
        return tools.get('t')!({});
    }

    it('reports the operation failure, not the handler success', async () => {
        const out = await run(
            { success: false, error: 'Store discovery failed: 404' },
            { success: true }
        );
        expect(out.content[0].text).toMatch(/^Error: Store discovery failed: 404/);
    });

    it('never emits a success carrying a stray error field', async () => {
        const out = await run({ success: false, error: 'nope' }, { success: true });
        expect(out.content[0].text).not.toMatch(/^\{/);
    });

    it('still merges when the payload reports success', async () => {
        const out = await run({ success: true, stores: ['a', 'b'] }, { success: true });
        expect(JSON.parse(out.content[0].text)).toEqual({ stores: ['a', 'b'] });
    });
});

// A read tool must not carry a write on any branch. `checkGitHubApp` fires a
// code sync at the repo when Helix 404s unless `skipTrigger` is set, so the
// guard has to be un-overridable — a default the agent can turn off is not one.
describe('argDefaults', () => {
    function capture(row: Partial<ToolDescriptor>, sent: Record<string, unknown>) {
        const seen: Record<string, unknown>[] = [];
        const map: HandlerMap = {
            'do-thing': async (_ctx: HandlerContext, payload: unknown) => {
                seen.push(payload as Record<string, unknown>);
                return { success: true, ok: true };
            },
        };
        const tools = new Map<string, (a: unknown) => Promise<unknown>>();
        registerDescriptorTools(
            { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
            [
                {
                    needsAuth: false,
                    tool: 't',
                    description: 'd',
                    map,
                    type: 'do-thing',
                    ...row,
                } as ToolDescriptor,
            ],
            () => createMockHandlerContext({ sendMessage: async () => {} })
        );
        return tools.get('t')!(sent).then(() => seen[0]);
    }

    it('forces its values onto the handler payload', async () => {
        expect(await capture({ argDefaults: { skipTrigger: true } }, {})).toMatchObject({
            skipTrigger: true,
        });
    });

    it('OVERRIDES a caller trying to turn the guard off', async () => {
        expect(
            await capture({ argDefaults: { skipTrigger: true } }, { skipTrigger: false })
        ).toMatchObject({ skipTrigger: true });
    });

    it("leaves the caller's other arguments alone", async () => {
        expect(
            await capture({ argDefaults: { skipTrigger: true } }, { owner: 'me', repo: 'site' })
        ).toMatchObject({ owner: 'me', repo: 'site', skipTrigger: true });
    });

    it('changes nothing for a row that declares none', async () => {
        expect(await capture({}, { owner: 'me' })).toMatchObject({ owner: 'me' });
    });
});

// A capability that needs a person still gets a tool — it just refuses BEFORE
// dispatching. Shaping the result afterwards would be too late: the call has
// already happened with whatever the agent could supply.
describe('preflight', () => {
    const HANDOFF = { needsUser: { reason: 'secret-entry', what: 'Type the password' } };

    function build(row: Partial<ToolDescriptor>) {
        const ran: string[] = [];
        const map: HandlerMap = {
            'do-thing': async () => {
                ran.push('dispatched');
                return { success: true, data: 'real work' };
            },
        };
        const tools = new Map<
            string,
            (a: unknown) => Promise<{ content: Array<{ text: string }> }>
        >();
        registerDescriptorTools(
            { registerTool: (n: string, _d: unknown, h: never) => tools.set(n, h) },
            [
                {
                    needsAuth: false,
                    tool: 't',
                    description: 'd',
                    map,
                    type: 'do-thing',
                    ...row,
                } as ToolDescriptor,
            ],
            () => createMockHandlerContext({ sendMessage: async () => {} })
        );
        return { call: (a: unknown) => tools.get('t')!(a), ran };
    }

    it('returns the handoff and NEVER dispatches', async () => {
        const t = build({ preflight: () => HANDOFF });
        expect(JSON.parse((await t.call({})).content[0].text)).toEqual(HANDOFF);
        expect(t.ran).toEqual([]);
    });

    it('dispatches normally when preflight returns nothing', async () => {
        const t = build({ preflight: () => undefined });
        expect((await t.call({})).content[0].text).toBe('"real work"');
        expect(t.ran).toEqual(['dispatched']);
    });

    it('branches on the arguments', async () => {
        const t = build({ preflight: (a) => (a.backendType === 'paas' ? HANDOFF : undefined) });
        await t.call({ backendType: 'accs' });
        expect(t.ran).toEqual(['dispatched']);
        await t.call({ backendType: 'paas' });
        expect(t.ran).toEqual(['dispatched']);
    });

    // A preflight must not become a way around the confirm gate.
    it('an unconfirmed destructive row still refuses first', async () => {
        const t = build({ confirm: true, preflight: () => HANDOFF });
        expect((await t.call({})).content[0].text).toMatch(/requires confirm:true/);
        expect(t.ran).toEqual([]);
    });
});

// check_prerequisites is the clearest capture case on the surface: the handler
// runs every check, pushes the verdict, and returns a bare {success:true}.
describe('check_prerequisites wiring', () => {
    const row = STATUS_DESCRIPTORS.find((d) => d.tool === 'check_prerequisites')!;

    it('captures the completion event, or the tool would answer "{}"', () => {
        expect(row.capturePayloadFrom).toBe('prerequisites-complete');
    });

    // Without selectedStack the node-version mapping is {} and Node is reported
    // INSTALLED regardless of the machine (`shared.ts:268` → `checkHandler.ts:168-179`).
    // Optional here would ship a check that passes on a bare machine.
    it('requires selectedStack — optional would make it lie about Node', () => {
        expect(row.inputSchema?.selectedStack).toBeDefined();
        expect(row.inputSchema!.selectedStack.isOptional()).toBe(false);
    });

    it('leaves the genuinely optional arguments optional', () => {
        expect(row.inputSchema!.selectedOptionalDependencies.isOptional()).toBe(true);
        expect(row.inputSchema!.isRecheck.isOptional()).toBe(true);
    });

    it('is not confirm-gated — it only reads', () => {
        expect(row.confirm).toBeUndefined();
    });
});
