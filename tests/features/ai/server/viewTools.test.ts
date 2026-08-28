/**
 * View tools tests — open_view is confirm-gated and maps friendly view names to
 * Demo Builder command ids via the injected runner.
 */

import { registerViewTools } from '@/features/ai/server/viewTools';

function fakeServer() {
     
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    return {
         
        registerTool(name: string, _def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
        },
        text(name: string, args?: unknown) {
            return tools.get(name)!(args);
        },
        tools,
    };
}

describe('registerViewTools', () => {
    it('refuses without confirm:true and does not run any command', async () => {
        const runCommand = jest.fn(async () => undefined);
        const server = fakeServer();
        registerViewTools(server, runCommand);

        const result = await server.text('open_view', { view: 'projects_list' });
        expect(result.content[0].text).toMatch(/requires confirm:true/);
        expect(runCommand).not.toHaveBeenCalled();
    });

    it('runs the mapped command when confirmed', async () => {
        const runCommand = jest.fn(async () => undefined);
        const server = fakeServer();
        registerViewTools(server, runCommand);

        const result = await server.text('open_view', { view: 'projects_list', confirm: true });
        expect(runCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList');
        expect(JSON.parse(result.content[0].text)).toEqual({ opened: 'projects_list' });
    });

    it('maps each known view to its command id', async () => {
        const runCommand = jest.fn(async () => undefined);
        const server = fakeServer();
        registerViewTools(server, runCommand);

        await server.text('open_view', { view: 'dashboard', confirm: true });
        await server.text('open_view', { view: 'configure', confirm: true });
        await server.text('open_view', { view: 'logs', confirm: true });

        expect((runCommand.mock.calls as unknown[][]).map((c) => c[0])).toEqual([
            'demoBuilder.showProjectDashboard',
            'demoBuilder.configureProject',
            'demoBuilder.showLogs',
        ]);
    });
});

// ─── reload_window ───────────────────────────────────────────────────────────

describe('reload_window', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('refuses without confirm:true and does not reload', async () => {
        const runCommand = jest.fn(async () => undefined);
        const server = fakeServer();
        registerViewTools(server, runCommand);

        const result = await server.text('reload_window', {});
        expect(result.content[0].text).toMatch(/requires confirm:true/);
        jest.runAllTimers();
        expect(runCommand).not.toHaveBeenCalled();
    });

    it('ANSWERS FIRST, then reloads — the reload tears down this very server', async () => {
        // The whole design constraint. `workbench.action.reloadWindow` restarts the
        // extension host, which is what serves this MCP call; reloading before the
        // response is written means the caller sees a dropped socket instead of a
        // result, and cannot tell success from a crash.
        const runCommand = jest.fn(async () => undefined);
        const server = fakeServer();
        registerViewTools(server, runCommand);

        const result = await server.text('reload_window', { confirm: true });

        // Answered, and NOTHING has run yet.
        expect(result.content[0].text).toContain('reloading');
        expect(runCommand).not.toHaveBeenCalled();

        // Only after the deferral does the host restart.
        jest.runAllTimers();
        expect(runCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
    });

    it('tells the caller the socket will drop and how to wait for it', async () => {
        // A caller that does not expect the disconnect reads a normal reload as a
        // failure. The response has to say so — it is the only chance to.
        const server = fakeServer();
        registerViewTools(server, jest.fn(async () => undefined));

        const result = await server.text('reload_window', { confirm: true });
        const text = result.content[0].text;
        expect(text).toMatch(/socket/i);
        expect(text).toContain('probe.mjs info');
        jest.runAllTimers();
    });
});
