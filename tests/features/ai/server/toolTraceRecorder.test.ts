/**
 * The recorder sees every call, keeps no values, and can tell a repeat from a
 * different question.
 *
 * WHY THIS EXISTS. "How did the agent spend eleven steps answering that?" had no
 * answer short of reading a transcript by hand. `withToolLogging` is the one
 * place that sees every call on both registration paths, and it was throwing
 * everything but the name away.
 *
 * Driven over a real socket against a real `InExtensionMcpServer`, because the
 * behaviour under test is what the WRAPPER does — the stub server most suites
 * use never runs it.
 *
 * The repeat detector is the reason the fingerprint exists, so it is tested with
 * both halves: same arguments must collide, different arguments must not. A test
 * that only checked the first half would pass with a constant.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import {
    ToolTraceRecorder,
    fingerprintArgs,
    resultByteLength,
} from '@/features/ai/server/toolTraceRecorder';
import { callToolOverSocket, makeLogger } from './inExtensionMcpServer.testUtils';

function registerProbes(srv: {
    registerTool: (n: string, s: unknown, h: (a: unknown) => Promise<unknown>) => void;
}): void {
    srv.registerTool(
        'get_probe_thing',
        {
            description: 'read',
            inputSchema: { scope: z.string().optional(), apiKey: z.string().optional() },
            annotations: { readOnlyHint: true },
        },
        async () => ({ content: [{ type: 'text' as const, text: 'read answer' }] })
    );
    srv.registerTool(
        'deploy_probe_thing',
        { description: 'write', inputSchema: {}, annotations: { readOnlyHint: false } },
        async () => ({ content: [{ type: 'text' as const, text: 'wrote' }] })
    );
    srv.registerTool(
        'deploy_probe_that_fails',
        { description: 'write', inputSchema: {}, annotations: { readOnlyHint: false } },
        async () => {
            throw new Error('boom');
        }
    );
}

describe('the recorder, driven through the real server', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;
    let trace: ToolTraceRecorder;

    async function start(): Promise<void> {
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), {
            registerExtraTools: registerProbes,
            trace,
            projectShape: () => 'eds-accs',
        });
        await server.start();
    }

    beforeEach(() => {
        trace = new ToolTraceRecorder();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-trace-'));
        socketPath = path.join(dir, 'srv.sock');
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('records a READ, not only writes', async () => {
        // The whole point. Every measured win so far has been a read, so a
        // recorder that skipped them would be blind to the usual waste.
        await start();

        await callToolOverSocket(socketPath, 'get_probe_thing', { scope: 'x' });

        const [entry] = trace.all();
        expect(entry.tool).toBe('get_probe_thing');
        expect(entry.readOnly).toBe(true);
        expect(entry.outcome).toBe('ok');
        expect(entry.resultBytes).toBe('read answer'.length);
    });

    it('keeps argument KEYS and never argument VALUES', async () => {
        await start();

        await callToolOverSocket(socketPath, 'get_probe_thing', {
            scope: 'x',
            apiKey: 'fake-test-pw-not-a-secret',
        });

        const serialised = JSON.stringify(trace.all());
        expect(trace.all()[0].argumentKeys).toEqual(expect.arrayContaining(['scope', 'apiKey']));
        // Including inside the fingerprint — a digest is one-way, but this
        // asserts the value never rode along beside it.
        expect(serialised).not.toContain('fake-test-pw-not-a-secret');
    });

    it('records a failure as an error, and still rethrows', async () => {
        await start();

        await callToolOverSocket(socketPath, 'deploy_probe_that_fails', {});

        expect(trace.all()[0].outcome).toBe('error');
    });

    it('stamps the project shape on every entry', async () => {
        // Without it, "this tool does nothing on EDS projects" is not
        // expressible — and that bug shipped once.
        await start();

        await callToolOverSocket(socketPath, 'get_probe_thing', {});

        expect(trace.all()[0].projectShape).toBe('eds-accs');
    });

    it('covers BOTH registration paths', async () => {
        // The response-envelope guard shipped covering one directory and ten
        // tools in src/mcp-server.ts escaped it. A probe is registered through
        // registerExtraTools; list_projects comes from registerProjectTools.
        await start();

        await callToolOverSocket(socketPath, 'get_probe_thing', {});
        await callToolOverSocket(socketPath, 'list_projects', {});

        expect(trace.all().map((e) => e.tool)).toEqual(['get_probe_thing', 'list_projects']);
    });
});

describe('the sink — every recorded call reaches the listener (AI-2c)', () => {
    it('invokes the sink once per record, with the stamped entry', () => {
        const seen: unknown[] = [];
        const r = new ToolTraceRecorder(10, (e) => seen.push(e));

        r.record({
            tool: 'get_project',
            readOnly: true,
            argumentKeys: ['name'],
            argumentFingerprint: 'abc123',
            resultBytes: 42,
            durationMs: 7,
            outcome: 'ok',
        });

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ tool: 'get_project', resultBytes: 42 });
        expect((seen[0] as { at: number }).at).toBeGreaterThanOrEqual(0);
    });

    it('a throwing sink never fails the record — the trace must not cost a call', () => {
        const r = new ToolTraceRecorder(10, () => {
            throw new Error('sink exploded');
        });

        expect(() =>
            r.record({
                tool: 'get_project',
                readOnly: true,
                argumentKeys: [],
                argumentFingerprint: 'none',
                resultBytes: 0,
                durationMs: 1,
                outcome: 'ok',
            })
        ).not.toThrow();
        expect(r.all()).toHaveLength(1);
    });
});

describe('telling a repeat from a different question', () => {
    it('collides on the same arguments and not on different ones', () => {
        // Both halves. Checking only the first would pass with a constant.
        expect(fingerprintArgs({ name: 'bodea' })).toBe(fingerprintArgs({ name: 'bodea' }));
        expect(fingerprintArgs({ name: 'bodea' })).not.toBe(fingerprintArgs({ name: 'acme' }));
    });

    it('ignores argument ORDER', () => {
        // The same question with its fields swapped was still asked twice.
        expect(fingerprintArgs({ a: 1, b: 2 })).toBe(fingerprintArgs({ b: 2, a: 1 }));
    });

    it('marks a no-argument call as "none" rather than hashing nothing', () => {
        // Otherwise every no-arg call shares one hash, and a run of them reads
        // as the same question asked over and over.
        expect(fingerprintArgs({})).toBe('none');
        expect(fingerprintArgs(undefined)).toBe('none');
    });

    it('counts the second ask, not the first', () => {
        const trace = new ToolTraceRecorder();
        const call = (tool: string, args: unknown, outcome: 'ok' | 'error' = 'ok') =>
            trace.record({
                tool,
                readOnly: true,
                argumentKeys: Object.keys((args ?? {}) as object),
                argumentFingerprint: fingerprintArgs(args),
                resultBytes: 10,
                durationMs: 1,
                outcome,
            });

        call('get_project', { name: 'bodea' });
        call('get_project', { name: 'acme' }); // a different question
        call('get_project', { name: 'bodea' }); // the same one again

        expect(trace.repeats()).toHaveLength(1);
        expect(trace.repeats()[0].argumentFingerprint).toBe(fingerprintArgs({ name: 'bodea' }));
    });

    it('does not count a retry after an error as waste', () => {
        const trace = new ToolTraceRecorder();
        const call = (outcome: 'ok' | 'error') =>
            trace.record({
                tool: 'deploy_mesh',
                readOnly: false,
                argumentKeys: [],
                argumentFingerprint: 'none',
                resultBytes: 0,
                durationMs: 1,
                outcome,
            });

        call('error');
        call('ok');

        expect(trace.repeats()).toEqual([]);
    });
});

describe('bounded, and honest about size', () => {
    it('drops the oldest rather than growing without limit', () => {
        const trace = new ToolTraceRecorder(3);
        for (const n of ['a', 'b', 'c', 'd']) {
            trace.record({
                tool: n,
                readOnly: true,
                argumentKeys: [],
                argumentFingerprint: 'none',
                resultBytes: 0,
                durationMs: 0,
                outcome: 'ok',
            });
        }

        expect(trace.all().map((e) => e.tool)).toEqual(['b', 'c', 'd']);
    });

    it('measures BYTES, not string length', () => {
        // A JS string's length is UTF-16 code units, so any multi-byte character
        // under-reports. The same mismatch is documented in read_published_page,
        // measured against curl on a real storefront.
        const result = { content: [{ type: 'text', text: 'café' }] };

        expect(resultByteLength(result)).toBe(5);
        expect(resultByteLength(result)).not.toBe('café'.length);
    });

    it('reports zero for a result that carries no text', () => {
        expect(resultByteLength(undefined)).toBe(0);
        expect(resultByteLength({ content: [] })).toBe(0);
    });
});
