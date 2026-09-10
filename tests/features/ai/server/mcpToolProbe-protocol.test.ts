/**
 * mcpToolProbe — the wire protocol, against a scripted socket server.
 *
 * The sibling suite drives the probe against a real `InExtensionMcpServer`, which
 * proves it reads the live tool surface but can only ever produce ONE conversation:
 * a well-formed one. This suite owns the other half — what the probe SENDS, and what
 * it does with replies a real server is entitled to produce and a happy path never
 * shows: JSON-RPC noise, a reply sharing a write with the notification behind it, a
 * reply split across two chunks, an id nobody asked for, a `tools/list` result with
 * no usable tools, an absent socket, and a server that never answers.
 *
 * The server here is a raw `net` listener, so every byte in both directions is under
 * the test's control and the handshake can be asserted as ARGUMENTS rather than
 * inferred from the answer coming back.
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { probeInExtensionMcpTools } from '@/features/ai/server/mcpToolProbe';

/** Write raw bytes to the probe's connection. */
type Send = (raw: string) => void;
/** Called once per newline-delimited message the probe sends. */
type OnMessage = (msg: Record<string, unknown>, send: Send) => void;

interface Scripted {
    /** Every message the probe sent, in order. */
    received: Array<Record<string, unknown>>;
    socketPath: string;
}

const INITIALIZE_REQUEST = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'demo-builder-diagnostics', version: '1.0.0' },
    },
};
const INITIALIZED_NOTIFICATION = { jsonrpc: '2.0', method: 'notifications/initialized' };
const LIST_REQUEST = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

