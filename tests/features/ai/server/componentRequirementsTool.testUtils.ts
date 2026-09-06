/**
 * Shared setup for the get_component_requirements suites.
 *
 * Both need the same stand-in for the MCP server, and both need BOTH halves of
 * the registration: the handler, to call the tool, and the definition, to read
 * what it was registered AS — needsAuth, the annotations and the input schema
 * decide whether the server will run it without consent, and they went
 * unasserted while the fake threw the definition away.
 *
 * The catalog is a parameter here for the same reason it is one in the module:
 * `componentRequirementsTool.test.ts` drives the real `components.json`, and
 * `componentRequirementsTool-lenientConfig.test.ts` hands in shapes the shipped
 * file does not contain.
 */

import {
    registerComponentRequirementsTool,
    type ComponentCatalog,
} from '@/features/ai/server/componentRequirementsTool';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';

type ToolResult = { content: Array<{ text: string }> };

export interface RegisteredTool {
    /** The name it registered under — the string an agent has to type. */
    name: string;
    /** What the tool declared to the server. */
    definition: McpToolSchema;
    /** The raw text it emitted, for size and formatting assertions. */
    raw(componentId?: string): Promise<string>;
    call(componentId?: string): Promise<Record<string, unknown>>;
    /** Invoked with NO arguments object at all, the way a bare SDK call arrives. */
    callWithNoArgs(): Promise<Record<string, unknown>>;
}

/** Register the tool against a fake server and hand back both halves. */
export function serve(catalog?: ComponentCatalog): RegisteredTool {
    let handler: ((a?: unknown) => Promise<ToolResult>) | undefined;
    let definition: McpToolSchema | undefined;
    let name = '';
    registerComponentRequirementsTool(
        {
            registerTool: (n: string, d: McpToolSchema, h: never) => {
                name = n;
                definition = d;
                handler = h;
            },
        },
        catalog
    );
    const invoke = (args?: unknown) => handler!(args);
    return {
        name,
        definition: definition as McpToolSchema,
        raw: async (componentId?: string) => (await invoke({ componentId })).content[0].text,
        call: async (componentId?: string) =>
            JSON.parse((await invoke({ componentId })).content[0].text),
        callWithNoArgs: async () => JSON.parse((await invoke(undefined)).content[0].text),
    };
}
