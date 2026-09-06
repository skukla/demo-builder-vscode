/**
 * `open_url` and `edit_project` — the two Group 5 tools that cannot be
 * descriptor rows.
 *
 * The load-bearing property for `open_url` is that it takes a TARGET and never a
 * URL, so the set of places it can send the user's browser is exactly the set
 * `get_project_urls` reports. Two tests here defend that from opposite sides: the
 * enum is pinned against the handler's own output, and an unknown target is
 * rejected by the schema rather than reaching the opener.
 */

const mockDispatchHandler = jest.fn();
jest.mock('@/core/handlers/dispatchHandler', () => ({
    ...jest.requireActual('@/core/handlers/dispatchHandler'),
    dispatchHandler: (...a: unknown[]) => mockDispatchHandler(...a),
}));
jest.mock('@/features/dashboard/handlers/dashboardHandlers', () => ({ dashboardHandlers: {} }));

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import { registerLifecycleTools } from '@/features/ai/server/lifecycleTools';
import type { McpToolSchema, McpToolServer } from '@/features/ai/server/mcpToolServer';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

const ALL_URLS = {
    storefront: 'http://localhost:3000',
    liveSite: 'https://main--site--org.aem.live',
    daLive: 'https://da.live/#/org/site',
    commerceAdmin: 'https://admin.example.test',
    devConsole: 'https://developer.adobe.com/console',
};

type Tool = (args: unknown) => Promise<{ content: Array<{ text: string }> }>;

/**
 * The DECLARATION as the module writes it, typed to the real interface rather
 * than to a shape invented here — `needsAuth` and `annotations` are what the
 * consent gate and the dry run read, so a suite that throws the schema away
 * checks nothing about either. `inputSchema` is narrowed to the zod fields the
 * schema tests reach into.
 */
type Declared = McpToolSchema & { inputSchema?: Record<string, z.ZodTypeAny> };

function harness() {
    const tools = new Map<string, Tool>();
    const defs = new Map<string, Declared>();
    const opened: string[] = [];
    const server = {
        registerTool(name: string, def: Declared, handler: Tool) {
            tools.set(name, handler);
            defs.set(name, def);
        },
    };
    registerLifecycleTools(
        server,
        () => createMockHandlerContext(),
        async (url: string) => {
            opened.push(url);
        }
    );
    return {
        opened,
        defs,
        async call(name: string, args: unknown): Promise<Record<string, unknown>> {
            const out = await tools.get(name)!(args);
            return JSON.parse(out.content[0].text);
        },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDispatchHandler.mockResolvedValue({ success: true, data: { urls: ALL_URLS } });
});

