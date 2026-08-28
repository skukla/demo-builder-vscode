/**
 * Unknown arguments must be REJECTED on write tools, never silently dropped.
 *
 * WHY THIS EXISTS. Measured against the real MCP SDK on 2026-08-24: a raw-shape
 * `inputSchema` is wrapped in `z.object(shape)`, which STRIPS. Call a tool with
 * `{scope: 'x', stroeScope: 'typo'}` and the handler receives `{scope: 'x'}` and
 * answers "ok". The agent believes it asked for something it did not, and finds
 * out through a wrong result rather than an error. 102 of 103 tools were shaped
 * that way; `mcp-tool-authoring` records the `{addons, stroeScope}` typo that
 * applied the addons and discarded the rest.
 *
 * Driven over a real socket against a real `InExtensionMcpServer`, because this
 * behaviour lives in the SDK's validation layer. The stub server most suites use
 * throws the schema away (`registerTool: (name, _def, handler) => ...`), so it
 * cannot see any of this — the same blind spot `realSdkRegistration.test.ts`
 * exists for.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { callToolOverSocket } from './inExtensionMcpServer.testUtils';
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

/** Records what each probe tool's handler actually received. */
const seen: Record<string, unknown> = {};

function registerProbes(srv: {
    registerTool: (n: string, s: unknown, h: (a: unknown) => Promise<unknown>) => void;
}): void {
    const ok = (name: string) => async (args: unknown) => {
        seen[name] = args;
        return { content: [{ type: 'text' as const, text: 'ran' }] };
    };

    // A write tool with declared arguments.
    srv.registerTool(
        'set_probe_value',
        { description: 'probe write', inputSchema: { scope: z.string() } },
        ok('set_probe_value')
    );

    // A write tool that declares NO arguments — republish/sync_content shape.
    srv.registerTool(
        'republish_probe',
        { description: 'probe no-arg write', inputSchema: {} },
        ok('republish_probe')
    );

    // A read tool, deliberately left permissive.
    srv.registerTool(
        'get_probe_value',
        { description: 'probe read', inputSchema: { scope: z.string() }, annotations: { readOnlyHint: true } },
        ok('get_probe_value')
    );
}

describe('write tools reject unknown arguments', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;

    beforeEach(async () => {
        for (const k of Object.keys(seen)) delete seen[k];
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-strict-'));
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

    it('refuses a misspelled argument instead of dropping it', async () => {
        const text = await callToolOverSocket(socketPath, 'set_probe_value', {
            scope: 'real',
            stroeScope: 'typo',
        });

        // The handler must not have run at all — a write that silently ignores
        // half its input is the failure this guards.
        expect(seen.set_probe_value).toBeUndefined();
        expect(text).toMatch(/stroeScope|unrecognized|Invalid arguments/i);
    });

    it('still runs when every argument is declared', async () => {
        await callToolOverSocket(socketPath, 'set_probe_value', { scope: 'real' });

        expect(seen.set_probe_value).toEqual({ scope: 'real' });
    });

    it('accepts confirm on a write tool that declares no arguments', async () => {
        // The generated guidance tells agents destructive tools take confirm:true,
        // and several write tools declare no arguments of their own. Strictifying
        // without allowing it would reject the very call the guidance asks for.
        await callToolOverSocket(socketPath, 'republish_probe', { confirm: true });

        expect(seen.republish_probe).toEqual({ confirm: true });
    });

    it('still refuses an unknown argument on a no-argument write tool', async () => {
        const text = await callToolOverSocket(socketPath, 'republish_probe', { notAThing: 1 });

        expect(seen.republish_probe).toBeUndefined();
        expect(text).toMatch(/notAThing|unrecognized|Invalid arguments/i);
    });

    it('leaves READ tools permissive', async () => {
        // Deliberate asymmetry: a dropped argument on a query produces a visibly
        // wrong answer, while a strict read tool mostly costs friction.
        await callToolOverSocket(socketPath, 'get_probe_value', {
            scope: 'real',
            stroeScope: 'typo',
        });

        expect(seen.get_probe_value).toEqual({ scope: 'real' });
    });
});
