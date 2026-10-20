/**
 * The Updates modal's wire shapes (PL-80): what Check for Updates found, as rows the
 * projects list draws, and what the SC asked to apply.
 *
 * One declaration, imported by the extension (which builds the rows from the shared
 * check, `computeUpdateSelections`) and by the webview (which draws and ticks them), so
 * a field one side stops sending fails the build. Never imports `vscode`: it compiles
 * into the browser bundle.
 *
 * No `Project` crosses: a row carries an id, and the extension keeps the check it came
 * from and applies the ticked ids against it.
 *
 * @module types/pendingUpdates
 */

/** What a row updates. */
export type PendingUpdateKind =
    | 'extension'
    | 'forkSync'
    | 'template'
    | 'component'
    | 'adobeMcp'
    | 'blockLibrary'
    | 'blockLibraryInstall'
    | 'inspector'
    | 'integration';

/** One update the SC can tick. */
export interface PendingUpdateRow {
    /** Stable within one check; what `apply-updates` sends back. */
    id: string;
    kind: PendingUpdateKind;
    /** The heading the row sits under, in the order headings are drawn. */
    group: PendingUpdateGroup;
    /** What it updates, in the SC's words: "Demo Builder Blocks", "EDS template". */
    label: string;
    /** What changes: "3 commits behind", "1.2.0 → 1.3.0", "install". */
    detail: string;
    /** Whether it starts ticked: everything that can be applied from here does. */
    ticked: boolean;
    /** Set when it cannot be applied from here; the row is shown unticked and locked. */
    lockedReason?: string;
}

/** A heading: Demo Builder itself, one project, or the template repositories. */
export interface PendingUpdateGroup {
    /** `extension`, a project's path, or `forks`. */
    key: string;
    /** "Demo Builder", the project's display name, "Template repositories". */
    title: string;
}

/** `check-updates` — the answer (Pattern B). */
export interface CheckUpdatesResponse {
    success: boolean;
    data?: { rows: PendingUpdateRow[] };
    error?: string;
}

/** `apply-updates` — the ids of the rows the SC left ticked. */
export interface ApplyUpdatesRequest {
    ids: string[];
}
