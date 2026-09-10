/**
 * read_debug_logs — the agent's window into the extension's own channel logs.
 *
 * The tool reads VS Code's on-disk mirror of the output channels (files under
 * context.logUri named after the channel), so the fixture is a real temp file,
 * not a mocked fs — the read path IS the thing under test.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ZodTypeAny } from 'zod';
import { registerDiagnosticsTools } from '@/features/ai/server/diagnosticsTools';

/** The tool DEFINITION, as the registrar declares it. */
interface ToolDefinition {
    needsAuth?: boolean;
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
    title?: string;
    description?: string;
    inputSchema?: Record<string, ZodTypeAny>;
}

function fakeServer() {
    const tools = new Map<
        string,
         
        (args: any) => Promise<{ content: Array<{ text: string }> }>
    >();
    const defs = new Map<string, ToolDefinition>();
    return {
        registerTool(
            name: string,
            def: unknown,
             
            handler: (args: any) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
            defs.set(name, def as ToolDefinition);
        },
        text(name: string, args?: unknown) {
            return tools.get(name)!(args);
        },
        def(name: string): ToolDefinition {
            return defs.get(name)!;
        },
        tools,
    };
}

describe('registerDiagnosticsTools (read_debug_logs)', () => {
    let logDir: string;

    beforeEach(() => {
        logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-diag-'));
    });

    afterEach(() => {
        fs.rmSync(logDir, { recursive: true, force: true });
    });

    function writeDebugLog(lines: string[]): void {
        fs.writeFileSync(path.join(logDir, 'Demo Builder Debug Logs.log'), lines.join('\n'));
    }

    it('returns the tail of the debug channel with a counted header', async () => {
        writeDebugLog(['one', 'two', 'three', 'four']);
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs', { lines: 2 });

        const text = result.content[0].text;
        expect(text).toContain('last 2 of 4 lines');
        expect(text).toContain('three\nfour');
        expect(text).not.toContain('two\nthree\nfour');
    });

    it('filters case-insensitively BEFORE taking the tail', async () => {
        writeDebugLog([
            '[info] noise 1',
            '[error] Failed to create project',
            '[info] noise 2',
            '[error] Error: 400 - Bad Request ("Project name length must be less than 20")',
        ]);
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs', { filter: 'ERROR' });

        const text = result.content[0].text;
        expect(text).toContain('last 2 of 2 lines matching "ERROR"');
        expect(text).toContain('Project name length must be less than 20');
        expect(text).not.toContain('noise');
    });

    it('reads the user channel when asked', async () => {
        fs.writeFileSync(path.join(logDir, 'Demo Builder User Logs.log'), 'user-facing line');
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs', { channel: 'user' });

        expect(result.content[0].text).toContain('user-facing line');
        expect(result.content[0].text).toContain('User Logs.log');
    });

    it('answers helpfully (not an exception) when the channel file does not exist', async () => {
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs', {});

        expect(result.content[0].text).toContain('No channel log');
    });

    it('truncates pathological lines so one JSON dump cannot blow the response', async () => {
        writeDebugLog(['short', `long ${'x'.repeat(2000)}`]);
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs', {});

        const longLine = result.content[0].text.split('\n').find((l) => l.startsWith('long '));
        expect(longLine!.length).toBeLessThanOrEqual(501); // 500 chars + ellipsis
    });

    // A line of EXACTLY the cap is not pathological — truncating it would append
    // an ellipsis to a line that already fits, which is the off-by-one the
    // boundary test exists to hold.
    it('leaves a line of exactly the cap alone', async () => {
        writeDebugLog(['y'.repeat(500)]);
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs', {});

        expect(result.content[0].text).not.toContain('\u2026');
    });

    it('drops blank and whitespace-only lines before counting', async () => {
        writeDebugLog(['one', '', '   ', 'two', '']);
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs', {});

        expect(result.content[0].text).toContain('last 2 of 2 lines');
    });

    // Called with NO argument object at all — the shape an MCP client sends for a
    // tool whose every input is optional. Every `args?.` in the handler is what
    // stands between that and a TypeError.
    it('reads with defaults when called with no arguments', async () => {
        writeDebugLog(['alpha', 'beta']);
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs');

        expect(result.content[0].text).toContain('last 2 of 2 lines');
        expect(result.content[0].text).toContain('beta');
    });
});

