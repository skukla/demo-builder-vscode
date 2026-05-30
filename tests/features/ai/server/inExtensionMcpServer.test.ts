/**
 * InExtensionMcpServer — transport integration tests.
 *
 * Exercises the real UDS transport end-to-end: start the server, drive it with
 * a minimal newline-delimited JSON-RPC client over a `net` socket (the same
 * framing the stdio→UDS proxy forwards), and assert the tool surface, socket
 * permissions, and disposal behavior.
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import type { HandlerContext, HandlerMap } from '@/types/handlers';
import type { Logger } from '@/types/logger';

function makeLogger(): Logger {
    return { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
}

/** Minimal newline-delimited JSON-RPC client over a connected socket. */
class SocketRpc {
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

async function connectAndInit(socketPath: string): Promise<{ socket: net.Socket; rpc: SocketRpc }> {
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

async function listToolsOverSocket(socketPath: string): Promise<string[]> {
    const { socket, rpc } = await connectAndInit(socketPath);
    const res = await rpc.request(2, 'tools/list', {});
    socket.end();
     
    return (res.result?.tools ?? []).map((t: any) => t.name);
}

async function callToolOverSocket(socketPath: string, name: string, args: unknown): Promise<string> {
    const { socket, rpc } = await connectAndInit(socketPath);
    const res = await rpc.request(2, 'tools/call', { name, arguments: args });
    socket.end();
    return res.result?.content?.[0]?.text ?? '';
}

describe('InExtensionMcpServer', () => {
    let socketPath: string;
    let projectsDir: string;
    let server: InExtensionMcpServer | undefined;

    beforeEach(() => {
        const id = Math.random().toString(16).slice(2, 10);
        socketPath = path.join(os.tmpdir(), `dbmcp-test-${id}.sock`);
        projectsDir = path.join(os.tmpdir(), `dbmcp-projects-${id}`);
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
    });

    it('serves the seven project tools over the socket', async () => {
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await server.start();

        const names = await listToolsOverSocket(socketPath);

        expect(names.sort()).toEqual(
            [
                'get_block_source',
                'get_component_config',
                'get_project',
                'list_blocks',
                'list_projects',
                'sync_storefront',
                'update_project_config',
            ].sort(),
        );
    });

    it('registers and dispatches injected descriptor tools (registerExtraTools)', async () => {
        const extraMap: HandlerMap = { ping: async () => ({ success: true, data: { pong: true } }) };
        const registerExtra = (mcpServer: unknown) =>
            registerDescriptorTools(
                mcpServer,
                [{ tool: 'ping_tool', description: 'test', map: extraMap, type: 'ping' }],
                () => ({}) as HandlerContext,
            );
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger(), registerExtra);
        await server.start();

        const names = await listToolsOverSocket(socketPath);
        expect(names).toContain('ping_tool');
        expect(names).toContain('list_projects'); // the 7 project tools still present

        const result = await callToolOverSocket(socketPath, 'ping_tool', {});
        expect(result).toBe('{"pong":true}');
    });

    it('creates the socket with 0600 permissions (owner-only)', async () => {
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await server.start();

        const mode = fs.statSync(socketPath).mode & 0o777;
        expect(mode).toBe(0o600);
    });

    it('dispose() closes the server — connections refused afterward', async () => {
        server = new InExtensionMcpServer(socketPath, projectsDir, makeLogger());
        await server.start();
        server.dispose();
        await new Promise((r) => setTimeout(r, 50));

        await expect(
            new Promise((resolve, reject) => {
                const s = net.connect(socketPath);
                s.once('connect', () => {
                    s.destroy();
                    resolve(undefined);
                });
                s.once('error', reject);
            }),
        ).rejects.toMatchObject({ code: expect.stringMatching(/ENOENT|ECONNREFUSED/) });
    });
});
