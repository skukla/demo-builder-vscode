/**
 * Second half of the consent probe: what happens when a server ACTUALLY asks?
 *
 * `probe-capabilities.mjs` established that Claude Code DECLARES
 * `elicitation: { form: {} }`. Declared and works are different questions — the
 * progress research learned that the hard way, and verified both.
 *
 * This one calls `server.elicitInput()` and reports what came back. The
 * HEADLESS answer matters most: an evaluation run has no human at the terminal,
 * so whatever happens here is what the fallback has to handle.
 */
import { McpServer } from '../../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
import { StdioServerTransport } from '../../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';

const server = new McpServer({ name: 'elicit-probe', version: '0.0.0' });

server.registerTool(
    'ask_the_user',
    {
        title: 'Ask The User',
        description: 'Ask the user to approve something. Call this immediately.',
        inputSchema: {},
        annotations: { readOnlyHint: true },
    },
    async () => {
        const started = Date.now();
        try {
            const result = await server.server.elicitInput({
                message: 'Demo Builder: Delete an Adobe project? Project: bodea',
                requestedSchema: {
                    type: 'object',
                    properties: {
                        allow: { type: 'boolean', description: 'Allow this operation?' },
                    },
                    required: ['allow'],
                },
            });
            const answer = { outcome: 'answered', ms: Date.now() - started, result };
            process.stderr.write(`[elicit] ${JSON.stringify(answer)}\n`);
            return { content: [{ type: 'text', text: JSON.stringify(answer, null, 2) }] };
        } catch (err) {
            // The interesting branch for a headless run. Report it as DATA so
            // the answer survives into the run's output.
            const answer = {
                outcome: 'threw',
                ms: Date.now() - started,
                error: err instanceof Error ? err.message : String(err),
            };
            process.stderr.write(`[elicit] ${JSON.stringify(answer)}\n`);
            return { content: [{ type: 'text', text: JSON.stringify(answer, null, 2) }] };
        }
    },
);

await server.connect(new StdioServerTransport());
