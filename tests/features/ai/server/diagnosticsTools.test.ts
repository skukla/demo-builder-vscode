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
import { registerDiagnosticsTools } from '@/features/ai/server/diagnosticsTools';

function fakeServer() {
    const tools = new Map<
        string,
         
        (args: any) => Promise<{ content: Array<{ text: string }> }>
    >();
    return {
        registerTool(
            name: string,
            _def: unknown,
             
            handler: (args: any) => Promise<{ content: Array<{ text: string }> }>
        ) {
            tools.set(name, handler);
        },
        text(name: string, args?: unknown) {
            return tools.get(name)!(args);
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
});
