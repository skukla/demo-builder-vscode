/**
 * `needsUser` — the structured handoff a tool returns when finishing genuinely
 * requires a person.
 *
 * Four things in this extension cannot be automated, and pretending otherwise is
 * worse than saying so: the Adobe IMS browser login, GitHub OAuth, the DA.live
 * bookmarklet-and-paste, and the GitHub App install approval. A few more are
 * automatable in principle but deliberately gated behind a VS Code dialog.
 *
 * The rule is that such a capability still gets a TOOL. The tool does everything
 * it can, then hands back — naming what the user must do, which surface does it,
 * what to tell them, and which tool confirms they finished. The agent stays the
 * driver; the user supplies only the step that needs them.
 *
 * This generalises two conventions already here: the `needsAuth` handoff that
 * `create_project` and the content tools return, and `open_view`, which exists
 * for no other reason than handing control back to the UI.
 *
 * ## Why a handoff and not a bare failure
 *
 * A tool that opens a panel and returns `{success: true}` is the defect
 * `handleAddAppBuilderComponent` ships today: on a guard failure it runs
 * `demoBuilder.configureProject` and reports success while nothing happened.
 * Neither the agent nor a human reading the transcript can detect that. A
 * handoff is the honest shape — it says the work is not done and names the way
 * to finish it.
 */

/** Why a person is required. Drives how an agent phrases the ask. */
export type HandoffReason =
    /** A browser redirect the extension cannot complete (IMS, GitHub OAuth). */
    | 'browser-oauth'
    /** A secret must be typed; it must not travel through a tool argument. */
    | 'secret-entry'
    /** A native open/save dialog. */
    | 'file-picker'
    /** An approval on someone else's site (e.g. installing a GitHub App). */
    | 'approval'
    /** A VS Code setting the user edits directly. */
    | 'settings-edit';

/** Where the user completes the step. Must be openable, not merely describable. */
export type HandoffTarget =
    /** A view `open_view` accepts. */
    | { view: 'projects_list' | 'dashboard' | 'configure' | 'logs' }
    /** A registered VS Code command id. */
    | { command: string };

export interface NeedsUser {
    reason: HandoffReason;
    /** The action in the user's words — "Sign in to Adobe", not "invoke IMS flow". */
    what: string;
    where: HandoffTarget;
    /** Verbatim for the agent to relay. Written for the user, not the model. */
    tellUser: string;
    /** The tool that confirms completion, so the agent need not guess. */
    resumeWith: string;
}

/**
 * Build a handoff result.
 *
 * Deliberately minimal — this is returned often, so it carries no state the agent
 * already has. Five fields, each of which an agent needs to act.
 */
export function needsUser(handoff: NeedsUser): { needsUser: NeedsUser } {
    return { needsUser: handoff };
}

/** True when a tool result is a handoff rather than an outcome. */
export function isHandoff(value: unknown): value is { needsUser: NeedsUser } {
    return typeof value === 'object' && value !== null && 'needsUser' in value;
}
