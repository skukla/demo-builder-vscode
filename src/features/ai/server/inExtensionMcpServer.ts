/**
 * In-extension MCP server.
 *
 * Listens on a per-workspace Unix domain socket and serves the Demo Builder
 * tool surface to Claude Code (via the stdio→UDS proxy `dist/mcp-proxy.js`).
 * Because it runs inside the extension host, its tools can reuse the
 * extension's handlers and services directly — unlike the standalone
 * `src/mcp-server.ts` process, which cannot import 'vscode'.
 *
 * Phase 1 exposes the seven project tools via the shared `registerProjectTools`
 * (the same registration the standalone server uses). Later phases add tools
 * that dispatch to the extension's handler maps.
 *
 * Each incoming connection gets its own `McpServer` bound to the socket via the
 * SDK's `StdioServerTransport`, which accepts arbitrary duplex streams.
 */

import * as fsPromises from 'fs/promises';
import * as net from 'net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { raisesConsentDialog } from './agentAlertCopy';
import { askChatForConsent } from './consentViaChat';
import { probeSocket } from './mcpSocketDiscovery';
import { asRawText } from './mcpToolResult';
import { progressLabel, SERVER_DISPLAY_NAME } from './toolDisplayName';
import { narrationFor } from './toolNarration';
import {
    fingerprintArgs,
    resultByteLength,
    type ToolTraceRecorder,
    type TraceOutcome,
} from './toolTraceRecorder';
import { withPhaseSinks, type PhaseSink } from '@/core/utils/agentPhaseChannel';
import { mcpSocketDir } from '@/core/utils/mcpSocketPath';
import { registerProjectTools, type McpCredentialProvider } from '@/mcp-server';
import type { Logger } from '@/types/logger';

const SERVER_NAME = 'demo-builder';
const SERVER_VERSION = '1.0.0';

/**
 * Wrap an `McpServer` so every registered tool logs to the extension channels
 * without the shared, vscode-free `registerProjectTools` knowing about logging.
 *
 * Logs the tool NAME and arg KEYS only — never arg values — because args can
 * carry secrets (e.g. `update_project_config.content` holds `.env` contents).
 * `info` → "Demo Builder: User Logs"; `debug` → "Demo Builder: Debug Logs"; errors → both.
 */
/**
 * Whether a tool's NAME reads as a query. Everything else is treated as
 * mutating and routed through the injected long-running notifier.
 *
 * An allowlist, deliberately (same reasoning as mcp-live-probe's --force
 * gate, which started as a denylist and let `sync_content` and `republish`
 * straight through): a false positive costs one unnecessary notification,
 * a false negative is a live-CDN mutation running invisibly. A new tool
 * with a novel name fails CLOSED into "mutating".
 */
/**
 * Does this tool's own definition say it only reads?
 *
 * THE classifier. Three things gate on it — the dry run, the chat's opening
 * line, and the phase sinks — and all three used to gate on
 * {@link isReadOnlyToolName}, a regex over the tool's name.
 *
 * A name cannot express "called `check_` and writes anyway". `check_github_app`
 * is exactly that (it triggers a Helix code sync on a 404) and the guard that
 * holds it closed had to be found by a hand audit of all 43 read-shaped tools,
 * because nothing could state it.
 *
 * FAILS CLOSED: no declaration means "assume it writes". A tool that forgets is
 * over-blocked under the dry run, which is recoverable; the other direction is a
 * real mutation during a mode that promises none. `toolAnnotations.test.ts`
 * asserts every registered tool declares, so the fallback never runs in
 * production.
 */
function declaredReadOnly(schema: unknown): boolean {
    const annotations = (schema as { annotations?: { readOnlyHint?: unknown } } | undefined)
        ?.annotations;
    return annotations?.readOnlyHint === true;
}

