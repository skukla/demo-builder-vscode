/**
 * Response-size ceilings for the MCP tool surface — the audit's record.
 *
 * Phase 2 measured every reachable tool against a live extension and shrank the
 * seven that dominated the surface. This table is what stops that regressing:
 * one number per tool, asserted where the tool is already driven by a test.
 *
 * ## Why ceilings and not one rule
 *
 * "Responses must be small" is wrong, and the harness proved it. `read_page`
 * returning a 12KB page is the tool WORKING — the page is the answer.
 * `list_console_apis` flattens a repeated field and saves 16%, which a blanket
 * 60%-reduction rule called a failure. What each tool should cost depends on
 * what it is for, so the number is recorded per tool with the reason.
 *
 * ## How the numbers were chosen
 *
 * Each is the LIVE measurement (2026-08-16, against a real Adobe org, a real
 * Data Installer and a real storefront) plus headroom, or — for tools driven
 * only by fixtures — the fixture size plus headroom. A ceiling is a regression
 * alarm, not a target: it should fire when a payload changes shape, not when a
 * project has one more block in it.
 *
 * ## The two shapes that produced every finding
 *
 * Worth knowing before adding a tool here, because both are invisible in a
 * fixture and obvious in production:
 *
 *   1. A LIST WITH NO PAGE SIZE. get_datapack_activity returned 100 of 1,099
 *      rows (25KB); list_adobe_projects returned all 725 (111KB).
 *   2. A FIELD CARRIED FOR THE DASHBOARD. `art` thumbnails, the repeated
 *      `dataTypes` array, `who_created` — 46% of one response was creator ids
 *      the agent could not even act on.
 */

/** Bytes a tool's response must stay under, with the reason it is that number. */
export interface Ceiling {
    /** Maximum response size in bytes. */
    bytes: number;
    /** Why this number — measurement, or the shape that justifies the size. */
    why: string;
}

