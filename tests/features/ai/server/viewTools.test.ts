/**
 * View tools tests — open_view is confirm-gated and maps friendly view names to
 * Demo Builder command ids via the injected runner.
 */

import { registerViewTools } from '@/features/ai/server/viewTools';

interface CapturedDef {
    needsAuth?: unknown;
    annotations?: Record<string, boolean>;
    inputSchema?: Record<string, unknown>;
}

function fakeServer() {
     
    const tools = new Map<string, (args: any) => Promise<{ content: Array<{ text: string }> }>>();
    const defs = new Map<string, CapturedDef>();
    return {
         
        registerTool(name: string, def: unknown, handler: (args: any) => Promise<{ content: Array<{ text: string }> }>) {
            tools.set(name, handler);
            defs.set(name, def as CapturedDef);
        },
        text(name: string, args?: unknown) {
            return tools.get(name)!(args);
        },
        json(name: string, args?: unknown) {
            return tools.get(name)!(args).then((r) => JSON.parse(r.content[0].text));
        },
        def(name: string) {
            return defs.get(name)!;
        },
        tools,
    };
}

/** Registers both tools against a runner the test can assert on. */
function registered() {
    const runCommand = jest.fn(async () => undefined);
    const server = fakeServer();
    registerViewTools(server, runCommand);
    return { server, runCommand };
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

    it('declares open_view as an unauthenticated UI action, not a read', async () => {
        // The descriptor IS the contract the consent layer and the annotation
        // pins read. `readOnlyHint: false` is what makes open_view ask first.
        const { server } = registered();

        const def = server.def('open_view');
        expect(def.needsAuth).toBe(false);
        expect(def.annotations).toEqual({ readOnlyHint: false, destructiveHint: false });
        expect(Object.keys(def.inputSchema!)).toEqual(['view', 'confirm']);
    });

    it('refuses a call with no arguments at all rather than throwing', async () => {
        const { server, runCommand } = registered();

        const result = await server.text('open_view');
        expect(result.content[0].text).toMatch(/requires confirm:true/);
        expect(runCommand).not.toHaveBeenCalled();
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

    it('declares reload_window as destructive and unauthenticated', async () => {
        const { server } = registered();

        const def = server.def('reload_window');
        expect(def.needsAuth).toBe(false);
        expect(def.annotations).toEqual({ readOnlyHint: false, destructiveHint: true });
        expect(Object.keys(def.inputSchema!)).toEqual(['confirm']);
    });

    it('refuses a call with no arguments at all rather than throwing', async () => {
        const { server, runCommand } = registered();

        const result = await server.text('reload_window');
        expect(result.content[0].text).toMatch(/requires confirm:true/);
        jest.runAllTimers();
        expect(runCommand).not.toHaveBeenCalled();
    });

    it('reports the reload as pending, and the delay it reports is the real one', async () => {
        // `reloading` and `inMs` are all the caller gets before the socket drops.
        // If either lied, a caller polling for the new host would give up early.
        const { server, runCommand } = registered();

        const payload = await server.json('reload_window', { confirm: true });
        expect(payload.reloading).toBe(true);

        jest.advanceTimersByTime(payload.inMs - 1);
        expect(runCommand).not.toHaveBeenCalled();

        jest.advanceTimersByTime(1);
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
