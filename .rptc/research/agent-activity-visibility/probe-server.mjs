/**
 * Minimal MCP server that answers ONE question: does Claude Code accept live
 * progress messages from a tool while it runs?
 *
 * It reports whether the caller supplied a progress token, then emits three
 * messages. Run it against an INTERACTIVE claude session and watch whether the
 * three lines appear in the chat while the call is in flight — that is the half
 * a headless run cannot show. See research.md.
 *
 * Paths are relative to this file (repo root is three levels up); this repo is
 * public, so no absolute home paths.
 */
import { McpServer } from '../../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
import { StdioServerTransport } from '../../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import { z } from '../../../node_modules/zod/index.js';

const server = new McpServer({ name: 'probe-srv', version: '0.0.0' });

server.registerTool(
    'run_probe',
    {
        title: 'A Very Distinctive Display Title',
        description: 'Reports whether the caller requested progress, and emits progress notifications.',
        inputSchema: { step: z.string().optional() },
    },
    async (_args, extra) => {
        const token = extra?._meta?.progressToken;
        const facts = { progressTokenPresent: token !== undefined, token: token ?? null };
        if (extra?.sendNotification && token !== undefined) {
            for (const [n, msg] of [[1,'Cloning repository…'],[2,'Subscribing Adobe APIs…'],[3,'Deploying to Runtime…']]) {
                try {
                    await extra.sendNotification({
                        method: 'notifications/progress',
                        params: { progressToken: token, progress: n, total: 3, message: msg },
                    });
                    facts[`sent_${n}`] = msg;
                } catch (e) { facts[`sendError_${n}`] = String(e).slice(0,120); }
            }
        }
        return { content: [{ type: 'text', text: JSON.stringify(facts) }] };
    }
);

await server.connect(new StdioServerTransport());
