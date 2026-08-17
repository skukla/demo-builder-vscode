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
import {
    payloadOfEvent,
    withCapturedProgress,
    type CapturedEvent,
} from './progressCapture';
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
    /**
     * Name the sendMessage event whose payload IS this handler's answer.
     *
     * Many handlers compute a result, push it to the webview, and return a bare
     * `{success:true}` — `handleCheckGitHubAuth` sends `'github-auth-status'`,
     * `handleCheckDaLiveAuth` sends `'dalive-auth-status'`. Exposed as-is they
     * would be tools that cannot fail and carry no answer.
     *
     * With this set, the handler runs under a capturing context and the named
     * event's payload is folded into the result before shaping. The handler is
     * not modified; nothing about the webview path changes.
     *
     * The event is NAMED rather than inferred, because only orchestrations follow
     * the `*-complete` convention that `lastCompleteData` keys on.
     */
    capturePayloadFrom?: string;
    /**
     * Custom response projector; defaults to {@link defaultShape}.
     *
     * Receives the validated call arguments as well as the response, so a row
     * can vary its projection by request — the `inventory: 'counts' | 'full'`
     * pattern, where the lean shape is the default and the full payload is
     * opt-in. Without the arguments a row could only ever pick one size, and
     * the choice between "cheap by default" and "complete when asked" is
     * exactly what response quality turns on.
     */
    shape?: (res: HandlerResponse, args: Record<string, unknown>) => string;
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
 
/**
 * Dispatch one descriptor's handler, capturing its pushed payload when the row
 * asks for it.
 *
 * A captured payload is merged UNDER the handler's own return, so a handler that
 * returns real data keeps it and the capture only fills a gap. Capture failures
 * are silent by design: the tool still returns whatever the handler returned,
 * which is the pre-existing behaviour.
 */
async function runHandler(
    d: ToolDescriptor,
    ctxFactory: () => HandlerContext,
    args: Record<string, unknown>,
): Promise<HandlerResponse> {
    if (!d.capturePayloadFrom) {
        return dispatchHandler(d.map, ctxFactory(), d.type, args);
    }
    const events: CapturedEvent[] = [];
    const res = await dispatchHandler(
        d.map,
        withCapturedProgress(ctxFactory(), events),
        d.type,
        args,
    );
    if (!res.success) return res;
    const captured = payloadOfEvent(events, d.capturePayloadFrom);
    return captured ? ({ ...captured, ...res } as HandlerResponse) : res;
}

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
            const res = await runHandler(d, ctxFactory, args ?? {});
            return { content: [{ type: 'text' as const, text: shape(res, args ?? {}) }] };
        });
    }
}
