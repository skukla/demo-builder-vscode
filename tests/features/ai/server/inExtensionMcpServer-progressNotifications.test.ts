/**
 * The chat is told what is running, while it runs.
 *
 * WHY THIS EXISTS. The extension already reported agent activity — a progress
 * notification, a status-bar message and a failure toast — entirely into the
 * VS Code window. A producer watching the chat, which is where they look while an
 * agent works, saw none of it: not which server, not which tool, not which phase
 * of a multi-minute operation.
 *
 * MCP's `notifications/progress` carries a `message` string. Both halves were
 * measured before this was built, because the protocol says a receiver "is not
 * obligated to provide these notifications": Claude Code supplies a
 * `progressToken`, and its interactive terminal renders the message live. Probe
 * kept at `.rptc/research/agent-activity-visibility/`.
 *
 * Driven over a real socket against a real `InExtensionMcpServer`. The stub
 * server most suites use cannot see any of this — it never sends a notification,
 * because it is not the SDK.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { connectAndInit } from './inExtensionMcpServer.testUtils';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

function registerProbes(srv: {
    registerTool: (n: string, s: unknown, h: (a: unknown) => Promise<unknown>) => void;
}): void {
    const ok = async () => ({ content: [{ type: 'text' as const, text: 'ran' }] });
    // A REAL tool name, not a made-up probe: narration comes from an authored
    // table with no name-derived fallback, so a fictional tool narrates nothing.
    // Using the real name means this also proves the shipped phrase.
    srv.registerTool(
        'deploy_mesh',
        { description: 'write', inputSchema: {}, annotations: { readOnlyHint: false } },
        ok
    );
    // A REAL read-tool name. An invented one has no authored phrase, so it
    // narrates nothing whatever the rule is — which is why the old version of
    // this suite passed both before and after reads started narrating.
    srv.registerTool(
        'list_projects_probe_unused',
        { description: 'read', inputSchema: {}, annotations: { readOnlyHint: true } },
        ok
    );
    srv.registerTool(
        'get_current_project',
        {
            description: 'read',
            inputSchema: { scope: z.string().optional() },
            annotations: { readOnlyHint: true },
        },
        ok
    );
}

/** Call a tool WITH a progress token, as a real client does, and collect notifications. */
async function callWithProgress(
    socketPath: string,
    name: string,
    args: unknown = {}
): Promise<{ progressMessages: string[]; ok: boolean }> {
    const { socket, rpc } = await connectAndInit(socketPath);
    const res = await rpc.request(2, 'tools/call', {
        name,
        arguments: args,
        _meta: { progressToken: 'tok-1' },
    });
    // Notifications arrive on the same connection before the result resolves.
    const progressMessages = rpc.notifications
        .filter((n) => n.method === 'notifications/progress')
        .map((n) => n.params?.message)
        .filter((m: unknown): m is string => typeof m === 'string');
    socket.end();
    return { progressMessages, ok: !!res.result };
}

describe('agent activity is reported to the chat', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-progress-'));
        socketPath = path.join(dir, 'srv.sock');
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), {
            registerExtraTools: registerProbes,
        });
        await server.start();
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('announces a write tool by name, attributed to this server', async () => {
        const { progressMessages, ok } = await callWithProgress(socketPath, 'deploy_mesh');

        expect(ok).toBe(true);
        // Attribution is the point: a chat can have several MCP servers connected,
        // and an unattributed "Deploying…" is ambiguous the moment it has two.
        expect(progressMessages).toContain('Demo Builder · Deploying the API mesh…');
    });

    it('announces READS too — the path is not the path without them', async () => {
        // Reads used to be silent, on the reasoning that a line per query is
        // noise. The owner corrected that on 2026-08-25: the whole point of this
        // feature is seeing the path an agent takes, and a path with its reads
        // removed is not the path.
        const { progressMessages, ok } = await callWithProgress(
            socketPath,
            'get_current_project',
            { scope: 'x' }
        );

        expect(ok).toBe(true);
        expect(progressMessages).toContain('Demo Builder · Checking which project is open…');
    });

    it('says nothing for a tool with no authored phrase', async () => {
        // The no-fallback rule: rather than deriving words from a tool name, a
        // tool without a phrase stays silent. This is also why a suite using
        // INVENTED tool names cannot test narration at all.
        const { progressMessages } = await callWithProgress(
            socketPath,
            'list_projects_probe_unused',
            {}
        );

        expect(progressMessages).toEqual([]);
    });

    it('still runs the tool when the client asks for no progress', async () => {
        // No `_meta.progressToken` — the client wants no notifications. The call
        // must be entirely unaffected; visibility is a courtesy, never a
        // precondition.
        const { socket, rpc } = await connectAndInit(socketPath);
        const res = await rpc.request(2, 'tools/call', {
            name: 'deploy_mesh',
            arguments: {},
        });
        const progress = rpc.notifications.filter((n) => n.method === 'notifications/progress');
        socket.end();

        expect(res.result).toBeDefined();
        expect(progress).toEqual([]);
    });
});
