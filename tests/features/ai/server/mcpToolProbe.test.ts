/**
 * mcpToolProbe — integration tests against a real InExtensionMcpServer.
 *
 * Starts the server on a temp UDS, then exercises the probe end-to-end (the
 * same initialize + tools/list handshake the diagnostics command uses) to
 * confirm it reports the live tool surface, surfaces extra-tool registrations
 * (e.g. sign_in), and fails cleanly when the socket is absent.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { probeInExtensionMcpTools } from '@/features/ai/server/mcpToolProbe';
import type { Logger } from '@/types/logger';

function makeLogger(): Logger {
    return { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
}

describe('probeInExtensionMcpTools', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-probe-'));
        socketPath = path.join(dir, 'srv.sock');
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('lists the base project tools from a running server (sorted)', async () => {
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger());
        await server.start();

        const result = await probeInExtensionMcpTools(socketPath);

        expect(result.ok).toBe(true);
        expect(result.tools).toEqual(
            expect.arrayContaining(['get_project', 'list_projects', 'promote_block_to_library', 'sync_storefront']),
        );
        // Names are returned sorted.
        expect(result.tools).toEqual([...(result.tools ?? [])].sort());
    });

    it('surfaces tools registered via the extra-tools hook (e.g. sign_in)', async () => {
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), (srv) => {
            srv.registerTool(
                'sign_in',
                { description: 'test sign-in tool', inputSchema: {} },
                async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }),
            );
        });
        await server.start();

        const result = await probeInExtensionMcpTools(socketPath);

        expect(result.ok).toBe(true);
        expect(result.tools).toContain('sign_in');
    });

    it('returns ok:false (no throw) when the socket does not exist', async () => {
        const result = await probeInExtensionMcpTools(path.join(dir, 'nope.sock'), 500);

        expect(result.ok).toBe(false);
        expect(result.error).toBeTruthy();
        expect(result.tools).toBeUndefined();
    });
});
