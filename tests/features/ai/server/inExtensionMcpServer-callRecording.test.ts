/**
 * Every tool call is recorded, and the write tools' schemas are tightened,
 * before either reaches a handler.
 *
 * Both live in `withToolLogging`, the one seam every registration passes
 * through — so they are driven here over a real socket against a real
 * `InExtensionMcpServer`. The stub server most suites use throws the schema
 * away and never records anything, so it cannot see any of this.
 *
 * The recorder must never be able to break a call: a call that fails is still
 * recorded, and a recorder that throws is still not the reason a tool fails.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { ToolTraceRecorder, type TraceEntry } from '@/features/ai/server/toolTraceRecorder';
import { callToolOverSocket, connectAndInit, makeLogger } from './inExtensionMcpServer.testUtils';

/** Tools the suites below drive. Names are irrelevant to what is under test. */
function registerProbes(srv: {
    registerTool: (n: string, s: unknown, h: (a: unknown) => Promise<unknown>) => void;
}): void {
    const ok = async () => ({ content: [{ type: 'text' as const, text: 'ran' }] });

    srv.registerTool(
        'set_probe_value',
        {
            description: 'write with a declared shape',
            inputSchema: { scope: z.string() },
            annotations: { readOnlyHint: false },
        },
        ok,
    );
    // A write tool whose inputSchema is ALREADY a built z.object, not a raw
    // shape — the other arm of the strictifier.
    srv.registerTool(
        'set_probe_object',
        {
            description: 'write with a built object schema',
            inputSchema: z.object({ scope: z.string() }),
            annotations: { readOnlyHint: false },
        },
        ok,
    );
    // A write tool that declares an EMPTY shape — the republish / sync_content
    // shape, and what a real no-argument tool looks like.
    srv.registerTool(
        'set_probe_noargs',
        {
            description: 'write with no arguments',
            inputSchema: {},
            annotations: { readOnlyHint: false },
        },
        ok,
    );
    // A tool that omits inputSchema ENTIRELY. Only listed, never called: the SDK
    // hands a schemaless tool's handler its `extra` in the args position, so a
    // call would record the SDK's own internals as argument keys. No shipped
    // tool is registered this way — mcp-tool-authoring requires a zod schema,
    // and the no-argument tools all declare `{}` like the probe above.
    srv.registerTool(
        'set_probe_schemaless',
        { description: 'write with no schema', annotations: { readOnlyHint: false } },
        ok,
    );
    srv.registerTool(
        'get_probe_value',
        {
            description: 'read',
            inputSchema: { scope: z.string() },
            annotations: { readOnlyHint: true },
        },
        ok,
    );
    srv.registerTool(
        'set_probe_explodes',
        {
            description: 'write that throws',
            inputSchema: {},
            annotations: { readOnlyHint: false },
        },
        async () => {
            throw new Error('probe blew up');
        },
    );
}

/** `tools/list` as a real client sees it. */
async function listedTools(
    socketPath: string,
): Promise<{ name: string; inputSchema?: { properties?: Record<string, unknown> } }[]> {
    const { socket, rpc } = await connectAndInit(socketPath);
    const res = await rpc.request(2, 'tools/list', {});
    socket.end();
    return res.result?.tools ?? [];
}

