/**
 * Response projectors — the shaping every agent-facing tool should apply.
 *
 * These tools dispatch to handlers built for a WEBVIEW, and `defaultShape` passes
 * that payload straight through. Phase 2 measured what that costs: four tools
 * were 78% of everything the read surface returned, and every one of them was a
 * pass-through. `list_adobe_projects` alone was 111,748 bytes, 46% of it
 * technical-account addresses the agent could not act on.
 *
 * Each projector here generalises a fix that was written by hand during phase 2,
 * so the next thirty tools do not repeat the same recovery.
 *
 * ## The two shapes behind every finding
 *
 * 1. A LIST WITH NO PAGE SIZE — the size is the data's, not the tool's, and an
 *    agent's first call is always `{}`, so the default IS the cost.
 * 2. A FIELD CARRIED FOR THE DASHBOARD — thumbnails, repeated arrays, raw ids.
 *
 * Both are invisible in a fixture and obvious in production. Drive new tools with
 * a payload larger than production before trusting a ceiling.
 */

/** Default rows per page. Enough to answer a question; short of dumping a table. */
export const AGENT_PAGE_SIZE = 20;

/** The paging envelope an agent needs to know whether it has everything. */
export interface PageEnvelope {
    count: number;
    /** Omitted when the source does not report one — never fabricated. */
    total?: number;
    limit: number;
    skip: number;
}

/**
 * Page and project a list.
 *
 * `total` is passed through only when the caller supplies it. A `?? items.length`
 * fallback is exactly the bug phase 2 found: `find_datapacks` answered
 * `total: 20` for a 23-row catalogue once a page size applied, which reads as
 * "that is all of them" while hiding rows.
 */
export function leanList<T, R>(
    items: T[],
    project: (row: T) => R,
    opts: { limit?: number; skip?: number; total?: number } = {},
): { items: R[] } & PageEnvelope {
    const limit = Math.max(1, Math.trunc(opts.limit ?? AGENT_PAGE_SIZE));
    const skip = Math.max(0, Math.trunc(opts.skip ?? 0));
    const page = items.slice(skip, skip + limit);
    return {
        items: page.map(project),
        count: page.length,
        ...(opts.total !== undefined ? { total: opts.total } : {}),
        limit,
        skip,
    };
}

/**
 * Split an index from a detail call.
 *
 * The index carries identity and enough to choose; the payload comes on request.
 * `list_ai_prompts` was 97% prompt bodies before this, and prompt text is
 * unbounded — it grows with whatever the user wrote.
 *
 * **A split alone does not bound the index.** `get_block_authoring_shape` had one
 * and still measured 21,992 bytes at 300 components, because the index itself had
 * no page size. Pass `limit` when the collection can grow.
 */
export function indexDetail<T, I, D>(
    items: T[],
    opts: {
        /** Return the one item the caller asked for, or undefined. */
        find: (items: T[]) => T | undefined;
        /** Requested? Then detail. Absent? Then index. */
        wanted: boolean;
        index: (row: T) => I;
        detail: (row: T) => D;
        limit?: number;
        /** Told to the agent so it knows the detail call exists. */
        detailHint: string;
        notFound: () => Record<string, unknown>;
    },
): Record<string, unknown> {
    if (opts.wanted) {
        const one = opts.find(items);
        return one ? (opts.detail(one) as Record<string, unknown>) : opts.notFound();
    }
    const limit = Math.max(1, Math.trunc(opts.limit ?? items.length));
    const page = items.slice(0, limit);
    return {
        items: page.map(opts.index),
        count: page.length,
        total: items.length,
        ...(items.length > page.length
            ? { more: `${items.length - page.length} more — narrow your query` }
            : {}),
        detail: opts.detailHint,
    };
}

/**
 * Return the ANSWER, not the inputs a caller would need to compute it.
 *
 * The reference case: `list_adobe_projects` shipped `who_created`, a technical
 * account address, on every one of 725 rows — 46% of a 111,748-byte response.
 * The agent could not use it, because the comparison is against a token claim
 * only the extension can read. Replacing it with `deletable` was ~40x smaller and
 * strictly more useful.
 *
 * Ask: can the RECIPIENT act on this field? If only the extension can interpret
 * it, send the interpretation.
 */
export function verdictOnly<T, R extends Record<string, unknown>>(
    row: T,
    keep: (row: T) => R,
    verdicts: Record<string, (row: T) => unknown>,
): R & Record<string, unknown> {
    const out: Record<string, unknown> = { ...keep(row) };
    for (const [name, compute] of Object.entries(verdicts)) {
        out[name] = compute(row);
    }
    return out as R & Record<string, unknown>;
}

/**
 * Emit a repeated nested value once as a legend, and a key per row.
 *
 * `list_console_apis` spent 2,584 bytes — 48% of its response — carrying a
 * `{code, name}` group object on 46 rows to convey SIX distinct values.
 *
 * Saves the duplication and nothing else: measured at 16% on that tool, because
 * the row still carries the code. Worth it when cardinality is low relative to
 * row count; not worth it otherwise.
 */
export function legend<T extends Record<string, unknown>>(
    rows: T[],
    field: string,
    keyOf: (v: unknown) => string | undefined,
    labelOf: (v: unknown) => string | undefined,
): { rows: T[]; legend: Record<string, string> } {
    const table: Record<string, string> = {};
    const projected = rows.map((row) => {
        const v = row[field];
        const key = keyOf(v);
        const label = labelOf(v);
        if (key && label) table[key] = label;
        return (key ? { ...row, [field]: key } : row) as T;
    });
    return { rows: projected, legend: table };
}
