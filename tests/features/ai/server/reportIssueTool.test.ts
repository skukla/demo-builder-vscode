/**
 * report_demo_builder_issue — opens a GitHub issue draft with the demo's details taken out, only on
 * confirm:true, and posts nothing (owner, 2026-11-19).
 */

import { registerReportIssueTool } from '@/features/ai/server/reportIssueTool';
import type { McpToolServer } from '@/features/ai/server/mcpToolServer';
import { createMockProject } from '../../../helpers/projectFake';

type Handler = (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

function setUp() {
    const tools = new Map<string, Handler>();
    const server = { registerTool: (name: string, _def: unknown, handler: Handler) => tools.set(name, handler) } as unknown as McpToolServer;
    const openUrl = jest.fn().mockResolvedValue(undefined);
    const project = createMockProject({ name: 'acme-widgets', path: '/p/acme-widgets' });
    registerReportIssueTool(server, { openUrl, loadProjects: async () => [project], version: '1.0.0-beta.153' });
    const tool = tools.get('report_demo_builder_issue');
    if (!tool) throw new Error('not registered');
    return { tool, openUrl };
}

const DRAFT = { title: 'Update fails on acme-widgets', whatFailed: 'Applying an update to acme-widgets', diagnosis: 'A merge across a reset' };

describe('report_demo_builder_issue', () => {
    it('opens nothing without confirm:true', async () => {
        const { tool, openUrl } = setUp();

        const res = await tool(DRAFT);

        expect(res.isError).toBe(true);
        expect(openUrl).not.toHaveBeenCalled();
    });

    it("opens GitHub's new-issue page with the project's name taken out, and says nothing is posted", async () => {
        const { tool, openUrl } = setUp();

        const res = await tool({ ...DRAFT, confirm: true });

        const url = decodeURIComponent(String(openUrl.mock.calls[0][0]));
        expect(url).toContain('github.com/skukla/demo-builder-vscode/issues/new?title=');
        expect(url).not.toContain('acme-widgets');
        expect(url).toContain('Demo Builder version: 1.0.0-beta.153');
        expect(res.content[0].text).toContain('nothing is posted until they do');
    });
});
