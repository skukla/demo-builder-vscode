/**
 * Shared setup for the `toolDescriptors` suites.
 *
 * Both register descriptor rows against a stand-in for the MCP server and then
 * call what was registered. Arranging only — no assertions live here.
 */

/** Fake McpServer capturing registrations. */
export function fakeServer() {
    const tools = new Map<
        string,
        { inputSchema: any; def: any; handler: (args: any) => Promise<any> }
    >();
    return {
        registerTool(
            name: string,
            def: { inputSchema?: unknown },
            handler: (args: any) => Promise<any>
        ) {
            // The WHOLE definition is kept: annotations travel to the client in
            // tools/list and the dry run gates on them, so dropping them here would
            // leave the declaration unconstrained.
            tools.set(name, { inputSchema: def.inputSchema, def, handler });
        },
        tools,
    };
}