describe('probeInExtensionMcpTools — the wire protocol', () => {
    let dir: string;
    let servers: net.Server[];
    let sockets = 0;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-probe-wire-'));
        servers = [];
    });

    afterEach(async () => {
        await Promise.all(servers.map((s) => new Promise<void>((res) => s.close(() => res()))));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /** Listen on a fresh socket, parsing what the probe sends and replying by script. */
    async function start(onMessage: OnMessage): Promise<Scripted> {
        sockets += 1;
        const socketPath = path.join(dir, `srv-${sockets}.sock`);
        const received: Array<Record<string, unknown>> = [];
        const server = net.createServer((socket) => {
            socket.setEncoding('utf8');
            // The probe destroys its end the moment it settles; that surfaces here as
            // ECONNRESET/EPIPE and is not a failure of anything.
            socket.on('error', () => undefined);
            let buf = '';
            socket.on('data', (chunk: string) => {
                buf += chunk;
                let idx = buf.indexOf('\n');
                while (idx !== -1) {
                    const line = buf.slice(0, idx);
                    buf = buf.slice(idx + 1);
                    if (line.trim()) {
                        const msg = JSON.parse(line) as Record<string, unknown>;
                        received.push(msg);
                        onMessage(msg, (raw) => {
                            socket.write(raw);
                        });
                    }
                    idx = buf.indexOf('\n');
                }
            });
        });
        servers.push(server);
        await new Promise<void>((res) => {
            server.listen(socketPath, () => res());
        });
        return { received, socketPath };
    }

    /**
     * The ordinary two-request conversation, with the `tools/list` result under test.
     *
     * @param listResult the `result` member of the tools/list reply; `undefined` omits
     *   the member entirely, which is what a server that failed the call would send.
     * @param initTrailer extra bytes written in the SAME write as the initialize reply.
     */
    function conversation(listResult?: unknown, initTrailer = ''): OnMessage {
        return (msg, send) => {
            if (msg.method === 'initialize') {
                send(
                    `${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} })}\n${initTrailer}`
                );
            }
            if (msg.method === 'tools/list') {
                const reply: Record<string, unknown> = { jsonrpc: '2.0', id: msg.id };
                if (listResult !== undefined) {
                    reply.result = listResult;
                }
                send(`${JSON.stringify(reply)}\n`);
            }
        };
    }

    it('sends initialize, then the initialized notification, then tools/list', async () => {
        const { received, socketPath } = await start(conversation({ tools: [] }));

        const result = await probeInExtensionMcpTools(socketPath);

        expect(result.ok).toBe(true);
        expect(received).toStrictEqual([
            INITIALIZE_REQUEST,
            INITIALIZED_NOTIFICATION,
            LIST_REQUEST,
        ]);
    });

    it('returns the tool names sorted, dropping entries with no usable name', async () => {
        const tools = [
            { name: 'zeta' },
            { name: 'alpha' },
            {},
            null,
            'not-an-object',
            { name: '' },
        ];
        const { socketPath } = await start(conversation({ tools }));

        const result = await probeInExtensionMcpTools(socketPath);

        expect(result).toStrictEqual({ ok: true, tools: ['alpha', 'zeta'] });
    });

    it('reports an empty tool list when the reply carries no result at all', async () => {
        const { socketPath } = await start(conversation(undefined));

        const result = await probeInExtensionMcpTools(socketPath);

        expect(result).toStrictEqual({ ok: true, tools: [] });
    });

    it('reports an empty tool list when result.tools is absent or not an array', async () => {
        const absent = await start(conversation({}));
        const wrongType = await start(conversation({ tools: 'not-an-array' }));

        expect(await probeInExtensionMcpTools(absent.socketPath)).toStrictEqual({
            ok: true,
            tools: [],
        });
        expect(await probeInExtensionMcpTools(wrongType.socketPath)).toStrictEqual({
            ok: true,
            tools: [],
        });
    });

    it('ignores blank lines, non-JSON noise and replies to ids it never sent', async () => {
        const ghost = JSON.stringify({
            jsonrpc: '2.0',
            id: 99,
            result: { tools: [{ name: 'ghost' }] },
        });
        const { socketPath } = await start((msg, send) => {
            if (msg.method === 'initialize') {
                send('\n   \nnot json at all\n');
                send(`${ghost}\n`);
                send(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} })}\n`);
            }
            if (msg.method === 'tools/list') {
                send(
                    `${JSON.stringify({
                        jsonrpc: '2.0',
                        id: msg.id,
                        result: { tools: [{ name: 'real' }] },
                    })}\n`
                );
            }
        });

        const result = await probeInExtensionMcpTools(socketPath);

        expect(result).toStrictEqual({ ok: true, tools: ['real'] });
    });

    it('reads a reply that shares one write with the notification behind it', async () => {
        const trailer = `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress' })}\n`;
        const { socketPath } = await start(conversation({ tools: [{ name: 'only' }] }, trailer));

        const result = await probeInExtensionMcpTools(socketPath);

        expect(result).toStrictEqual({ ok: true, tools: ['only'] });
    });

    it('reads a reply that arrives split across two chunks', async () => {
        const { socketPath } = await start((msg, send) => {
            if (msg.method === 'initialize') {
                send(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} })}\n`);
            }
            if (msg.method === 'tools/list') {
                const raw = `${JSON.stringify({
                    jsonrpc: '2.0',
                    id: msg.id,
                    result: { tools: [{ name: 'split' }] },
                })}\n`;
                const half = Math.floor(raw.length / 2);
                send(raw.slice(0, half));
                setImmediate(() => send(raw.slice(half)));
            }
        });

        const result = await probeInExtensionMcpTools(socketPath);

        expect(result).toStrictEqual({ ok: true, tools: ['split'] });
    });

    it('reports the socket error when the path does not exist', async () => {
        const result = await probeInExtensionMcpTools(path.join(dir, 'absent.sock'), 5000);

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/ENOENT/);
        expect(result.tools).toBeUndefined();
    });

    it('times out when the server accepts the connection and never answers', async () => {
        const { socketPath } = await start(() => undefined);

        const result = await probeInExtensionMcpTools(socketPath, 150);

        expect(result).toStrictEqual({ ok: false, error: 'timed out after 150ms' });
    });
});