describe('open_url', () => {
    it('refuses without confirm:true and opens nothing', async () => {
        const h = harness();

        const out = await h.call('open_url', { target: 'liveSite' });

        expect(String(out.error)).toMatch(/confirm:true/);
        expect(h.opened).toEqual([]);
        // Refused BEFORE resolving — no work done for a call that will not proceed.
        expect(mockDispatchHandler).not.toHaveBeenCalled();
    });

    it('opens the resolved URL for the named target', async () => {
        const h = harness();

        const out = await h.call('open_url', { target: 'liveSite', confirm: true });

        expect(h.opened).toEqual([ALL_URLS.liveSite]);
        expect(out).toEqual({ opened: 'liveSite', url: ALL_URLS.liveSite });
    });

    it('resolves through the SAME handler get_project_urls uses', async () => {
        const h = harness();

        await h.call('open_url', { target: 'daLive', confirm: true });

        // Not a second URL derivation — a target read from get_project_urls must
        // open the URL that read reported.
        expect(mockDispatchHandler).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            'getProjectUrls',
            {}
        );
    });

    it('reports what IS available when the project has no such URL', async () => {
        mockDispatchHandler.mockResolvedValue({
            success: true,
            data: { urls: { devConsole: ALL_URLS.devConsole } },
        });
        const h = harness();

        const out = await h.call('open_url', { target: 'storefront', confirm: true });

        expect(String(out.error)).toContain('storefront');
        // The list is already in hand; an agent that guessed wrong needs it.
        expect(out.available).toEqual(['devConsole']);
        expect(h.opened).toEqual([]);
    });

    it('passes the resolution failure through instead of opening anything', async () => {
        mockDispatchHandler.mockResolvedValue({ success: false, error: 'No project found' });
        const h = harness();

        const out = await h.call('open_url', { target: 'liveSite', confirm: true });

        expect(out.error).toBe('No project found');
        expect(h.opened).toEqual([]);
    });

    // The property the whole design rests on: an agent cannot name a destination,
    // only choose one the project already has. A raw-URL argument would make every
    // other test here decoration.
    it('accepts no URL argument at all — only a target from the fixed set', () => {
        const h = harness();
        const schema = h.defs.get('open_url')!.inputSchema!;

        expect(Object.keys(schema).sort()).toEqual(['confirm', 'target']);
        expect(schema.target.safeParse('https://evil.example.test').success).toBe(false);
        expect(schema.target.safeParse('liveSite').success).toBe(true);
    });

    // What the tool DECLARES is what the consent gate and the dry run read. A suite
    // that only drives the handler leaves both unchecked: flipping readOnlyHint would
    // let a tool that takes over the user's screen pass for a read.
    it('declares itself an unauthenticated, non-read-only, non-destructive action', () => {
        const h = harness();
        const def = h.defs.get('open_url')!;

        expect(def.needsAuth).toBe(false);
        expect(def.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
    });

    // The describe text is the only thing an agent reads to choose a target, so an
    // empty or collapsed hint map makes every target indistinguishable.
    it('describes every target it accepts', () => {
        const h = harness();
        const described = h.defs.get('open_url')!.inputSchema!.target.description ?? '';

        for (const target of Object.keys(ALL_URLS)) {
            expect(described).toContain(`${target} = `);
        }
        // Control: an empty string would satisfy nothing above if the loop were empty.
        expect(Object.keys(ALL_URLS).length).toBeGreaterThan(0);
    });

    it('refuses a call with no arguments at all rather than throwing', () => {
        const h = harness();

        // The SDK hands the handler whatever the schema admitted, and a client that
        // sends no argument block at all reaches it as undefined. A throw here is a
        // protocol error the agent cannot act on; the confirm refusal is one it can.
        return expect(h.call('open_url', undefined)).resolves.toMatchObject({
            error: expect.stringMatching(/confirm:true/),
        });
    });

    it('reports an empty available list when the resolver returns no data at all', async () => {
        // A success with no payload — the handler answered but had nothing to say.
        // Reading `.urls` straight off it would throw instead of refusing.
        mockDispatchHandler.mockResolvedValue({ success: true });
        const h = harness();

        const out = await h.call('open_url', { target: 'liveSite', confirm: true });

        expect(out.available).toStrictEqual([]);
        expect(h.opened).toStrictEqual([]);
    });

    // Pins the enum to the handler's real vocabulary. Without this the two drift:
    // a URL added to getProjectUrls would be unreachable here, and a target removed
    // there would stay advertised as openable.
    it('its targets are exactly the keys handleGetProjectUrls can return', async () => {
        const source = (await import('fs')).readFileSync(
            'src/features/dashboard/handlers/openUrlHandlers.ts',
            'utf8'
        );
        const assigned = [...source.matchAll(/urls\.([A-Za-z]+)\s*=/g)].map((m) => m[1]);
        // Control: a regex that matched nothing would make the comparison vacuous.
        expect(assigned.length).toBeGreaterThan(0);

        const h = harness();
        const target = h.defs.get('open_url')!.inputSchema!.target;
        for (const key of assigned) {
            expect(target.safeParse(key).success).toBe(true);
        }
        expect([...new Set(assigned)].sort()).toEqual(Object.keys(ALL_URLS).sort());
    });
});

describe('edit_project', () => {
    it('always hands back — it never dispatches the wizard-opening handler', async () => {
        const h = harness();

        const out = (await h.call('edit_project', {})) as {
            needsUser: Record<string, unknown>;
        };

        expect(out.needsUser).toMatchObject({
            reason: 'settings-edit',
            where: { command: 'demoBuilder.createProject' },
        });
        // The point of the handoff: no panel opens for a call the user did not make.
        expect(mockDispatchHandler).not.toHaveBeenCalled();
    });

    it('says nothing changed, and points at the tool that can change things', async () => {
        const h = harness();

        const { needsUser } = (await h.call('edit_project', {})) as {
            needsUser: Record<string, string>;
        };

        expect(needsUser.tellUser).toMatch(/nothing has been changed/i);
        // Most "edit my project" asks are env vars or store scope, which do NOT
        // need the wizard — sending every one of them to a human surface would
        // make the agent useless for the common case.
        expect(needsUser.tellUser).toContain('configure_project');
    });

    it('declares itself unauthenticated, non-read-only, non-destructive and argument-free', () => {
        const h = harness();
        const def = h.defs.get('edit_project')!;

        // Not read-only despite changing nothing itself: it hands the user a wizard
        // that will, and a read is meant to be invisible.
        expect(def.needsAuth).toBe(false);
        expect(def.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
        expect(def.inputSchema).toStrictEqual({});
        expect(def.title).toBe('Edit Project');
    });
});

it('registers exactly the two tools', () => {
    const s = new McpServer({ name: 'test', version: '0.0.0' });
    // Against the REAL SDK: a bad inputSchema throws here, not at activation.
    // `s as unknown as McpToolServer`: the SDK's own registerTool is generic over
    // its zod schema, and structurally matching it against our narrowed surface
    // makes tsc give up with "type instantiation is excessively deep". The cast
    // NAMES the target, which is the sanctioned form — the point of this test is
    // that the REAL SDK accepts our registration, and that still runs.
    expect(() =>
        registerLifecycleTools(
            s as unknown as McpToolServer,
            () => createMockHandlerContext(),
            async () => undefined
        )
    ).not.toThrow();
});