/**
 * Name-shape guess at read-vs-write. NOT used to gate anything any more — see
 * {@link declaredReadOnly}, which reads the tool's own declaration.
 *
 * Kept as the cross-check `toolAnnotations.test.ts` runs: a declaration that
 * disagrees with the name is either a bug or a deliberate exception, and the
 * test makes the difference explicit rather than silent. Both `check_github_app`
 * and the `select_*` trio are real, recorded disagreements.
 */
export function isReadOnlyToolName(name: string): boolean {
    return /^(list|get|read|check|find|verify|inspect|show|describe)_/.test(name);
}

/**
 * Whether a tool CALL asks for the destructive path — it carries the
 * `confirm: true` the surface's own convention gates destructive operations
 * on (the descriptor registrar plus every direct destructive tool refuse
 * without it). This is the consent gate's classifier, deliberately NOT the
 * name-shape allowlist above: that one decides VISIBILITY, and a consent
 * dialog on every cheap mutation is exactly the per-operation friction the
 * agent-traversability half of the design forbids. A call WITHOUT confirm
 * needs no dialog — the handler's own prose refusal is its answer.
 */
export function callRequestsConsent(toolName: string, args: unknown): boolean {
    // The OPERATION decides, not the agent's assertion.
    //
    // This used to fire on `confirm: true` alone, which aimed the one real
    // safety net at the wrong tools: `open_url` (opens a browser tab) raised a
    // modal while `remove_integration` (undeploys from Runtime) and
    // `reset_datapack` ("cannot be undone") raised nothing — because the gate
    // measured what the agent volunteered rather than what the call does.
    //
    // Membership now lives with the copy (`agentAlertCopy`), so a tool that
    // interrupts the user is exactly a tool somebody has written words for. A
    // dialog with no authored text is not a thing that can exist.
    //
    // `confirm` is still required alongside: it is the agent's own gate and its
    // absence still earns a prose refusal from the handler. This narrows what
    // interrupts; it never widens what runs unconfirmed.
    const asserted =
        !!args && typeof args === 'object' && (args as { confirm?: unknown }).confirm === true;
    return asserted && raisesConsentDialog(toolName);
}

/** The injected consent gate's verdict. `refusal` is a ready MCP result. */
export type ConsentVerdict = { allowed: true } | { allowed: false; refusal: unknown };

/**
 * Fields every write tool must tolerate even when it declares no arguments.
 *
 * The generated guidance tells agents that destructive tools take `confirm:true`
 * (and a `confirmName` echo on the most destructive), and several write tools
 * legitimately declare NO arguments — `republish`, `sync_content`. Strictifying
 * those naively would reject the very call the guidance asks for, turning a
 * safety affordance into a hard failure. Declared shapes still win: a tool that
 * describes its own `confirm` keeps its description.
 */
const CONSENT_FIELDS = {
    confirm: z.boolean().optional(),
    confirmName: z.string().optional(),
};

/**
 * Make a WRITE tool's input schema reject unknown arguments instead of silently
 * dropping them.
 *
 * Measured against the real SDK 2026-08-24: a raw-shape `inputSchema` is wrapped
 * in `z.object(shape)`, which STRIPS. Send `{scope, stroeScope}` and the handler
 * receives `{scope}` and answers "ok" — the agent believes it asked for something
 * it did not, and finds out through a wrong result rather than an error. On a
 * write tool that is the dangerous shape; `mcp-tool-authoring` records the
 * `{addons, stroeScope}` typo that applied the addons and discarded the rest.
 * A strict object instead returns `isError: true` naming the offending field.
 *
 * Applied HERE rather than per tool because this wrapper is the one seam every
 * registration passes through (`registerProjectTools` and `registerExtraTools`
 * both receive it), so a new tool is covered on the day it is written rather
 * than whenever someone remembers.
 *
 * READS are deliberately left permissive — a strict read tool mostly costs
 * friction, and a dropped argument on a query yields a visibly wrong answer
 * rather than a silent mutation.
 */
