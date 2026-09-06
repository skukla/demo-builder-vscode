/**
 * Shared setup for the discoveryTools suites.
 *
 * Both suites need the same thing: a stand-in for the MCP server that keeps
 * BOTH halves of a registration — the handler and the definition — so a test can
 * call the tool and also read what it was registered as. The definition half is
 * the one that used to be thrown away, which is how needsAuth, the annotations
 * and the titles went unasserted on all three tools.
 */

type ToolResult = { content: Array<{ text: string }> };

export interface FakeMcpServer {
    registerTool(name: string, def: unknown, handler: () => Promise<ToolResult>): void;
    /** Invoke a registered tool and parse its JSON payload. */
    call(name: string): Promise<unknown>;
    /** The raw text a tool emitted, for size and formatting assertions. */
    callText(name: string): Promise<string>;
    tools: Map<string, () => Promise<ToolResult>>;
    defs: Map<string, Record<string, unknown>>;
}

export function fakeServer(): FakeMcpServer {
    const tools = new Map<string, () => Promise<ToolResult>>();
    const defs = new Map<string, Record<string, unknown>>();
    return {
        registerTool(name, def, handler) {
            tools.set(name, handler);
            defs.set(name, def as Record<string, unknown>);
        },
        async callText(name) {
            return (await tools.get(name)!()).content[0].text;
        },
        async call(name) {
            return JSON.parse((await tools.get(name)!()).content[0].text);
        },
        tools,
        defs,
    };
}
