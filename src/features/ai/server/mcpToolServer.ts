/**
 * The registration surface every Demo Builder MCP tool registers against.
 *
 * WHY THIS EXISTS. Until 2026-08-31 every registrar took `server: McpToolServer` — 30 sites.
 * That is not a cosmetic gap: `tests/features/ai/server/` stubs the server and
 * THROWS THE SCHEMA AWAY (20 of 22 suites write
 * `registerTool(name, _def: unknown, handler)`), so registration is checked by
 * nothing at all. The `mcp-tool-authoring` skill records the cost in its own
 * words — "tsc cannot cover the gap either, because `server` is typed `any`" —
 * directly above the two defects that shipped through it:
 *
 *   a raw JSON Schema passed where a zod shape was required, which threw inside
 *   the registrar and killed registration for EVERY tool: the server bound its
 *   socket and never answered a handshake, for six commits;
 *
 *   a raw zod shape where strictness mattered, silently `.strip()`ped by the SDK,
 *   so `configure_project`'s unknown-key rejection could never fire and a typo'd
 *   argument was quietly discarded.
 *
 * Both are shapes a type can refuse. Neither is a shape a stub that discards its
 * second argument can see.
 *
 * THE HANDLER'S RETURN IS `any`, AND ONLY THAT. Every test in
 * `tests/features/ai/server/` stubs this surface with a handler returning its own
 * narrow content shape; `Promise<unknown>` would make all 18 stubs fail to satisfy
 * the interface for a reason that has nothing to do with what it is here to catch.
 * The defects this type refuses live in `inputSchema` and `description`, which are
 * checked exactly. Widening the return buys 18 files of no churn and costs nothing
 * this type was built to protect — verified by re-planting both defects after the
 * change.
 *
 * IT IS DELIBERATELY NARROWER THAN THE SDK'S `McpServer`. Tools only ever call
 * `registerTool`, and the narrow surface is what makes the in-extension wrapper
 * (`inExtensionMcpServer.ts`) and the real SDK server interchangeable at every
 * call site.
 */

import type { z } from 'zod';

/** The schema block a tool declares: what it is, what it takes, how it behaves. */
export interface McpToolSchema {
    /** One-line description — it rides in context every session, so keep it terse. */
    description: string;
    /** Human-facing title shown by clients that render one. */
    title?: string;
    /**
     * Zod input SHAPE (a record of fields) or a zod object.
     *
     * Never a raw JSON Schema: the SDK throws on one, and that throw aborts
     * registration for every tool that would have followed.
     */
    inputSchema?: Record<string, z.ZodTypeAny> | z.ZodObject<z.ZodRawShape>;
    /**
     * MCP's own annotation block. `readOnlyHint` is what the dry run gates on and
     * what reaches the client in `tools/list`, so it is not decoration.
     */
    annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
    };
    /**
     * Which credentials this tool needs, or `false` for none.
     *
     * A tool that needs credentials must pre-flight and return a structured
     * `needsAuth` handoff rather than erroring — interactive browser sign-in
     * cannot be refreshed silently, and an error tells the agent nothing about
     * what to do next.
     *
     * OPTIONAL FOR NOW, AND THAT IS A STAGE, NOT THE DESTINATION. Making it
     * required today would demand 114 judgements in one commit — the same review
     * `tests/sop/tool-auth-review.ledger.json` already tracks, only forced and
     * therefore rushed. Declare it as each tool is reviewed; when the ledger's
     * `unreviewedCeiling` reaches zero this becomes REQUIRED, and the ledger is
     * deleted. That is the arc the feature-barrel ledger took when it emptied.
     *
     * Why a field and not only a ledger, once the review is done: `readOnly` on
     * the descriptor type says it best — "a field you can forget is a hole that
     * opens quietly. The compiler asks every row; that is stronger than any test."
     */
    needsAuth?: 'adobe' | 'github' | 'dalive' | 'commerce' | false;
}

/**
 * What a tool registrar needs from the server, and nothing more.
 *
 * `args` is intentionally loose: the SDK validates against the declared
 * `inputSchema` before the handler runs, so a handler receives whatever that
 * schema admitted. Narrowing it here would be a second, weaker copy of the
 * schema's own contract.
 */
export interface McpToolServer {
    registerTool(
        name: string,
        schema: McpToolSchema,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: (args?: any, extra?: unknown) => Promise<any>
    ): void;
}