function strictifyWriteSchema(name: string, schema: unknown): unknown {
    if (declaredReadOnly(schema)) return schema;
    const shaped = schema as { inputSchema?: unknown } | undefined;
    const input = shaped?.inputSchema;
    if (input instanceof z.ZodObject) {
        return { ...shaped, inputSchema: input.strict() };
    }
    if (input && typeof input === 'object') {
        const shape = { ...CONSENT_FIELDS, ...(input as z.ZodRawShape) };
        return { ...shaped, inputSchema: z.object(shape).strict() };
    }
    return schema;
}

/**
 * What a mutating tool answers while the dry run is on.
 *
 * DATA, not an error, and the distinction is the whole point: an error teaches an
 * agent to retry, while data teaches it what would have happened. Same rule the
 * datapack dry run already states — "a refusal comes back as valid:false with a
 * reason, not as an error."
 *
 * Argument KEYS only, never values. Args carry secrets (`update_project_config`
 * holds `.env` contents), which is the same reason `withToolLogging` logs keys
 * and not values one line above.
 */
function dryRunResult(name: string, args: unknown): unknown {
    const argumentKeys =
        args && typeof args === 'object' ? Object.keys(args as Record<string, unknown>) : [];
    const phrase = narrationFor(name) ?? name;
    const withArgs = argumentKeys.length
        ? ` It would have run with: ${argumentKeys.join(', ')}.`
        : '';
    // PROSE, not JSON, and the reason is what a producer SEES. Claude Code
    // renders an MCP result verbatim in the chat, so a JSON body puts a raw
    // object dump in their transcript — which is what the owner met on
    // 2026-08-25 and reasonably asked about. A sentence renders as a sentence.
    //
    // The surface is already not all-JSON: refusals answer prose by convention
    // (`mcpToolResult.ts`), and this is a refusal.
    return asRawText(
        `Nothing was changed — dry run is on. ${phrase} was simulated.${withArgs} ` +
            'Continue as if it had succeeded, and tell the user what you would have done.',
    );
}

/**
 * Tell the CHAT what is running, while it runs.
 *
 * The extension already surfaces agent activity — `agentOperationNotifier` puts a
 * progress notification, a status-bar message and a failure toast in the VS Code
 * window. None of that reaches a user who is reading the chat, which is where
 * they are looking while an agent works. This is the same fact, delivered to the
 * window they are actually in.
 *
 * Measured 2026-08-24 before building: Claude Code supplies a `progressToken` on
 * MCP tool calls, and its interactive terminal RENDERS the `message` field live
 * (probe kept at `.rptc/research/agent-activity-visibility/`). Both halves were
 * verified rather than assumed, because the protocol explicitly says a receiver
 * "is not obligated to provide these notifications".
 *
 * Attributed via `progressLabel` because a chat can have several MCP servers
 * connected — an unattributed "Deploying to Runtime…" is ambiguous the moment
 * there is a second one.
 *
 * BEST EFFORT, always. A tool must never fail because a status line could not be
 * sent, and a client that supplies no token simply gets nothing.
 */
/**
 * Send one progress line to the client mid-call.
 *
 * Shared by the start announcement and every phase. Best effort: a client that
 * supplied no token gets nothing, and a send that fails must not cost the user
 * the operation.
 */
async function sendProgress(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra: any,
    message: string,
): Promise<void> {
    const progressToken = extra?._meta?.progressToken;
    if (progressToken === undefined || typeof extra?.sendNotification !== 'function') return;
    try {
        await extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken, progress: 0, message },
        });
    } catch {
        // Visibility is a courtesy; losing it must not cost the user the call.
    }
}

