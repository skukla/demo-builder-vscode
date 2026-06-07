/**
 * Descriptor-driven MCP tool registration.
 *
 * A tool is configured as a row, not hand-written: `{ tool, description, map,
 * type, ... }`. One loop turns each row into an MCP tool whose body is the same
 * `dispatchHandler(map, ctx, type, args)` call the webview button makes — so the
 * agent surface reuses the existing handlers/services with zero new business
 * logic. Destructive rows set `confirm` (gated on `confirm:true`); every row's
 * output is shaped to be token-lean (compact JSON, no webview-only fields).
 */

import { z } from 'zod';
import { dispatchHandler } from '@/core/handlers';
import type { HandlerContext, HandlerMap, HandlerResponse } from '@/types/handlers';

export interface ToolDescriptor {
    /** MCP tool name (snake_case). */
    tool: string;
    /** One-line description (kept terse — it rides in context every session). */
    description: string;
    /** Existing handler map to dispatch into. */
    map: HandlerMap;
    /** Message type within the map. */
    type: string;
    /** Zod input schema fields (omit for no-arg tools). */
    inputSchema?: Record<string, z.ZodTypeAny>;
    /** When true, the tool refuses unless called with `confirm: true`. */
    confirm?: boolean;
    /** Custom response projector; defaults to {@link defaultShape}. */
    shape?: (res: HandlerResponse) => string;
}

/**
 * Default response shaping: compact JSON of the meaningful payload, or a terse
 * error string. Strips the internal `success` flag; unwraps a lone `data` field.
 * Never pretty-prints — the output is consumed as LLM context tokens.
 */
export function defaultShape(res: HandlerResponse): string {
    if (!res.success) {
        const code = res.code ? ` [${res.code}]` : '';
        return `Error: ${res.error ?? 'operation failed'}${code}`;
    }
    const { success: _success, ...rest } = res as HandlerResponse & Record<string, unknown>;
    const keys = Object.keys(rest);
    const payload = keys.length === 1 && keys[0] === 'data' ? (rest as { data: unknown }).data : rest;
    return JSON.stringify(payload);
}

const confirmField = z
    .boolean()
    .optional()
    .describe('Must be true to perform this action (guards against accidental calls)');

/**
 * Register every descriptor as an MCP tool on `server`, dispatching through the
 * existing handler maps with a fresh headless context per call.
 *
 * @param server     McpServer (typed `any`; see registerProjectTools docstring).
 * @param descriptors Tool rows to register.
 * @param ctxFactory  Builds a headless HandlerContext for each invocation.
 */
 
export function registerDescriptorTools(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    descriptors: ToolDescriptor[],
    ctxFactory: () => HandlerContext,
): void {
    for (const d of descriptors) {
        const inputSchema = {
            ...(d.inputSchema ?? {}),
            ...(d.confirm ? { confirm: confirmField } : {}),
        };
        const shape = d.shape ?? defaultShape;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server.registerTool(d.tool, { description: d.description, inputSchema }, async (args: any) => {
            if (d.confirm && args?.confirm !== true) {
                return {
                    content: [{ type: 'text' as const, text: `${d.tool} requires confirm:true to proceed.` }],
                };
            }
            const res = await dispatchHandler(d.map, ctxFactory(), d.type, args ?? {});
            return { content: [{ type: 'text' as const, text: shape(res) }] };
        });
    }
}
