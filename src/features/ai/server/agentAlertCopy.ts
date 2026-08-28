/**
 * WRITTEN copy for every alert an agent's work raises.
 *
 * Not derived. Four attempts on 2026-08-24/25 built this text out of the tool's
 * name and its agent-facing description — first sentence, asides stripped, keys
 * relabelled, acronyms fixed. Each pass was a real improvement and each produced
 * something a producer still should not have been shown, because the source
 * string is written for an agent and no transform changes who it was written for:
 *
 *     Open one of the CURRENT project's URLs in the browser.   (shouting)
 *     Deploy (or redeploy — idempotent) …                      (developer word)
 *     Target: liveSite                                         (raw enum value)
 *
 * So the copy is authored here, per tool, addressed to the person answering.
 *
 * THE RULES THE TEXT FOLLOWS
 *
 * - `action` completes "Demo Builder: ___?" — a verb phrase, no trailing period.
 * - `consequence` is ONE plain sentence saying what changes. It is not a
 *   description of the tool. The reader has already decided they want the thing;
 *   they are deciding whether they want it NOW, to THIS.
 * - Name the blast radius when it is wide: irreversible, shared, public, costs
 *   money, affects another person. That is the half every mechanical rule got
 *   wrong, because "(irreversible)" and "(select_org first)" look identical to a
 *   regex.
 * - No tool names, no field names, no protocol tokens, no emphasis caps.
 *
 * A tool with no entry raises no dialog at all — membership here IS the gate.
 *
 * ## The dialog answers ONE question
 *
 * "Am I allowed to do this?" is a decision, not a record. Three lines make the
 * decision — what happens, what it costs, and WHICH ONE — and nothing else
 * belongs in a modal that interrupts someone. An earlier version printed every
 * scalar argument the schema declared, in declaration order, so deleting an
 * Adobe project led with a 19-digit id and pushed the project's name to second
 * place. Nobody can check an id; everybody can check a name.
 *
 * The audit-trail argument for printing everything does not survive the fact
 * that the audit trail already exists somewhere better: the debug log records
 * every call's argument keys, and the evaluation recorder holds the full trace.
 * Neither interrupts anyone, and a modal that is hard to read gets clicked
 * through — which defeats the gate completely.
 *
 * @module features/ai/server/agentAlertCopy
 */

/** Authored strings for one tool's alerts. */
export interface AgentAlertCopy {
    /** Completes "Demo Builder: ___?". Verb phrase, no full stop. */
    action: string;
    /** One sentence: what changes if they allow it. */
    consequence: string;
    /**
     * Which argument keys name the THING being acted on, in reading order.
     *
     * Only these are shown. Not every argument is a decision input: a
     * 19-digit Console id, a disk path and a boolean flag all cost the reader
     * attention and none of them can be checked.
     *
     * An EMPTY array means the tool acts on the current project and takes no
     * argument naming it — `republish`, `sync_content`, `reset_eds_project`.
     * The dialog names the open project instead, so the reader is never asked
     * to approve an unnamed target.
     *
     * This cannot be derived from the tool's shape, which is why it is written
     * down. `delete_project` takes `name`; `delete_adobe_project` takes both
     * `projectId` and `projectName` and must show only the second;
     * `set_site_admin` needs BOTH its `email` and its `admin` boolean, because
     * granting and revoking are different decisions.
     */
    target: string[];
    /**
     * May the user say "don't ask again this session" for this tool?
     *
     * REQUIRED, so every entry makes the decision explicitly. An optional flag
     * would default the answer, and the default would be wrong for whichever
     * tool someone forgot.
     *
     * TWO tests, and a tool must pass BOTH:
     *
     * 1. **Repeating it is recoverable.** Anything whose consequence says "can't
     *    be undone" fails here immediately.
     * 2. **It does not reach another person.** `set_site_admin` passes the first
     *    test — access can be re-granted — and fails this one, because a
     *    standing grant would let an agent change someone else's access
     *    repeatedly on one approval.
     *
     * Reading all sixteen consequences on 2026-08-25 left exactly TWO: the pair
     * that fires repeatedly inside a single flow and can simply be run again.
     * If a future entry makes it three, be suspicious — the point of a grant is
     * to remove friction from something harmless and frequent, not to reduce
     * prompts in general.
     */
    sessionGrant: boolean;
}

/**
 * The tools that raise a consent dialog, and what each one says.
 *
 * Membership is deliberate: a dialog appears for an operation that CANNOT be
 * undone by another call, or that reaches beyond this machine — a live site, a
 * shared Adobe project, another person's access. Everything else runs without
 * interrupting, because a prompt on a cheap mutation trains people to click
 * Allow without reading, which costs more than it saves.
 */
