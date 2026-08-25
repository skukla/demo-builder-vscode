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
 * A tool with no entry falls back to its humanised name and no consequence line,
 * which is exactly what it would have shown anyway — adding this file cannot make
 * an unwritten tool worse than it is today.
 *
 * @module features/ai/server/agentAlertCopy
 */

/** Authored strings for one tool's alerts. */
export interface AgentAlertCopy {
    /** Completes "Demo Builder: ___?". Verb phrase, no full stop. */
    action: string;
    /** One sentence: what changes if they allow it. */
    consequence: string;
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
    },
    delete_github_repo: {
        action: 'Delete a GitHub repository',
        consequence: "Deletes the repository and its history on GitHub. This can't be undone.",
    },
    delete_adobe_project: {
        action: 'Delete an Adobe project',
        consequence:
            "Deletes the Adobe Developer Console project and everything inside it. Anyone else using it loses access. This can't be undone.",
    },
    cleanup_dalive_site: {
        action: 'Delete all content for a site',
        consequence: "Removes every page and asset from the DA.live site. This can't be undone.",
    },
    delete_page: {
        action: 'Delete a page',
        consequence:
            "Unpublishes the page and removes it from the storefront. Visitors stop seeing it immediately. This can't be undone.",
    },
    reset_eds_project: {
        action: 'Reset this storefront',
        consequence:
            "Replaces the storefront's code and content with the original template. Anything customised here is lost.",
    },
    reset_datapack: {
        action: 'Remove sample data',
        consequence:
            "Deletes this data pack's products and categories from the Commerce instance. This can't be undone.",
    },
    remove_integration: {
        action: 'Remove an integration',
        consequence:
            'Undeploys the integration from Adobe Runtime and deletes its files. Anything calling it stops working.',
    },
    migrate_storefront_name: {
        action: 'Rename this storefront',
        consequence:
            'Copies the content to a new DA.live site and deletes the old one. Existing links to the old name stop working.',
    },
    remove_block_from_library: {
        action: 'Remove a block from the library',
        consequence:
            'Deletes the block from the shared DA.live authoring library. Anyone authoring with it loses it.',
    },
    set_site_admin: {
        action: 'Change who can administer this site',
        consequence:
            "Grants or revokes another person's admin access to the storefront configuration.",
    },
    republish: {
        action: 'Republish the storefront',
        consequence: 'Pushes the current configuration live. Visitors see the change within minutes.',
    },
    sync_content: {
        action: 'Publish all storefront content',
        consequence:
            'Pushes every page, asset and config change to the live site. Visitors see it within minutes.',
    },
    start_datapack_import: {
        action: 'Import sample data',
        consequence:
            'Writes products and categories into the live Commerce instance. Takes several minutes and cannot be paused.',
    },
    start_datapack_export: {
        action: 'Export sample data',
        consequence:
            'Captures this instance\'s data into the shared catalogue, where other people will see it.',
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
