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
import type { Logger } from '@/types/logger';

export function makeLogger(): Logger {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as Logger;
}

/** Minimal newline-delimited JSON-RPC client over a connected socket. */
export class SocketRpc {
    private buf = '';

    private readonly pending = new Map<number, (msg: any) => void>();

    constructor(private readonly socket: net.Socket) {
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            this.buf += chunk;
            let idx: number;
            while ((idx = this.buf.indexOf('\n')) !== -1) {
                const line = this.buf.slice(0, idx);
                this.buf = this.buf.slice(idx + 1);
                if (!line.trim()) continue;
                const msg = JSON.parse(line);
                const resolve = msg.id != null ? this.pending.get(msg.id) : undefined;
                if (resolve) {
                    this.pending.delete(msg.id);
                    resolve(msg);
                }
            }
        });
    }

    request(id: number, method: string, params: unknown): Promise<any> {
        return new Promise((resolve) => {
            this.pending.set(id, resolve);
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
