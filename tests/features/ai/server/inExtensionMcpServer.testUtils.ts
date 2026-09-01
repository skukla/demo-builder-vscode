/**
 * Shared client helpers for the InExtensionMcpServer suites.
 *
 * A minimal newline-delimited JSON-RPC client over a `net` socket — the same
 * framing the stdio→UDS proxy forwards. Extracted so the transport suite and the
 * socket-ownership suite drive the server identically; the ownership suite mocks
 * `fs/promises`, which is why it lives in its own file rather than alongside them.
 *
 * Not a `.test.ts` file, so Jest does not try to run it as a suite.
 */

import * as net from 'net';

/** Canonical logger fake (ADR-016); local name kept so consumers are unchanged. */
export { createMockLogger as makeLogger } from '../../../helpers/loggerFake';

/** Minimal newline-delimited JSON-RPC client over a connected socket. */
/**
 * Ceiling on one request/response over the test socket.
 *
 * Deliberately BELOW jest's 10s default: the point is that the RPC names what
 * failed before jest can only name the test.
 */
const RPC_TIMEOUT_MS = 4000;

export class SocketRpc {
    private buf = '';

    private readonly pending = new Map<
        number,
        { resolve: (msg: any) => void; reject: (err: Error) => void }
    >();

    /**
     * Server→client messages with no `id` — notifications. Previously dropped on
     * the floor, which made `notifications/progress` untestable: a suite could
     * only ever see the final result, exactly the blind spot that let agent
     * activity go unreported to the chat for so long.
     */
    readonly notifications: any[] = [];

    /** Rejects every in-flight request once the peer goes away. */
    private failure: Error | undefined;

    constructor(private readonly socket: net.Socket) {
        socket.setEncoding('utf8');

        /**
         * A CLOSED socket must fail the pending requests, not leave them hanging.
         *
         * This class listened only for `data` until 2026-09-01, so a peer that
         * accepted the connection and then closed WITHOUT replying left the promise
         * in `pending` unsettled forever. That is not hypothetical: the reload race
         * this suite exists to test produces exactly it — a client connects to the
         * outgoing server, writes `initialize`, and the outgoing server is disposed
         * before it answers.
         *
         * The result was a 10-second jest timeout naming the TEST, with no
         * indication of what hung, which is why the flake was recorded twice as
         * unreproduced. A failure that says "socket closed with 1 request in
         * flight" is a finding; a timeout is a mystery.
         */
        const fail = (reason: string) => {
            this.failure ??= new Error(
                `SocketRpc: ${reason} with ${this.pending.size} request(s) in flight`
            );
            for (const [, entry] of this.pending) entry.reject(this.failure);
            this.pending.clear();
        };
        socket.on('close', () => fail('socket closed'));
        socket.on('error', (err: Error) => fail(`socket error (${err.message})`));

        socket.on('data', (chunk: string) => {
            this.buf += chunk;
            let idx: number;
            while ((idx = this.buf.indexOf('\n')) !== -1) {
                const line = this.buf.slice(0, idx);
                this.buf = this.buf.slice(idx + 1);
                if (!line.trim()) continue;
                const msg = JSON.parse(line);
                if (msg.id == null) {
                    this.notifications.push(msg);
                    continue;
                }
                const entry = this.pending.get(msg.id);
                if (entry) {
                    this.pending.delete(msg.id);
                    entry.resolve(msg);
                }
            }
        });
    }

    request(id: number, method: string, params: unknown): Promise<any> {
        if (this.failure) return Promise.reject(this.failure);
        return new Promise((resolve, reject) => {
            // Bounded. Without this a server that stays CONNECTED but never answers
            // hangs just as silently as a closed one did — same mystery, different
            // cause — and the ceiling has to sit below jest's own limit or the
            // timeout still lands on the test rather than on the reason.
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`SocketRpc: no reply to "${method}" within ${RPC_TIMEOUT_MS}ms`));
            }, RPC_TIMEOUT_MS);

            this.pending.set(id, {
                resolve: (msg) => {
                    clearTimeout(timer);
                    resolve(msg);
                },
                reject: (err) => {
                    clearTimeout(timer);
                    reject(err);
                },
            });
            this.socket.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        });
    }

    notify(method: string, params?: unknown): void {
        this.socket.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    }
}

export async function connectAndInit(
    socketPath: string
): Promise<{ socket: net.Socket; rpc: SocketRpc }> {
    const socket = net.connect(socketPath);
    await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
    });
    const rpc = new SocketRpc(socket);
    await rpc.request(1, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
    });
    rpc.notify('notifications/initialized');
    return { socket, rpc };
}

/**
 * The `serverInfo` the server reports at `initialize` — the only field naming
 * WHICH extension host answered, since every window binds the same socket name.
 */
export async function serverInfoOverSocket(
    socketPath: string
): Promise<{ name: string; version: string }> {
    const socket = net.connect(socketPath);
    await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
    });
    const rpc = new SocketRpc(socket);
    const res = await rpc.request(1, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
    });
    socket.end();
    return res.result?.serverInfo;
}

export async function listToolsOverSocket(socketPath: string): Promise<string[]> {
    const { socket, rpc } = await connectAndInit(socketPath);
    const res = await rpc.request(2, 'tools/list', {});
    socket.end();

    return (res.result?.tools ?? []).map((t: any) => t.name);
}

export async function callToolOverSocket(
    socketPath: string,
    name: string,
    args: unknown
): Promise<string> {
    const { socket, rpc } = await connectAndInit(socketPath);
    const res = await rpc.request(2, 'tools/call', { name, arguments: args });
    socket.end();
    return res.result?.content?.[0]?.text ?? '';
}