export const RESPONSE_CEILINGS: Record<string, Ceiling> = {
    run_commerce_query: {
        bytes: 31_000,
        why:
            'ENFORCED, not observed. The tool truncates at `MAX_RESPONSE_CHARS` (30,000) ' +
            'and declares the cut in the payload, so this ceiling is a bound the code ' +
            'holds rather than a figure measured once and hoped for. It needs one: a ' +
            'catalog query can return megabytes, and this is the only tool here whose ' +
            'response size is chosen by the CALLER rather than by us. A truncated JSON ' +
            'body that did not SAY it was truncated would be worse than a large one — ' +
            'the agent would parse a fragment and believe it.',
    },
    reload_window: {
        bytes: 400,
        why:
            'a FIXED acknowledgement — `{reloading, inMs, note}`. Measured at 263 bytes, ' +
            'and it cannot grow: nothing in it scales with the project, the catalog or ' +
            'anything else. The note is the largest part and it is a constant string, ' +
            'kept because a caller that does not expect the socket to drop reads a ' +
            'successful reload as a crash. Ceiling rather than an exemption because the ' +
            'size is known, and rather than an IOU because there is nothing left to measure.',
    },
    // ── file-based tools (mcp-server.ts) ────────────────────────────────────
    list_projects: {
        bytes: 8_000,
        why:
            'bounded by DEFAULT_LIST_LIMIT (100 rows ≈ 6,000 bytes), not by how many projects exist — ' +
            '227 live with 2, 18,191 with 300 before the cap. `pinned` is emitted only when TRUE, ' +
            'which is why it costs ~0 on a normal list rather than 16 bytes × 100 rows',
    },
    get_project: {
        bytes: 12_000,
        why:
            'summary with aiPrompts/aiFileHashes/blockLibraries collapsed; 5,179 live (was 9,532 ' +
            'before the aiFileHashes collapse). Secret VALUES are stripped before shaping ' +
            '(stripSecretValues), so this number can only go down',
    },
    get_component_config: {
        bytes: 40_000,
        why: 'returns a config file verbatim — the file IS the answer',
    },
    update_project_config: { bytes: 2_000, why: 'write confirmation' },
    sync_storefront: { bytes: 2_000, why: 'git result summary' },
    list_blocks: {
        bytes: 8_000,
        why: 'bounded by DEFAULT_LIST_LIMIT (100 rows), not by storefront size; 2,781 live on a 53-block storefront',
    },
    get_block_authoring_shape: {
        bytes: 10_000,
        why: 'index bounded by MAX_AUTHORING_INDEX_ROWS (100); a 78-block catalog is 5,577 and one block is 92 — a 300-component registry was 21,992 before the cap',
    },
    promote_block_to_library: { bytes: 2_000, why: 'per-step status of one promotion' },
    remove_block_from_library: { bytes: 2_000, why: 'per-step status of one removal' },

    // ── content authoring ───────────────────────────────────────────────────
    read_page: {
        bytes: 32_000,
        why: 'the page source IS the answer; capped by readSource at MAX_SOURCE_READ_BYTES (30KB)',
    },
    read_published_page: { bytes: 32_000, why: 'same — published body, capped at 30KB' },
    write_page: { bytes: 1_000, why: 'write + optional publish outcome' },
    publish_page: { bytes: 1_000, why: 'publish outcome' },
    delete_page: { bytes: 1_000, why: 'delete outcome, or the confirm refusal' },
    list_content: { bytes: 12_000, why: 'one row per entry; 1,664 live at a site root' },

    // ── cloud resources ─────────────────────────────────────────────────────
    list_github_repos: { bytes: 6_000, why: 'paged at 30; 2,835 live across 173 repos' },
    list_dalive_sites: { bytes: 8_000, why: 'paged summary; 204 live' },
    delete_github_repo: { bytes: 1_000, why: 'delete outcome or refusal' },
    cleanup_dalive_site: { bytes: 1_000, why: 'delete outcome or refusal' },

    // ── Diagnostics ─────────────────────────────────────────────────────────
    read_debug_logs: {
        bytes: 46_000,
        why:
            'channel-log tail; the tool enforces its own 45KB newest-first byte cap ' +
            '(500-line × 500-char worst case would otherwise be ~250KB)',
    },

    // ── Adobe console ───────────────────────────────────────────────────────
    list_orgs: { bytes: 4_000, why: 'org list is short; 44 live' },
    list_adobe_projects: {
        bytes: 6_000,
        why: 'paged at 20 with `deletable` instead of who_created; 1,987 live against 725 projects (was 111,748)',
    },
    list_workspaces: { bytes: 4_000, why: 'workspaces per project are few; 34 live' },
    select_org: { bytes: 6_000, why: 'selection, or valid options — orgs are a short list' },
    select_project: {
        bytes: 2_000,
        why: 'selection; on a bad id it reports a COUNT, never the 725-row list it used to enumerate',
    },
    select_workspace: { bytes: 6_000, why: 'selection, or valid options — workspaces are few' },

    // ── storefront ──────────────────────────────────────────────────────────
    republish: { bytes: 1_000, why: 'per-step publish outcome' },
    sync_content: { bytes: 1_000, why: 'per-step publish outcome' },

    // ── discovery / status ──────────────────────────────────────────────────
    list_components: { bytes: 4_000, why: 'catalog summary; 581 live' },
    list_demo_packages: { bytes: 4_000, why: 'catalog summary; 369 live' },
    list_stacks: { bytes: 4_000, why: 'catalog summary; 601 live' },
    get_auth_status: { bytes: 2_000, why: 'per-provider status flags; 120 live' },
    get_current_project: { bytes: 2_000, why: 'name + path; 110 live' },

    get_project_status: {
        bytes: 2_000,
        why: "one project's status flags + optional mesh/EDS summary — fixed field count, nothing that grows with project size",
    },

    get_commerce_endpoints: {
        bytes: 2_000,
        why:
            'three endpoints, one header block and four scope codes — a FIXED field count. ' +
            'Nothing here grows with catalog, store or project size, so a breach means a ' +
            'field entered the payload rather than a project getting bigger',
    },

    get_component_requirements: {
        bytes: 3_000,
        why:
            'ONE component narrowed out of a 14,931-byte catalog whose env-var registry alone is 9,236. ' +
            "Bounded by that component's own env-var count, not by catalog size — a breach means the " +
            'narrowing broke and a category is riding through',
    },
    validate_component_selection: {
        bytes: 2_000,
        why: 'two booleans plus dependency IDs and any validation errors; the wizard rows are projected away',
    },

    configure_project: {
        bytes: 4_000,
        why: 'the applied diff (env reported as KEYS, never values) plus the still-unset list — bounded by the field count, not by config size',
    },
    create_adobe_project: {
        bytes: 1_000,
        why: 'created project id + name, or a refusal explaining the likely cause',
    },
    create_adobe_workspace: {
        bytes: 1_000,
        why: 'created workspace id + name and the project it landed in',
    },
    delete_adobe_project: {
        bytes: 4_000,
        why: 'a delete verdict; on failure the FAILED teardown steps ride along, bounded by the step count',
    },
    create_github_repo: {
        bytes: 1_000,
        why: 'repo name, URL, default branch and a readiness flag — fixed fields, nothing that scales',
    },
    check_prerequisites: {
        bytes: 4_000,
        why:
            'one summary row per prerequisite; 514 live for the 5 an eds-accs stack needs. Grows with the ' +
            'prerequisite COUNT, which is config-bounded, not with anything a project can inflate',
    },

    // ── diagnosis (phase 4, Group 1) — measured live 2026-08-17 ─────────────
    check_repo_readiness: { bytes: 1_000, why: 'a verdict kind, sometimes a reason; 35 live' },
    check_github_app: {
        bytes: 1_000,
        why: 'three flags, plus an install URL when absent; 63 live installed, 128 not-installed',
    },
    discover_store_structure: {
        bytes: 8_000,
        why:
            '635 live for a 2-website / 2-group / 2-view hierarchy, 420 for the PaaS handoff, 107 for a failure. ' +
            'UNBOUNDED BY DESIGN — it scales with the merchant’s store hierarchy and has no page size, because ' +
            'the whole hierarchy IS the answer (the caller is choosing a scope from it). 8,000 covers roughly ' +
            '30x this store; a breach means a merchant large enough to need paging, not a regression',
    },

    // ── storefront site (siteTools.ts) ───────────────────────────────────────
    //
    // Bespoke tools, so the descriptor-row EXEMPT machinery below never covered
    // them. Measured 2026-08-17 against a real Configuration Service on a site
    // with one site admin and one org admin.
    get_site_access: {
        bytes: 4_000,
        why:
            '131 live (1 site admin + 1 org admin). The only thing that grows is the two ROSTERS, ' +
            'at ~25 bytes an address — 4,000 covers roughly 150 of them. A breach means an org large ' +
            'enough to need paging, which is a real finding rather than a regression, because there ' +
            'is no page size here: the caller is picking a person to ask',
    },
    set_site_admin: {
        bytes: 2_000,
        why:
            '140 live granting, 115 revoking, 126 for the confirm refusal. Carries the site roster ' +
            'but NOT the org one, so it is bounded more tightly than get_site_access',
    },
    repair_site_configuration: {
        bytes: 2_000,
        why:
            '241 live repaired+verified (the overlay URL is most of it), 148 for the confirm refusal. ' +
            'Fixed fields plus `lostGrants`, which scales with the admin roster — and is the case ' +
            'worth having headroom for, since a run that loses grants must report every one',
    },
    connect_dalive: {
        bytes: 600,
        why:
            '444 live, and it does not vary: the tool never dispatches, so the response is the same ' +
            'literal handoff every call. A breach here means the tellUser text grew, nothing else',
    },
    find_storefront_name_mismatches: {
        bytes: 4_000,
        why:
            '39 live across 2 projects with 0 mismatches — which proves nothing about the bound, so ' +
            'the number comes from a FULL page instead: 2,780 bytes for 20 rows of long project ' +
            'paths, driven in siteTools.test.ts. Bounded by AGENT_PAGE_SIZE, not by project count; ' +
            'the `total` beside the page reports what the cap hid',
    },
    // ── Data Installer writes (dataInstallerDescriptors.ts) ─────────────────
    // Measured 2026-08-17 against a real Data Installer and a live ACCS instance.
    list_datapack_import_scopes: {
        bytes: 8_000,
        why:
            '320 live for a 3-website / 3-store-view hierarchy. Same data and same unbounded-by-design ' +
            'shape as discover_store_structure, which carries the same number for the same reason: ' +
            'the whole hierarchy IS the answer, because the caller is choosing a scope from it',
    },
    validate_datapack_import: {
        bytes: 2_000,
        why:
            '14 live for {valid:true} — the dry run answers a question, it does not describe the ' +
            'request. 47 and 80 for the two argument refusals. The headroom is for a valid:false ' +
            "whose `reason` is the service's own prose",
    },
    list_datapack_export_items: {
        bytes: 4_000,
        why:
            '801 live for 20 categories (25 exist), 622 for 20 products (186 exist) — the rows are ' +
            '{id, displayName} and uniformly narrow. Bounded by AGENT_PAGE_SIZE, NOT by the catalog: ' +
            'the client asks the service for page_size 1000, so the 186-product type would have been ' +
            '~5,800 unpaged and a real merchant catalog far worse',
    },
    migrate_storefront_name: {
        bytes: 2_000,
        why:
            '105 live for the no-op branch, 82 for an unknown path, 35 for a blank argument. The ' +
            'SUCCESS branch is NOT among these numbers — no project with a name mismatch exists to ' +
            'run it against, so its size is bounded by reading the shape: the same fields plus ' +
            '`lostGrants`, which scales with the site admin roster',
    },
};

/**
 * Assert a tool's response is within its recorded ceiling.
 *
 * Fails with the measurement and the recorded reason, because a ceiling breach
 * is usually a payload changing SHAPE — a new field, or a list that lost its
 * page size — and the reason is what tells the next person which.
 */
export function expectWithinCeiling(tool: string, response: string): void {
    const ceiling = RESPONSE_CEILINGS[tool];
    if (!ceiling) {
        throw new Error(
            `No response ceiling recorded for "${tool}". Add one to responseCeilings.ts — ` +
                `a tool with no recorded size is one nobody is watching.`
        );
    }
    const bytes = Buffer.byteLength(response, 'utf8');
    if (bytes > ceiling.bytes) {
        throw new Error(
            `${tool} returned ${bytes.toLocaleString()} bytes, over its ${ceiling.bytes.toLocaleString()}-byte ceiling.\n` +
                `  Recorded basis: ${ceiling.why}\n` +
                `  Usually this means a list lost its page size, or a field meant for the dashboard ` +
                `entered the payload. Fix the response, or raise the ceiling WITH a new measurement.`
        );
    }
}
