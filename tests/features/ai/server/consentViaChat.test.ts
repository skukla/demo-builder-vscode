/**
 * Consent asked in the CHAT, with the VS Code modal as the floor.
 *
 * WHY THIS EXISTS. The modal opens in the VS Code window; the producer is
 * watching the terminal Claude session. A blocking prompt nobody is looking at
 * is worse than no prompt.
 *
 * THE RULE, and it is deliberately blunt: **anything that is not an explicit
 * `accept` is a refusal.** A server cannot tell "nobody was there" from "the
 * user said no" — both arrive as `cancel` (measured 2026-08-25: headless returns
 * cancel in ~5ms with no prompt shown). The spec defines three actions but only
 * cancel has ever been observed, so branching on the difference would be a guess.
 *
 * THE EXCEPTION that keeps the gate working: a client that cannot be ASKED is
 * `unavailable`, not a no. That falls back to the modal. A consent gate that
 * silently stops working is the worst available outcome.
 *
 * Driven over a real socket, because the elicitation has to actually cross the
 * wire — the stub server most suites use cannot send a request to its client.
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { SocketRpc, makeLogger } from './inExtensionMcpServer.testUtils';

/** Answers the server's elicitation with `action`, or ignores it entirely. */
async function callWithChatAnswering(
    socketPath: string,
    toolName: string,
    args: unknown,
    action: string | 'never-answer',
    declareElicitation = true,
): Promise<{ text: string; asked: boolean }> {
    const socket = net.connect(socketPath);
    await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
    });
    const rpc = new SocketRpc(socket);
    await rpc.request(1, 'initialize', {
        protocolVersion: '2024-11-05',
        // The capability under test — a client that does not declare it must
        // never be asked.
        capabilities: declareElicitation ? { elicitation: { form: {} } } : {},
        clientInfo: { name: 'test', version: '0.0.0' },
    });
    rpc.notify('notifications/initialized');

    let asked = false;
    // The server's elicitation arrives as a REQUEST from server to client, so it
    // is answered on the same socket rather than returned from ours.
    socket.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split('\n')) {
            if (!line.trim()) continue;
            let msg: { id?: unknown; method?: string };
            try {
                msg = JSON.parse(line);
            } catch {
                continue;
            }
            if (msg.method !== 'elicitation/create' || msg.id === undefined) continue;
            asked = true;
            if (action === 'never-answer') continue;
            socket.write(
                JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { action } }) + '\n',
            );
        }
    });

    const res = await rpc.request(2, 'tools/call', { name: toolName, arguments: args });
    socket.end();
    return { text: res.result?.content?.[0]?.text ?? '', asked };
}

const modalGate = jest.fn();

function registerProbe(srv: {
    registerTool: (n: string, s: unknown, h: (a: unknown) => Promise<unknown>) => void;
}): void {
    // `republish` is real, is in AGENT_ALERT_COPY, and needs no arguments —
    // so it exercises the "names the open project" branch too.
    srv.registerTool(
        'republish',
        {
            description: 'probe',
            inputSchema: { confirm: z.boolean().optional() },
            annotations: { readOnlyHint: false, destructiveHint: true },
        },
        async () => ({ content: [{ type: 'text' as const, text: 'republished' }] }),
    );
}

describe('consent in the chat', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;

    beforeEach(async () => {
        jest.clearAllMocks();
        modalGate.mockReset();
        modalGate.mockResolvedValue({ allowed: true });
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-chat-consent-'));
        socketPath = path.join(dir, 'srv.sock');
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), {
            registerExtraTools: registerProbe,
            consentGate: modalGate,
        });
        await server.start();
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('asks the CHAT, and runs the tool when the answer is accept', async () => {
        const { text, asked } = await callWithChatAnswering(
            socketPath,
            'republish',
            { confirm: true },
            'accept',
        );

        expect(asked).toBe(true);
        expect(text).toBe('republished');
        // The chat answered, so the window is never disturbed.
        expect(modalGate).not.toHaveBeenCalled();
    });

    it('treats DECLINE as a refusal, without falling through to the modal', async () => {
        const { text } = await callWithChatAnswering(
            socketPath,
            'republish',
            { confirm: true },
            'decline',
        );

        expect(text).toMatch(/not approved/i);
        expect(text).toMatch(/nothing was changed/i);
        // The whole point of not asking twice: a person who said no in the chat
        // must not then meet a dialog.
        expect(modalGate).not.toHaveBeenCalled();
    });

    it('treats CANCEL as a refusal too — the two cannot be told apart', async () => {
        // A server cannot distinguish "dismissed" from "nobody was there".
        // Anything that is not accept is a refusal, so both land here.
        const { text } = await callWithChatAnswering(
            socketPath,
            'republish',
            { confirm: true },
            'cancel',
        );

        expect(text).toMatch(/not approved/i);
        expect(modalGate).not.toHaveBeenCalled();
    });

    it('falls back to the MODAL when the client cannot be asked', async () => {
        // Not a refusal. A client with no elicitation capability is the case the
        // modal exists for, and a gate that silently stopped working would be
        // the worst outcome available.
        const { text, asked } = await callWithChatAnswering(
            socketPath,
            'republish',
            { confirm: true },
            'accept',
            false,
        );

        expect(asked).toBe(false);
        expect(modalGate).toHaveBeenCalledTimes(1);
        expect(text).toBe('republished');
    });

    it('the modal can still refuse after a fallback', async () => {
        modalGate.mockResolvedValue({
            allowed: false,
            refusal: { content: [{ type: 'text', text: 'declined in the window' }] },
        });

        const { text } = await callWithChatAnswering(
            socketPath,
            'republish',
            { confirm: true },
            'accept',
            false,
        );

        expect(text).toBe('declined in the window');
    });

    it('never asks at all when the call carries no confirm', async () => {
        // The gate fires on the destructive marker, not on every call.
        const { asked } = await callWithChatAnswering(socketPath, 'republish', {}, 'accept');

        expect(asked).toBe(false);
        expect(modalGate).not.toHaveBeenCalled();
    });
});