/** One phase of the operation in flight, as the chat sees it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function announcePhase(extra: any, message: string): Promise<void> {
    return sendProgress(extra, `${SERVER_DISPLAY_NAME} · ${message}`);
}

async function announceToolStart(
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra: any,
    simulated = false,
): Promise<void> {
    // Silence when a tool has no authored phrase. Saying nothing is strictly
    // better than announcing "Deploy mesh" — the derived wording is the defect
    // `toolNarration.ts` exists to remove, so there is no fallback to it here.
    // `toolNarration.test.ts` asserts every registered tool has a phrase, which
    // makes this branch unreachable rather than merely unlikely.
    const line = progressLabel(name, simulated);
    if (line) await sendProgress(extra, line);
}

function withToolLogging(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    logger: Logger,
     
    notifier?: (
        toolName: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: (report: PhaseSink) => Promise<any>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Promise<any>,
    consentGate?: (
        toolName: string,
        args: unknown,
        description?: string,
    ) => Promise<ConsentVerdict>,
    dryRun?: () => boolean,
    trace?: ToolTraceRecorder,
    projectShape?: () => string | undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
    return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registerTool(name: string, schema: unknown, handler: (args: any) => Promise<any>) {
             
            // Read ONCE at registration: the declaration is static, and re-deriving
            // it per call would invite someone to make it dynamic later.
            const readOnly = declaredReadOnly(schema);
            server.registerTool(
                name,
                strictifyWriteSchema(name, schema),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                async (args: any, extra: any) => {
                    const started = Date.now();
                    const argKeys =
                        args && typeof args === 'object' ? Object.keys(args).join(', ') : '';
                    logger.info(`[MCP] tool: ${name}`);
                    /**
                     * Record this call, whatever happened to it.
                     *
                     * Never throws: a recorder fault must not turn a working
                     * tool call into a failure. Recording is a diagnostic, and a
                     * diagnostic that can break the thing it observes is worse
                     * than no diagnostic.
                     */
                    const recordCall = (result: unknown, outcome: TraceOutcome): void => {
                        if (!trace) return;
                        try {
                            trace.record({
                                tool: name,
                                readOnly,
                                argumentKeys:
                                    args && typeof args === 'object' ? Object.keys(args) : [],
                                argumentFingerprint: fingerprintArgs(args),
                                resultBytes: resultByteLength(result),
                                durationMs: Date.now() - started,
                                outcome,
                                projectShape: projectShape?.(),
                            });
                        } catch {
                            /* a trace is never worth failing a call over */
                        }
                    };
                    logger.debug(`[MCP] ${name} args: { ${argKeys} }`);
                    // DRY RUN FIRST, before consent and before the notifier.
                    //
                    // Ordering is deliberate. A call carrying `confirm: true`
                    // under dry run must be stopped HERE and must not raise a
                    // dialog: asking someone to approve something that will not
                    // happen is worse than not asking. The notifier is skipped
                    // for the same reason — no progress may claim work that never
                    // ran.
                    //
                    // Reads pass through untouched. The path an agent takes is
                    // only realistic if its queries answer truthfully; a dry run
                    // that also blinds the agent measures nothing.
                    //
                    // `isReadOnlyToolName` is REUSED rather than a second
                    // classification, because two would drift.
                    if (dryRun?.() && !readOnly) {
                        logger.info(`[MCP] ${name} blocked by dry run (nothing was changed)`);
                        // Narrate it. An earlier version stayed SILENT here on the
                        // reasoning that announcing "Republishing…" for something
                        // that will not happen is a lie — but silence is worse: the
                        // producer sees nothing at all and cannot tell the agent
                        // even tried. The honest form is the authored phrase plus
                        // the fact that it was simulated.
                        await announceToolStart(name, extra, true);
                        const blocked = dryRunResult(name, args);
                        // A blocked call is part of the path an agent took and
                        // belongs in the trace. Leaving it out would make a dry
                        // run look like a shorter route than the real thing.
                        recordCall(blocked, 'blocked-by-dry-run');
                        return blocked;
                    }
                    // Consent SECOND, notifier third: a declined operation never
                    // ran, so no progress notification may claim it did. The gate
                    // decides only when the call carries the destructive marker.
                    if (callRequestsConsent(name, args)) {
                        // ASK THE CHAT FIRST, because that is where the producer
                        // is looking. The modal opens in the VS Code window,
                        // which they may not be watching — and a blocking prompt
                        // nobody sees is worse than no prompt.
                        const caps = server.server?.getClientCapabilities?.();
                        const chat = await askChatForConsent(
                            name,
                            args,
                            extra,
                            Boolean(caps && 'elicitation' in caps),
                        );
                        if (chat === 'refuse') {
                            logger.info(`[MCP] ${name} refused in the chat`);
                            return asRawText(
                                `${name} was not approved. Nothing was changed. Ask the user ` +
                                    'again only if they want to retry.',
                            );
                        }
                        // 'unavailable' — the client cannot be asked, or the ask
                        // failed. NOT a refusal: fall through to the modal, which
                        // stays the floor. A consent gate that silently stops
                        // working is the worst available outcome.
                        if (chat !== 'accept' && consentGate) {
                            // The tool's own description reaches the gate. Reading all
                            // 60 write tools showed the NAMES are mostly fine but several
                            // are ambiguous alone — "Republish" (what?), "Sync content"
                            // vs "Sync storefront" (CDN publish vs git push).
                            const description = (schema as { description?: string } | undefined)
                                ?.description;
                            const verdict = await consentGate(name, args, description);
                            if (!verdict.allowed) {
                                logger.info(`[MCP] ${name} declined by user consent dialog`);
                                return verdict.refusal;
                            }
                        }
                    }
                    // AFTER consent, never before: announcing "Deploying mesh…" and
                    // then raising a dialog the user declines would narrate work that
                    // never happened. Reads are skipped — they return promptly and a
                    // line per query is noise, not information.
                    {
                        // EVERY call, reads included. Reads used to be silent on
                        // the reasoning that a line per query is noise — but the
                        // whole point of this feature is seeing the path the agent
                        // takes, and a path with its reads removed is not the path.
                        // Owner correction, 2026-08-25.
                        await announceToolStart(name, extra);
                    }
                    // Fan the operation's own phase strings out to BOTH places a
                    // user might be watching: the chat (MCP progress) and the
                    // VS Code notification (the notifier's reporter). Previously
                    // neither got them — the phases were computed and dropped for
                    // every agent call, so a two-minute create_project announced
                    // itself once and then went silent everywhere.
                    const mcpSink: PhaseSink = (message) => {
                        void announcePhase(extra, message);
                    };
                    // Reads get NO sinks at all, matching the opening line they
                    // also do not get: a query returns promptly, and a line per
                    // query is noise rather than information. A read tool that
                    // calls reportPhase therefore narrates to nobody, which is
                    // the intent — caught by a test that found the first version
                    // installing sinks for reads too.
                    let invoke: () => Promise<unknown>;
                    if (readOnly) {
                        invoke = () => handler(args);
                    } else if (notifier) {
                        invoke = () =>
                            notifier(name, (report) =>
                                withPhaseSinks([mcpSink, report], () => handler(args)),
                            );
                    } else {
                        invoke = () => withPhaseSinks([mcpSink], () => handler(args));
                    }
                    try {
                        const result = await invoke();
                        logger.debug(`[MCP] ${name} ok in ${Date.now() - started}ms`);
                        recordCall(result, 'ok');
                        return result;
                    } catch (err) {
                        logger.error(
                            `[MCP] ${name} failed: ${err instanceof Error ? err.message : String(err)}`,
                            err instanceof Error ? err : undefined,
                        );
                        recordCall(undefined, 'error');
                        throw err;
                    }
                },
            );
        },
    };
}

