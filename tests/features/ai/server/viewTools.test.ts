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

        expect(runCommand.mock.calls.map((c) => c[0])).toEqual([
            'demoBuilder.showProjectDashboard',
            'demoBuilder.configureProject',
            'demoBuilder.showLogs',
        ]);
    });
});
