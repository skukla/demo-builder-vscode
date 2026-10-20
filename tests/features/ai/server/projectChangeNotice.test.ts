/**
 * withProjectChangeNotice — an agent following the person's current project is told
 * when the person moved it, and only then (AI-15).
 */

import { asText } from '@/features/ai/server/mcpToolResult';
import { withProjectChangeNotice } from '@/features/ai/server/projectChangeNotice';
import type { AgentWorkingProject } from '@/types/handlers';

const JUSTRITE = { name: 'justrite', path: '/p/justrite' };
const SCRATCH = { name: 'scratch', path: '/p/scratch' };

function connection(working: AgentWorkingProject = {}) {
    let current: { name: string; path: string } | undefined = SCRATCH;
    const handlers = new Map<string, (args?: unknown) => Promise<unknown>>();
    const server = withProjectChangeNotice(
        { registerTool: (name, _schema, handler) => void handlers.set(name, handler) },
        working,
        async () => current,
    );
    server.registerTool('get_project', { needsAuth: false, description: 'd', inputSchema: {} }, async () => asText({ ok: true }));
    return {
        call: async () => (await handlers.get('get_project')!()) as { content: Array<{ text: string }> },
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
