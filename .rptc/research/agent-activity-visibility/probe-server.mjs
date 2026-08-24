// Minimal MCP server: reports what Claude Code sends, and tries to send progress back.
import { McpServer } from '/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
import { StdioServerTransport } from '/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import { z } from '/Users/kukla/Documents/Repositories/app-builder/adobe-demo-system/demo-builder-vscode/node_modules/zod/index.js';

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
