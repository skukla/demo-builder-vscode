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
import { asRawText, asText } from './mcpToolResult';
import {
    payloadOfEvent,
    withCapturedProgress,
    type CapturedEvent,
} from './progressCapture';
import { dispatchHandler } from '@/core/handlers/dispatchHandler';
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
    /**
     * Does this tool, AS EXPOSED, only read?
     *
     * REQUIRED, and required on purpose: it is what the dry run gates on, and a
     * field you can forget is a hole that opens quietly. The compiler asks every
     * row; that is stronger than any test.
     *
     * "AS EXPOSED" is the load-bearing phrase. It describes the tool a caller can
     * actually reach, not the handler in the abstract. `check_github_app`
     * declares `readOnly: true` even though its handler triggers a Helix code
     * sync, because {@link ToolDescriptor.argDefaults} forces `skipTrigger` and
     * the write is unreachable through this tool. Do not "correct" that.
     *
     * The tool's NAME is not consulted. It used to be — `isReadOnlyToolName`, a
     * regex — and a regex cannot express "named `check_` and writes anyway",
     * which is why that one guard had to be found by a hand audit.
     */
    readOnly: boolean;
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
     * Arguments forced onto every call, overriding anything the agent sends.
     *
     * Exists because a handler's default can be a WRITE. `checkGitHubApp` fires
     * `triggerAndWaitForCodeSync` against the repo when Helix 404s, unless
     * `skipTrigger` is set (`checkGitHubAppHandler.ts:202-228`) — so exposing it
     * as `check_github_app` without forcing that flag ships a read tool that
     * mutates a repo, and an agent enumerating checks would trip it.
     *
     * Forced, not defaulted: a default the agent can override is not a guard.
     * Anything the caller should control belongs in `inputSchema` instead.
     */
    argDefaults?: Record<string, unknown>;
    /**
     * Answer the call WITHOUT dispatching, when a value is returned.
     *
     * For capabilities the agent cannot complete: return a `needsUser` handoff and
     * the handler never runs. Dispatching first and shaping after is not the same
     * thing — by then the call has already happened, with whatever the agent could
     * supply, and the user sees a failure instead of an instruction.
     *
     * The case that motivated it: PaaS store discovery takes an admin username and
     * password in its payload (`edsHandlers.ts:118-127`). Those must never travel
     * through a tool argument, so the tool refuses the PaaS branch and points at
     * the surface where a person types them. The ACCS branch needs no secret and
     * dispatches normally.
     */
    preflight?: (args: Record<string, unknown>) => Record<string, unknown> | undefined;
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
    // Forced last, so a caller cannot send the flag that turns a read into a write.
    const callArgs = d.argDefaults ? { ...args, ...d.argDefaults } : args;

    if (!d.capturePayloadFrom) {
        return dispatchHandler(d.map, ctxFactory(), d.type, callArgs);
    }
    const events: CapturedEvent[] = [];
    const res = await dispatchHandler(
        d.map,
        withCapturedProgress(ctxFactory(), events),
        d.type,
        callArgs,
    );
    if (!res.success) return res;
    const captured = payloadOfEvent(events, d.capturePayloadFrom);
    if (!captured) return res;

    // Two different questions wear the same `success` key, and conflating them
    // reports failures as successes.
    //
    // The RETURN answers "did the handler run"; the captured payload answers
    // "did the operation succeed". They diverge in production:
    // `handleDiscoverStoreStructure` sends the discovery failure and then
    // returns `{success: true}` with the comment "Handler succeeded, discovery
    // failed" (`edsHandlers.ts:153`). Spreading the return last would let its
    // `true` overwrite the payload's `false` and hand the agent a success
    // carrying a stray `error`.
    //
    // So a captured failure wins outright — it is the outcome the caller asked
    // about. Otherwise the return's fields win, since a handler that bothered to
    // return data meant it.
    if (captured.success === false) {
        return captured as HandlerResponse;
    }
    return { ...captured, ...res } as HandlerResponse;
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

        server.registerTool(
            d.tool,
            {
                description: d.description,
                inputSchema,
                // MCP's own annotation block, so the declaration does double
                // duty: our dry run reads it, and it travels to the client in
                // `tools/list` — Claude Code learns which of our tools are safe.
                annotations: {
                    readOnlyHint: d.readOnly,
                    // A tool that demands `confirm` has declared itself
                    // destructive; saying so twice in two vocabularies would be
                    // two things to keep in sync.
                    destructiveHint: d.confirm === true,
                },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (args: any) => {
            if (d.confirm && args?.confirm !== true) {
                return asRawText(`${d.tool} requires confirm:true to proceed.`);
            }
            // After the confirm gate, before any dispatch: a preflight answer means
            // the handler must not run at all. Order is deliberate — a destructive
            // row still refuses an unconfirmed call first, so adding a preflight can
            // never widen what a tool will do without confirmation.
            const early = d.preflight?.(args ?? {});
            if (early) {
                return asText(early);
            }
            const res = await runHandler(d, ctxFactory, args ?? {});
            // `shape` returns a STRING (already stringified), so raw — not asText.
            return asRawText(shape(res, args ?? {}));
        });
    }
}
