/**
 * The consent gate: who is asked, in what order, and what a refusal answers.
 *
 * A destructive call arriving with `confirm: true` is not allowed to just run.
 * The order is fixed and each step exists for a measured reason:
 *
 *   1. STANDING CONSENT first. Headless `claude -p` declares elicitation and
 *      then auto-declines it, so asking the chat first turned the owner's
 *      explicit `requireAgentConsent: false` into a guaranteed refusal.
 *   2. Then the CHAT, because that is the window the producer is looking at.
 *   3. Then the injected modal, only when the chat could not be asked. A chat
 *      refusal is final; "could not ask" is not a no.
 *
 * Driven over a real socket with a client that ANSWERS the server's
 * `elicitation/create` request, because a client that ignores it exercises the
 * two-minute timeout instead of the branch under test.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { connectAndInit, makeLogger, SocketRpc } from './inExtensionMcpServer.testUtils';

/** A real destructive tool name — the gate reads the authored copy table. */
const DESTRUCTIVE = 'reset_datapack';
/** A write tool with no authored consent copy — so it interrupts nobody. */
const HARMLESS = 'set_probe_harmless';

const ran = jest.fn();

function registerProbes(srv: {
    registerTool: (n: string, s: unknown, h: (a: unknown) => Promise<unknown>) => void;
}): void {
    const ok = async (args: unknown) => {
        ran(args);
        return { content: [{ type: 'text' as const, text: 'ran for real' }] };
    };
    for (const name of [DESTRUCTIVE, HARMLESS]) {
        srv.registerTool(
            name,
            {
                description: 'destructive probe',
                inputSchema: { confirm: z.boolean().optional() },
                annotations: { readOnlyHint: false },
            },
            ok,
        );
    }
}