/** The optional wiring. Grouped so the constructor stays inside the 4-param SOP. */
export interface InExtensionMcpServerOptions {
    /**
     * Hook to register additional tools (e.g. handler-backed descriptor tools) on
     * the per-connection server. Receives the logging-wrapped server so those
     * tools are logged too. Injected by the extension so this module stays free
     * of vscode/handler-map imports.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerExtraTools?: (server: any) => void;
    /**
     * Visibility for agent-triggered mutations (injected — this module stays
     * vscode-free). Wraps the HANDLER CALL of every tool whose name is not
     * read-shaped ({@link isReadOnlyToolName}); the extension supplies a
     * vscode.window.withProgress implementation that also lands the outcome,
     * because the agent's own report may never reach the user (disconnected
     * client, closed chat — both observed live 2026-08-23 around a 2-minute
     * refresh that mutated the live site invisibly).
     */
     
    longRunningNotifier?: (
        toolName: string,
        run: (report: (message: string) => void) => Promise<any>,
    ) => Promise<any>;
    /**
     * Native consent for destructive calls (injected — this module stays
     * vscode-free). Consulted BEFORE the notifier for every call that carries
     * `confirm: true` ({@link callRequestsConsent}); the extension supplies a
     * modal-dialog implementation whose refusal becomes the tool's answer,
     * converting the agent-supplied honor-system parameter into consent that
     * survives a harness-side tool allowlist.
     */
    consentGate?: (
        toolName: string,
        args: unknown,
        description?: string,
    ) => Promise<ConsentVerdict>;
    /**
     * Evaluation Mode's dry run, read LIVE per call (injected, same reason as
     * `consentGate` — this module stays vscode-free).
     *
     * While it answers true, every tool that is not read-shaped is stopped
     * before its handler and answers with what it WOULD have done. The point is
     * to measure the path an agent takes through the extension without a
     * measurement run mutating a real project.
     *
     * Read fresh on every call rather than captured at construction, so
     * toggling the mode takes effect on the next tool call instead of the next
     * window reload — the same shape as `demoBuilder.ai.requireAgentConsent`.
     */
    dryRun?: () => boolean;
    /**
     * Records every tool call for Evaluation Mode.
     *
     * Optional: without it the server behaves exactly as before. The recorder is
     * owned by the extension so one instance spans reconnects — a client that
     * drops and returns mid-task is still one path through the extension, and a
     * per-connection recorder would cut the trace in half at the seam.
     */
    trace?: ToolTraceRecorder;
    /**
     * The kind of project calls are running against (injected — resolving it
     * needs extension state, and this module stays vscode-free).
     *
     * Recorded on every entry so a trace can be read as "this tool, on this kind
     * of project". Without it, "this tool does nothing on EDS projects" is not
     * expressible — and that bug shipped once already.
     */
    projectShape?: () => string | undefined;
    /**
     * DA.live / GitHub token resolver injected by the extension so the
     * credential-needing project tools (`sync_storefront`,
     * `promote_block_to_library`) use the live sign-in session.
     */
    credentials?: McpCredentialProvider;
    /**
     * Build identity reported as `serverInfo.version` on every `initialize`.
     *
     * The socket name is sha256(projects root), identical in every window, and
     * the last window to bind silently owns it (`bindSocket` renames over the
     * shared name). So a client cannot tell WHICH extension host answered it —
     * reproduced 2026-08-16, where two probes of one socket path two minutes
     * apart returned 52 and then 58 tools. `serverInfo.version` is the one field
     * every MCP client already reads, and it was a hardcoded '1.0.0' doing no
     * work. Putting the build stamp there does not fix the binding race; it
     * makes it visible instead of silent. Falls back to SERVER_VERSION when the
     * stamp is unreadable.
     */
    buildLabel?: string;
}