/**
 * The response byte cap, which is the only thing standing between an agent and a
 * 250KB tool result (500 lines x 500 chars). The loop walks the tail backwards
 * keeping lines while they fit, so its arithmetic — not merely its existence —
 * decides how much comes back.
 *
 * 374-character lines are chosen so the budget lands EXACTLY on zero at the
 * boundary: 45,000 = 120 x 375. That makes the strict/loose comparison
 * distinguishable (119 lines against 120), which equal-ish line lengths would
 * not.
 */
describe('read_debug_logs — the response byte cap', () => {
    let logDir: string;

    beforeEach(() => {
        logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-diag-cap-'));
    });

    afterEach(() => {
        fs.rmSync(logDir, { recursive: true, force: true });
    });

    it('keeps only the newest lines that fit in the budget', async () => {
        const lines = Array.from({ length: 130 }, (_, i) => `${i}`.padEnd(374, 'x'));
        fs.writeFileSync(path.join(logDir, 'Demo Builder Debug Logs.log'), lines.join('\n'));
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs', { lines: 130 });

        const text = result.content[0].text;
        expect(text).toContain('last 119 of 130 lines');
        // Newest kept, oldest dropped — the cap is applied from the end.
        expect(text).toContain('129'.padEnd(374, 'x'));
        expect(text).not.toContain('10'.padEnd(374, 'x'));
    });

    it('returns everything when the whole tail fits', async () => {
        const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
        fs.writeFileSync(path.join(logDir, 'Demo Builder Debug Logs.log'), lines.join('\n'));
        const server = fakeServer();
        registerDiagnosticsTools(server, logDir);

        const result = await server.text('read_debug_logs', { lines: 20 });

        expect(result.content[0].text).toContain('last 20 of 20 lines');
    });
});

/**
 * What the tool DECLARES, which is what an agent reads before deciding to call it.
 *
 * Every field here is load-bearing on the agent surface: `needsAuth` decides
 * whether the guard chain demands a token for a read that touches none, the
 * annotations decide whether a client may call it without consent, and the input
 * schema is the only thing that refuses a 5,000-line request before it is served.
 */
describe('read_debug_logs — the declaration', () => {
    function definition() {
        const server = fakeServer();
        registerDiagnosticsTools(server, '/tmp/whatever');
        return server.def('read_debug_logs');
    }

    it('needs no auth — no path in it touches a service or a token', () => {
        expect(definition().needsAuth).toBe(false);
    });

    it('is annotated read-only and non-destructive', () => {
        expect(definition().annotations).toEqual({
            readOnlyHint: true,
            destructiveHint: false,
        });
    });

    it('carries a title and a description an agent can route on', () => {
        const def = definition();

        expect(def.title).toBe('Read Debug Logs');
        expect(def.description).toContain('Debug Logs');
    });

    it('accepts only the two channels that have a mirror file', () => {
        const channel = definition().inputSchema!.channel;

        expect(channel.safeParse('debug').success).toBe(true);
        expect(channel.safeParse('user').success).toBe(true);
        expect(channel.safeParse('extension').success).toBe(false);
    });

    it('refuses a line count outside 1..500 before the file is ever read', () => {
        const lines = definition().inputSchema!.lines;

        expect(lines.safeParse(1).success).toBe(true);
        expect(lines.safeParse(500).success).toBe(true);
        expect(lines.safeParse(0).success).toBe(false);
        expect(lines.safeParse(501).success).toBe(false);
    });

    it('caps the filter length, and takes an ordinary short substring', () => {
        const filter = definition().inputSchema!.filter;

        expect(filter.safeParse('error').success).toBe(true);
        expect(filter.safeParse('x'.repeat(200)).success).toBe(true);
        expect(filter.safeParse('x'.repeat(201)).success).toBe(false);
    });
});
