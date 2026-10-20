/**
 * withProjectChangeNotice — an agent following the person's current project is told
 * when the person moved it, and only then (AI-15).
 */

import { asText } from '@/features/ai/server/mcpToolResult';
import { withProjectChangeNotice } from '@/features/ai/server/projectChangeNotice';
import type { AgentWorkingProject } from '@/types/handlers';

const JUSTRITE = { name: 'justrite', path: '/p/justrite' };
const SCRATCH = { name: 'scratch', path: '/p/scratch' };

type Answer = { content: Array<{ text: string }>; isError?: boolean };

const READ_ONLY = { readOnlyHint: true, destructiveHint: false };
const WRITES = { readOnlyHint: false, destructiveHint: false };

function connection(working: AgentWorkingProject = {}) {
    let current: { name: string; path: string } | undefined = SCRATCH;
    const handlers = new Map<string, (args?: unknown) => Promise<unknown>>();
    const ran: string[] = [];
    const server = withProjectChangeNotice(
        { registerTool: (name, _schema, handler) => void handlers.set(name, handler) },
        working,
        async () => current,
    );
    const tool = (name: string, annotations?: typeof READ_ONLY) =>
        server.registerTool(name, { needsAuth: false, description: 'd', inputSchema: {}, annotations }, async () => {
            ran.push(name);
            return asText({ ok: true });
        });
    tool('get_project', READ_ONLY);
    tool('add_integration', WRITES);
    tool('undeclared_tool');
    tool('set_current_project', WRITES);
    tool('create_project', WRITES);
    tool('create_project_from_file', WRITES);
    tool('copy_project', WRITES);
    const callTool = async (name: string) => (await handlers.get(name)!()) as Answer;
    return {
        call: () => callTool('get_project'),
        callTool,
        ran,
        personOpens: (p: typeof current) => {
            current = p;
        },
    };
}

const texts = (r: { content: Array<{ text: string }> }) => r.content.map((c) => c.text);

describe('withProjectChangeNotice', () => {
    it('says so when the person opened another project since the last call', async () => {
        const agent = connection();
        await agent.call();

        agent.personOpens(JUSTRITE);
        const answer = await agent.call();

        expect(texts(answer)).toEqual([
            '{"ok":true}',
            'Note: the open project changed from "scratch" to "justrite" since your last call, so this answer is ' +
                'about "justrite". To keep working on "scratch", call set_current_project with /p/scratch.',
        ]);
    });

    it('says nothing on the first call, or while the project stays put', async () => {
        const agent = connection();

        expect(texts(await agent.call())).toEqual(['{"ok":true}']);
        expect(texts(await agent.call())).toEqual(['{"ok":true}']);
    });

    it('says it once, not on every call after', async () => {
        const agent = connection();
        await agent.call();
        agent.personOpens(JUSTRITE);
        await agent.call();

        expect(texts(await agent.call())).toEqual(['{"ok":true}']);
    });

    // An agent that made or picked its own project is not following the person's.
    it('says nothing to an agent working on its own project', async () => {
        const agent = connection({ path: '/p/mine' });
        await agent.call();
        agent.personOpens(JUSTRITE);

        expect(texts(await agent.call())).toEqual(['{"ok":true}']);
    });
});

// AI-76: the notice arrives on the answer to a call that already ran. For a write, that is
// too late — on 2026-10-20 an add meant for Justrite ran against the project opened since.
describe('withProjectChangeNotice — a write after the project moved', () => {
    async function movedUnder(agent: ReturnType<typeof connection>) {
        await agent.call();
        agent.personOpens(JUSTRITE);
    }

    it('does not run, and says why, naming both projects', async () => {
        const agent = connection();
        await movedUnder(agent);

        const answer = await agent.callTool('add_integration');

        expect(agent.ran).not.toContain('add_integration');
        expect(answer.isError).toBe(true);
        expect(texts(answer)).toEqual([
            'Error: not done. The open project changed from "scratch" to "justrite" since your last call, ' +
                'and add_integration would have changed "justrite". Nothing was changed. To act on "justrite", ' +
                'call add_integration again. To keep working on "scratch", call set_current_project with /p/scratch.',
        ]);
    });

    it('runs when called again: the second call is the confirmation', async () => {
        const agent = connection();
        await movedUnder(agent);
        await agent.callTool('add_integration');

        const answer = await agent.callTool('add_integration');

        expect(agent.ran).toEqual(['get_project', 'add_integration']);
        expect(texts(answer)).toEqual(['{"ok":true}']);
    });

    // Fails closed, like the dry run: a tool that does not declare itself read-only writes.
    it('stops a tool that declares nothing', async () => {
        const agent = connection();
        await movedUnder(agent);

        await agent.callTool('undeclared_tool');

        expect(agent.ran).not.toContain('undeclared_tool');
    });

    it.each(['set_current_project', 'create_project', 'create_project_from_file', 'copy_project'])('lets %s run: it chooses the project', async (name) => {
        const agent = connection();
        await movedUnder(agent);

        await agent.callTool(name);

        expect(agent.ran).toContain(name);
    });

    it('lets a write run while the project stays put', async () => {
        const agent = connection();
        await agent.call();

        await agent.callTool('add_integration');

        expect(agent.ran).toContain('add_integration');
    });

    it('lets a write run for an agent on its own project', async () => {
        const agent = connection({ path: '/p/mine' });
        await movedUnder(agent);

        await agent.callTool('add_integration');

        expect(agent.ran).toContain('add_integration');
    });
});
