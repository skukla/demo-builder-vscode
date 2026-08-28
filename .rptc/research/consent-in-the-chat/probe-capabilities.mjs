/**
 * Answers ONE question: does Claude Code declare the `elicitation` capability?
 *
 * Elicitation is the MCP mechanism a SERVER uses to ask the USER something —
 * `server.elicitInput()`. If Claude Code supports it, Demo Builder's consent
 * prompt can appear in the chat, where the producer is actually looking, instead
 * of in a VS Code window they may not be watching.
 *
 * The SDK exposing the method proves nothing: the client has to declare it, and
 * whether Claude Code does is the fact that decides step 06's shape.
 *
 * This dumps the raw `initialize` params to stderr, then answers the same thing
 * through a tool so it is visible in a headless run's output too.
 *
 * Paths are relative (repo root is three levels up); this repo is public, so no
 * absolute home paths.
 */
import { McpServer } from '../../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
import { StdioServerTransport } from '../../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';

const server = new McpServer({ name: 'capability-probe', version: '0.0.0' });

server.registerTool(
    'report_capabilities',
    {
        title: 'Report Client Capabilities',
        description: 'Report what this MCP client declared it supports. Call this immediately.',
        inputSchema: {},
        annotations: { readOnlyHint: true },
    },
    async () => {
        // getClientCapabilities() is populated by the SDK once initialize lands.
        const caps = server.server.getClientCapabilities();
        const info = server.server.getClientVersion();
        const answer = {
            clientInfo: info,
            capabilities: caps,
            declaresElicitation: Boolean(caps && 'elicitation' in caps),
            declaresSampling: Boolean(caps && 'sampling' in caps),
            declaresRoots: Boolean(caps && 'roots' in caps),
        };
        process.stderr.write(`[probe] ${JSON.stringify(answer)}\n`);
        return { content: [{ type: 'text', text: JSON.stringify(answer, null, 2) }] };
    },
);

await server.connect(new StdioServerTransport());