describe('InExtensionMcpServer - the consent gate', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;

    const start = async (options: Record<string, unknown> = {}) => {
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), {
            registerExtraTools: registerProbes,
            ...options,
        });
        await server.start();
    };

    /**
     * Call a tool as a client that DECLARES elicitation and answers the ask
     * with `chatAction`. The answer is always registered: an unanswered ask
     * waits out the server's two-minute timeout and reports as "could not be
     * asked", which is a different branch from the one these tests mean.
     */
    const callAsChat = async (
        name: string,
        args: unknown,
        chatAction: 'accept' | 'cancel',
    ): Promise<string> => {
        const { socket, rpc } = await connectAndInit(socketPath, { elicitation: { form: {} } });
        rpc.answerRequest('elicitation/create', () => ({
            action: chatAction,
            ...(chatAction === 'accept' ? { content: { allow: true } } : {}),
        }));
        const res = await rpc.request(2, 'tools/call', { name, arguments: args });
        socket.end();
        return res.result?.content?.[0]?.text ?? JSON.stringify(res);
    };

    /** Call a tool as a plain client that cannot be asked anything. */
    const callPlain = async (name: string, args: unknown): Promise<string> => {
        const { socket, rpc } = await connectAndInit(socketPath);
        const res = await rpc.request(2, 'tools/call', { name, arguments: args });
        socket.end();
        return res.result?.content?.[0]?.text ?? JSON.stringify(res);
    };

    beforeEach(() => {
        ran.mockClear();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-consent-'));
        socketPath = path.join(dir, 'srv.sock');
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    describe('when nothing needs asking', () => {
        it('runs a destructive tool called without confirm — the handler refuses, not the gate', async () => {
            const gate = jest.fn();
            await start({ consentGate: gate });

            await callPlain(DESTRUCTIVE, {});

            expect(gate).not.toHaveBeenCalled();
            expect(ran).toHaveBeenCalledTimes(1);
        });

        it('runs a confirmed call to a tool with no authored consent copy', async () => {
            const gate = jest.fn();
            await start({ consentGate: gate });

            await callPlain(HARMLESS, { confirm: true });

            expect(gate).not.toHaveBeenCalled();
            expect(ran).toHaveBeenCalledTimes(1);
        });
    });

    describe('standing consent comes first', () => {
        it('runs without asking the chat or the modal when consent is not required', async () => {
            const gate = jest.fn();
            await start({ consentGate: gate, consentNotRequired: () => true });

            const text = await callAsChat(DESTRUCTIVE, { confirm: true }, 'cancel');

            expect(text).toBe('ran for real');
            expect(gate).not.toHaveBeenCalled();
            expect(ran).toHaveBeenCalledTimes(1);
        });

        it('still asks when the standing grant says consent IS required', async () => {
            const gate = jest.fn().mockResolvedValue({ allowed: true });
            await start({ consentGate: gate, consentNotRequired: () => false });

            await callPlain(DESTRUCTIVE, { confirm: true });

            expect(gate).toHaveBeenCalled();
        });
    });

    describe('the chat', () => {
        it('accepts in the chat and never consults the modal', async () => {
            const gate = jest.fn();
            await start({ consentGate: gate });

            const text = await callAsChat(DESTRUCTIVE, { confirm: true }, 'accept');

            expect(text).toBe('ran for real');
            expect(gate).not.toHaveBeenCalled();
            expect(ran).toHaveBeenCalledTimes(1);
        });

        it('refuses in the chat, answers the agent, and never consults the modal', async () => {
            const gate = jest.fn().mockResolvedValue({ allowed: true });
            await start({ consentGate: gate });

            const text = await callAsChat(DESTRUCTIVE, { confirm: true }, 'cancel');

            expect(text).toContain('was not approved');
            expect(text).toContain('Nothing was changed');
            expect(gate).not.toHaveBeenCalled();
            expect(ran).not.toHaveBeenCalled();
        });

        it('names the tool in the refusal so the agent knows what was declined', async () => {
            await start({});

            const text = await callAsChat(DESTRUCTIVE, { confirm: true }, 'cancel');

            expect(text).toContain(DESTRUCTIVE);
        });

        it('sends the ask against the tool being called', async () => {
            const seen: unknown[] = [];
            await start({});
            const { socket, rpc } = await connectAndInit(socketPath, {
                elicitation: { form: {} },
            });
            rpc.answerRequest('elicitation/create', (params) => {
                seen.push(params);
                return { action: 'accept', content: { allow: true } };
            });

            await rpc.request(2, 'tools/call', {
                name: DESTRUCTIVE,
                arguments: { confirm: true },
            });
            socket.end();

            expect(seen).toHaveLength(1);
            expect(JSON.stringify(seen[0])).toContain('allow');
        });
    });

    describe('the modal is the floor', () => {
        it('falls back to the modal when the client cannot be asked', async () => {
            const gate = jest.fn().mockResolvedValue({ allowed: true });
            await start({ consentGate: gate });

            const text = await callPlain(DESTRUCTIVE, { confirm: true });

            expect(gate).toHaveBeenCalledWith(DESTRUCTIVE, { confirm: true }, 'destructive probe');
            expect(text).toBe('ran for real');
        });

        it('answers the modal’s refusal instead of running', async () => {
            const refusal = { content: [{ type: 'text', text: 'the user said no' }] };
            const gate = jest.fn().mockResolvedValue({ allowed: false, refusal });
            await start({ consentGate: gate });

            const text = await callPlain(DESTRUCTIVE, { confirm: true });

            expect(text).toBe('the user said no');
            expect(ran).not.toHaveBeenCalled();
        });

        it('proceeds when no modal is wired at all — a missing gate is not a refusal', async () => {
            await start({});

            const text = await callPlain(DESTRUCTIVE, { confirm: true });

            expect(text).toBe('ran for real');
            expect(ran).toHaveBeenCalledTimes(1);
        });
    });
});

/** Keeps the unused-import checker honest about the type-only re-export. */
export type { SocketRpc };