describe('InExtensionMcpServer - recording and schema tightening', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;
    let trace: ToolTraceRecorder;

    const start = async (options: Record<string, unknown> = {}) => {
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), {
            registerExtraTools: registerProbes,
            trace,
            ...options,
        });
        await server.start();
    };

    const entries = (): readonly TraceEntry[] => trace.all();
    const entryFor = (tool: string): TraceEntry | undefined =>
        entries().find((e) => e.tool === tool);

    beforeEach(() => {
        trace = new ToolTraceRecorder();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-record-'));
        socketPath = path.join(dir, 'srv.sock');
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    describe('what a recorded call says', () => {
        it('records a successful call with its arguments and what it declared', async () => {
            await start();

            await callToolOverSocket(socketPath, 'set_probe_value', { scope: 'demo' });

            expect(entryFor('set_probe_value')).toMatchObject({
                tool: 'set_probe_value',
                readOnly: false,
                argumentKeys: ['scope'],
                outcome: 'ok',
            });
        });

        it('records a read as a read', async () => {
            await start();

            await callToolOverSocket(socketPath, 'get_probe_value', { scope: 'demo' });

            expect(entryFor('get_probe_value')?.readOnly).toBe(true);
        });

        it('records how long the call took, not a clock reading', async () => {
            await start();

            await callToolOverSocket(socketPath, 'set_probe_value', { scope: 'demo' });

            const duration = entryFor('set_probe_value')?.durationMs ?? -1;
            expect(duration).toBeGreaterThanOrEqual(0);
            expect(duration).toBeLessThan(10_000);
        });

        it('records an empty argument list for a call that carried none', async () => {
            await start();

            await callToolOverSocket(socketPath, 'set_probe_noargs', {});

            expect(entryFor('set_probe_noargs')?.argumentKeys).toEqual([]);
        });

        it('records the project shape the host supplies', async () => {
            await start({ projectShape: () => 'eds' });

            await callToolOverSocket(socketPath, 'set_probe_value', { scope: 'demo' });

            expect(entryFor('set_probe_value')?.projectShape).toBe('eds');
        });

        it('records a call even when the host supplies no project shape', async () => {
            await start();

            await callToolOverSocket(socketPath, 'set_probe_value', { scope: 'demo' });

            expect(entryFor('set_probe_value')).toBeDefined();
            expect(entryFor('set_probe_value')?.projectShape).toBeUndefined();
        });

        it('records a call whose handler threw, as an error', async () => {
            await start();

            await callToolOverSocket(socketPath, 'set_probe_explodes', {}).catch(() => undefined);

            expect(entryFor('set_probe_explodes')).toMatchObject({
                outcome: 'error',
                resultBytes: 0,
            });
        });

        it('still fails the call when the handler throws', async () => {
            await start();

            const { socket, rpc } = await connectAndInit(socketPath);
            const res = await rpc.request(2, 'tools/call', {
                name: 'set_probe_explodes',
                arguments: {},
            });
            socket.end();

            expect(JSON.stringify(res)).toContain('probe blew up');
        });
    });

    describe('the recorder can never break a call', () => {
        it('answers normally when no recorder is wired at all', async () => {
            trace = undefined as unknown as ToolTraceRecorder;
            await start({ trace: undefined });

            const text = await callToolOverSocket(socketPath, 'set_probe_value', { scope: 'x' });

            expect(text).toBe('ran');
        });

        it('answers normally when the recorder itself throws', async () => {
            trace = {
                record: () => {
                    throw new Error('recorder is broken');
                },
                all: () => [],
            } as unknown as ToolTraceRecorder;
            await start();

            const text = await callToolOverSocket(socketPath, 'set_probe_value', { scope: 'x' });

            expect(text).toBe('ran');
        });
    });

    describe('write schemas reject what they did not declare', () => {
        it('rejects an unknown argument on a raw-shape write tool', async () => {
            await start();

            const text = await callToolOverSocket(socketPath, 'set_probe_value', {
                scope: 'x',
                stroeScope: 'typo',
            });

            expect(text).toContain('stroeScope');
        });

        it('rejects an unknown argument on a tool that declared a built object schema', async () => {
            await start();

            const text = await callToolOverSocket(socketPath, 'set_probe_object', {
                scope: 'x',
                stroeScope: 'typo',
            });

            expect(text).toContain('stroeScope');
        });

        it('accepts the declared argument on a built object schema', async () => {
            await start();

            const text = await callToolOverSocket(socketPath, 'set_probe_object', { scope: 'x' });

            expect(text).toBe('ran');
        });

        it('leaves a tool that declared no schema alone — no invented parameters', async () => {
            await start();

            const listed = await listedTools(socketPath);
            const schemaless = listed.find((t) => t.name === 'set_probe_schemaless');

            expect(schemaless).toBeDefined();
            expect(Object.keys(schemaless?.inputSchema?.properties ?? {})).toEqual([]);
        });

        it('gives a no-argument write tool room for the consent fields', async () => {
            await start();

            const listed = await listedTools(socketPath);
            const explodes = listed.find((t) => t.name === 'set_probe_explodes');

            expect(Object.keys(explodes?.inputSchema?.properties ?? {}).sort()).toEqual([
                'confirm',
                'confirmName',
            ]);
        });

        it('leaves a READ tool permissive', async () => {
            await start();

            const text = await callToolOverSocket(socketPath, 'get_probe_value', {
                scope: 'x',
                stroeScope: 'typo',
            });

            expect(text).toBe('ran');
        });
    });

    describe('the chat is told nothing when the client asked for nothing', () => {
        it('sends no progress notification without a progress token', async () => {
            await start();

            const { socket, rpc } = await connectAndInit(socketPath);
            await rpc.request(2, 'tools/call', {
                name: 'set_probe_value',
                arguments: { scope: 'x' },
            });
            const progress = rpc.notifications.filter(
                (n) => n.method === 'notifications/progress',
            );
            socket.end();

            expect(progress).toEqual([]);
        });
    });
});