export class InExtensionMcpServer {
    private netServers: net.Server[] = [];
    private connCounter = 0;
    private readonly options: InExtensionMcpServerOptions;

    /**
     * @param socketPath  Absolute UDS path to listen on (per workspace).
     * @param projectsDir Projects root the tools operate on (`~/.demo-builder/projects`).
     * @param logger      Extension logger.
     * @param options     Optional wiring — see {@link InExtensionMcpServerOptions}.
     */
    constructor(
        private readonly socketPath: string,
        private readonly projectsDir: string,
        private readonly logger: Logger,
        options: InExtensionMcpServerOptions = {},
    ) {
        this.options = options;
    }

    async start(): Promise<void> {
        await fsPromises.mkdir(mcpSocketDir(), { recursive: true, mode: 0o700 });

        // One socket: the projects-root path. The dual-listen shim (a
        // secondarySocketPath bound when the workspace folder differed) was
        // removed 2026-08-23 with the decouple-project-from-workspace closure:
        // in the always-root model every .mcp.json pins this root socket, and a
        // cwd-derived proxy that misses it falls back to live-socket discovery.
        await this.bindSocket(this.socketPath);
    }

    /**
     * Bind a single UDS path, by way of a private name renamed into place.
     *
     * Never call this concurrently for the same path within one process: the
     * private name is derived from the pid, so two concurrent binds of one path
     * would share it and the second's cleanup would delete the first's socket.
     * `start()` binds sequentially, which is the only caller.
     *
     * Connections route through the shared `handleConnection` regardless of which
     * path accepted them.
     */
    private async bindSocket(socketPath: string): Promise<void> {
        // Bind a PRIVATE name, then rename it over the shared one. libuv unlinks
        // the pathname it bound, unconditionally and with no inode check
        // (`uv__pipe_close`, libuv `src/unix/pipe.c`), so while the server bound
        // the shared name directly, `server.close()` deleted whichever successor
        // had taken that name — the outgoing window silently killed the incoming
        // one's socket. Renaming means libuv only ever learns the private name,
        // and the shared name is a name no code here ever unlinks (see dispose).
        //
        // Known upstream: nodejs/node#19729 reports this exact race, and the
        // rename workaround, filed 2018 and closed stale.
        //
        // Same directory, so the rename cannot cross filesystems, and short —
        // the hashed basename exists to stay under the ~104-char UDS path limit
        // and this suffix has to fit inside it too.
        // First window wins. Every window homed at the projects root computes
        // the SAME shared name, and the rename below is unconditional — so the
        // last window to start silently took the name from a live server:
        // existing connections stayed on the old window while every new client
        // landed on this one, splitting one socket name across two hosts with
        // different builds and different module-level Adobe targets
        // (adobeTargetStore). Probe first: a LIVE listener keeps the name, and
        // this window says so instead of binding. A dead file (no listener)
        // refuses the probe and is taken over exactly as before. Two windows
        // starting in the same instant can still both pass the probe — that
        // narrow TOCTOU is accepted; the common case is a window opened onto an
        // already-running one. Known limitation, also logged below: if the
        // serving window closes later, this one does NOT retry the bind — a
        // reload of any window picks the name up (the dead file refuses the
        // probe).
        if (await probeSocket(socketPath)) {
            this.logger.warn(
                `[MCP] another window is already serving ${socketPath} — leaving it in place ` +
                    `(first window wins). MCP calls will be answered by that window; if it ` +
                    `closes, reload a window to rebind.`,
            );
            return;
        }

        const privateName = `${socketPath}.${process.pid.toString(36)}`;
        await fsPromises.rm(privateName, { force: true });

        const netServer = net.createServer((socket) => this.handleConnection(socket));

        await new Promise<void>((resolve, reject) => {
            netServer.once('error', reject);
            netServer.listen(privateName, () => {
                netServer.off('error', reject);
                resolve();
            });
        });
        // Attached the moment listen resolves: between here and the end of this
        // function are three awaits, and a 'error' emitted with no listener is an
        // uncaught exception in the extension host.
        netServer.on('error', (err) =>
            this.logger.error(`[MCP] server error on ${socketPath}: ${err.message}`),
        );

        try {
            // Owner-only: the socket file permissions are the access control.
            // Set BEFORE the rename — permissions travel with the inode, and the
            // shared name must never be briefly world-readable.
            await fsPromises.chmod(privateName, 0o600);
            // Atomic replace. The old `rm` then `listen` left a window with no
            // socket at the path at all; rename has no such gap, so a client
            // connecting mid-reload reaches the outgoing server or the incoming
            // one, never nothing.
            await fsPromises.rename(privateName, socketPath);
        } catch (err) {
            // Listening on a name no client can find is worse than not starting.
            // Nothing has been tracked yet, so closing here leaks nothing.
            netServer.close();
            await fsPromises.rm(privateName, { force: true }).catch(() => undefined);
            throw err;
        }

        this.netServers.push(netServer);
        this.logger.info(`[MCP] in-extension server listening on ${socketPath}`);
    }

