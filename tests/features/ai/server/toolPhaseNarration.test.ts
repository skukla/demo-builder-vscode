/**
 * A long operation narrates its PHASES to the chat, not just its name.
 *
 * WHY THIS EXISTS. Announcing the tool once was only the transport. Long
 * operations already compute phase strings — "Reading mesh configuration…" —
 * and hand them to an `onProgress` callback that the dashboard wires into its
 * progress bar. The agent path passed no callback at all, so for an
 * agent-triggered call every one of those strings was computed and dropped: a
 * two-minute `create_project` announced itself once and then said nothing, in
 * the chat OR the VS Code notification, until it finished.
 *
 * Driven over a real socket against a real `InExtensionMcpServer`, because the
 * behaviour lives in the SDK's notification path. The stub server most suites
 * use never sends one.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { reportPhase } from '@/core/utils/agentPhaseChannel';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { connectAndInit } from './inExtensionMcpServer.testUtils';
import type { Logger } from '@/types/logger';

function makeLogger(): Logger {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    } as unknown as Logger;
}

/** Phases the VS Code notifier's reporter received, when one is wired. */
let notifierPhases: string[] = [];

function registerProbes(srv: {
    registerTool: (n: string, s: unknown, h: (a: unknown) => Promise<unknown>) => void;
}): void {
    // A tool that reports phases from DEEP inside its work — no reporter is
    // threaded through its signature, which is the whole point of the channel.
    srv.registerTool(
        'deploy_probe',
        { description: 'write with phases', inputSchema: {} },
        async () => {
            await Promise.resolve();
            reportPhase('Reading mesh configuration…');
            reportPhase('Deploying to Runtime…');
            return { content: [{ type: 'text' as const, text: 'done' }] };
        }
    );

    srv.registerTool('get_probe_thing', { description: 'read', inputSchema: {} }, async () => {
        reportPhase('should never be seen');
        return { content: [{ type: 'text' as const, text: 'read' }] };
    });
}

async function callWithProgress(socketPath: string, name: string): Promise<string[]> {
    const { socket, rpc } = await connectAndInit(socketPath);
    await rpc.request(2, 'tools/call', {
        name,
        arguments: {},
        _meta: { progressToken: 'tok-1' },
    });
    const messages = rpc.notifications
        .filter((n) => n.method === 'notifications/progress')
        .map((n) => n.params?.message)
        .filter((m: unknown): m is string => typeof m === 'string');
    socket.end();
    return messages;
}

describe('phases reach the chat', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;

    const start = async (withNotifier: boolean) => {
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), {
            registerExtraTools: registerProbes,
            ...(withNotifier
                ? {
                      longRunningNotifier: async (
                          _tool: string,
                          run: (report: (m: string) => void) => Promise<unknown>
                      ) => run((m) => notifierPhases.push(m)),
                  }
                : {}),
        });
        await server.start();
    };

    beforeEach(() => {
        notifierPhases = [];
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-phase-'));
        socketPath = path.join(dir, 'srv.sock');
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('sends each phase, attributed, after the opening line', async () => {
        await start(false);

        const messages = await callWithProgress(socketPath, 'deploy_probe');

        expect(messages[0]).toBe('Demo Builder · Deploy probe…');
        expect(messages).toContain('Demo Builder · Reading mesh configuration…');
        expect(messages).toContain('Demo Builder · Deploying to Runtime…');
    });

    it('delivers the same phases to the VS Code notifier', async () => {
        // Both destinations or neither: the phases were previously reaching the
        // notification only for UI-triggered work, and nowhere at all for agents.
        await start(true);

        await callWithProgress(socketPath, 'deploy_probe');

        expect(notifierPhases).toEqual([
            'Reading mesh configuration…',
            'Deploying to Runtime…',
        ]);
    });

    it('stays silent for read tools', async () => {
        await start(false);

        expect(await callWithProgress(socketPath, 'get_probe_thing')).toEqual([]);
    });

    it('does not leak phases between calls', async () => {
        // The channel is per-call async-local state. If it leaked, a later tool
        // would narrate an earlier one's steps.
        await start(false);

        await callWithProgress(socketPath, 'deploy_probe');
        const second = await callWithProgress(socketPath, 'get_probe_thing');

        expect(second).toEqual([]);
    });
});
