/**
 * An agent following the person's current project is told when the person moved it
 * (AI-15). On 2026-10-12 an SC opened JustRite while an agent worked on a project it had
 * just made; the agent's next tools answered for JustRite and nothing said so, until it
 * noticed and picked its project again twelve minutes later.
 *
 * Only while FOLLOWING: once the agent creates or picks a project it has its own
 * (`AgentWorkingProject`), and the person moving theirs changes nothing it does. The
 * project is recorded after each call, so a move the agent's own call caused is never
 * reported back to it as the person's.
 *
 * @module features/ai/server/projectChangeNotice
 */

import { asRawText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import type { AgentWorkingProject } from '@/types/handlers';

/** The project as the notice names it. */
interface Seen {
    name: string;
    path: string;
}

/**
 * Wrap one connection's tool server so each answer carries the notice when it applies.
 *
 * @param server - the connection's server
 * @param working - the connection's working project
 * @param currentProject - the person's current project now
 * @returns the same server, its tools' answers carrying the notice; every other member is
 *   the server's own, so a registrar reaching past `registerTool` still gets the real thing
 */
export function withProjectChangeNotice<T extends McpToolServer>(
    server: T,
    working: AgentWorkingProject,
    currentProject: () => Promise<Seen | undefined>,
): T {
    let lastSeen: Seen | undefined;
    const seenNow = async (): Promise<Seen | undefined> => {
        if (working.path) return undefined;
        const p = await currentProject();
        return p ? { name: p.name, path: p.path } : undefined;
    };
    const registerTool: McpToolServer['registerTool'] = (name, schema, handler) => {
        server.registerTool(name, schema, async (args, extra) => {
            const before = await seenNow();
            const moved = lastSeen && before && before.path !== lastSeen.path ? noticeOf(lastSeen, before) : undefined;
            const result = await handler(args, extra);
            lastSeen = await seenNow();
            return moved ? withNotice(result, moved) : result;
        });
    };
    return new Proxy(server, {
        get(target, prop, receiver) {
            if (prop === 'registerTool') return registerTool;
            const value: unknown = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

function noticeOf(from: Seen, to: Seen): string {
    return (
        `Note: the open project changed from "${from.name}" to "${to.name}" since your last call, ` +
        `so this answer is about "${to.name}". To keep working on "${from.name}", call ` +
        `set_current_project with ${from.path}.`
    );
}

/** The answer with the notice as one more text block; an answer of another shape as it was. */
function withNotice(result: unknown, notice: string): unknown {
    if (typeof result !== 'object' || result === null || !('content' in result) || !Array.isArray(result.content)) {
        return result;
    }
    return { ...result, content: [...result.content, ...asRawText(notice).content] };
}