export const AGENT_ALERT_COPY: Record<string, AgentAlertCopy> = {
    delete_project: {
        action: 'Delete this project',
        consequence:
            "Removes the project folder and its settings from this machine. Cloud resources aren't touched. This can't be undone.",
        target: ['name'],
        sessionGrant: false,
    },
    delete_github_repo: {
        action: 'Delete a GitHub repository',
        consequence: "Deletes the repository and its history on GitHub. This can't be undone.",
        target: ['owner', 'repo'],
        sessionGrant: false,
    },
    delete_adobe_project: {
        action: 'Delete an Adobe project',
        consequence:
            "Deletes the Adobe Developer Console project and everything inside it. Anyone else using it loses access. This can't be undone.",
        // NOT projectId: a 19-digit Console id is not checkable by a human,
        // and it used to lead this dialog.
        target: ['projectName'],
        sessionGrant: false,
    },
    cleanup_dalive_site: {
        action: 'Delete all content for a site',
        consequence: "Removes every page and asset from the DA.live site. This can't be undone.",
        target: ['org', 'site'],
        sessionGrant: false,
    },
    delete_page: {
        action: 'Delete a page',
        consequence:
            "Unpublishes the page and removes it from the storefront. Visitors stop seeing it immediately. This can't be undone.",
        target: ['path'],
        sessionGrant: false,
    },
    reset_eds_project: {
        action: 'Reset this storefront',
        consequence:
            "Replaces the storefront's code and content with the original template. Anything customised here is lost.",
        target: [],
        sessionGrant: false,
    },
    reset_datapack: {
        action: 'Remove sample data',
        consequence:
            "Deletes this data pack's products and categories from the Commerce instance. This can't be undone.",
        target: ['datapackName', 'version'],
        sessionGrant: false,
    },
    remove_integration: {
        action: 'Remove an integration',
        consequence:
            'Undeploys the integration from Adobe Runtime and deletes its files. Anything calling it stops working.',
        target: ['id'],
        // The deployment could be redeployed, but the local files are deleted.
        sessionGrant: false,
    },
    migrate_storefront_name: {
        action: 'Rename this storefront',
        consequence:
            'Copies the content to a new DA.live site and deletes the old one. Existing links to the old name stop working.',
        // Its `projectPath` argument is an absolute disk path — noise in a
        // dialog. The open project names the target.
        target: [],
        sessionGrant: false,
    },
    remove_block_from_library: {
        action: 'Remove a block from the library',
        consequence:
            'Deletes the block from the shared DA.live authoring library. Anyone authoring with it loses it.',
        // `blockId`, not blockName — and the project too, since the library
        // belongs to one storefront.
        target: ['projectName', 'blockId'],
        sessionGrant: false,
    },
    set_site_admin: {
        action: 'Change who can administer this site',
        consequence:
            "Grants or revokes another person's admin access to the storefront configuration.",
        // BOTH: granting and revoking are different decisions, and `admin`
        // is the one that says which.
        target: ['email', 'admin'],
        // Recoverable (access can be re-granted) but it reaches ANOTHER PERSON,
        // which fails the second test.
        sessionGrant: false,
    },
    republish: {
        action: 'Republish the storefront',
        consequence: 'Pushes the current configuration live. Visitors see the change within minutes.',
        target: [],
        // Repeatable and recoverable, and it fires several times in one flow -
        // the case a grant exists for.
        sessionGrant: true,
    },
    sync_content: {
        action: 'Publish all storefront content',
        consequence:
            'Pushes every page, asset and config change to the live site. Visitors see it within minutes.',
        target: [],
        // Same as republish: run it again and the previous state returns.
        sessionGrant: true,
    },
    start_datapack_import: {
        action: 'Import sample data',
        consequence:
            'Writes products and categories into the live Commerce instance. Takes several minutes and cannot be paused.',
        target: ['datapackName', 'version'],
        sessionGrant: false,
    },
    start_datapack_export: {
        action: 'Export sample data',
        consequence:
            'Captures this instance\'s data into the shared catalogue, where other people will see it.',
        // The pack and the store it is captured FROM. `confirmName` is the
        // proof-of-intent echo, not the target.
        target: ['datapackName', 'version', 'commerceInstance'],
        sessionGrant: false,
    },
};

/** Authored copy for a tool, or undefined when nobody has written it yet. */
export function alertCopyFor(toolName: string): AgentAlertCopy | undefined {
    return AGENT_ALERT_COPY[toolName];
}

/** Whether this tool interrupts the user for consent. */
export function raisesConsentDialog(toolName: string): boolean {
    return toolName in AGENT_ALERT_COPY;
}