    /**
     * Per-connection handler. Shared across all bound sockets — connections
     * coming in on either listener are treated identically; the bound path
     * is purely a discovery mechanism for the proxy.
     */
    private handleConnection(socket: net.Socket): void {
        const connId = ++this.connCounter;
        const startedAt = Date.now();
        this.logger.debug(`[MCP] client connected (conn=${connId})`);
        // Typed `any` to avoid TS2589 (see registerProjectTools docstring).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const server: any = new McpServer({
            name: SERVER_NAME,
            version: this.options.buildLabel || SERVER_VERSION,
        });
        // Wrap so every tool logs to the extension channels; registerProjectTools
        // stays vscode-free and logging-agnostic. Extra (handler-backed) tools
        // are registered through the same wrapper.
        const logged = withToolLogging(
            server,
            this.logger,
            this.options.longRunningNotifier,
            this.options.consentGate,
            this.options.dryRun,
            this.options.trace,
            this.options.projectShape,
        );
        registerProjectTools(logged, this.projectsDir, this.options.credentials);
        this.options.registerExtraTools?.(logged);

        const transport = new StdioServerTransport(socket, socket);
        server
            .connect(transport)
            .then(() => {
                this.logger.debug(`[MCP] connect resolved (conn=${connId})`);
            })
            .catch((err: unknown) => {
                this.logger.error(
                    `[MCP] connection failed (conn=${connId}): ${err instanceof Error ? err.message : String(err)}`,
                );
                socket.destroy();
            });

        socket.on('error', (err) =>
            this.logger.debug(`[MCP] socket error (conn=${connId}): ${err.message}`),
        );
        socket.on('close', (hadError) => {
            const ms = Date.now() - startedAt;
            this.logger.debug(
                `[MCP] client disconnected (conn=${connId}, hadError=${hadError}, ${ms}ms)`,
            );
        });
    }

    /**
     * Close the listeners. The shared socket FILE is deliberately left behind.
     *
     * Nothing here may unlink the shared name, because the check that would make
     * it safe cannot be written: POSIX has no atomic unlink-if-inode, so `stat`
     * then `rm` verifies an INODE and then deletes a NAME. A successor's
     * `rename` landing between the two gets deleted instead. That shipped, and
     * it left the surviving server listening on a path no client could resolve —
     * `lsof` showed the extension host bound while `ls` showed the directory
     * empty, with only another reload to recover it. Two callers race it: an
     * outgoing extension host's `deactivate()`, and `startInExtensionMcpServer`
     * (extension.ts), which disposes and rebinds inside a single process.
     *
     * The leftover file is harmless. The next bind renames over it, and every
     * consumer probes liveness rather than trusting existence — `resolveProxyTarget`
     * was split into liveness-then-existence for exactly this reason, so a
     * leftover no longer short-circuits the proxy's fast, friendly "no window
     * running" failure. See that function's docstring.
     */
    dispose(): void {
        for (const server of this.netServers) {
            // libuv unlinks the name IT bound — the private name, which the
            // rename already moved away. This touches no shared name.
            server.close();
        }
        this.netServers = [];
    }
}
