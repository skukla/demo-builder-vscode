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
    | 'boilerplate'
    | 'finish'
    | 'component'
    | 'adobeMcp'
    | 'blockLibrary'
    | 'blockLibraryInstall'
    | 'inspector'
    | 'integration';

/** One update the SC can tick. */
export interface PendingUpdateRow {
    /** Stable within one check; what `applyUpdates` sends back. */
    id: string;
    kind: PendingUpdateKind;
    /** The heading the row sits under, in the order headings are drawn. */
    group: PendingUpdateGroup;
    /** What it updates, in the SC's words: "Demo Builder Blocks", "EDS template". */
    label: string;
    /** What changes: "Newer version", "1.2.0 → 1.3.0", "install". */
    detail: string;
    /** Whether it starts ticked: everything that can be applied from here does, but a redeploy. */
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

/** `showUpdates` — pushed to a projects list already open: the rows to show. */
export interface ShowUpdatesPayload {
    rows: PendingUpdateRow[];
}

/** `applyUpdates` — the ids of the rows the SC left ticked. */
export interface ApplyUpdatesRequest {
    ids: string[];
    /** Always the modal: the run is told in the projects list's progress modal. */
    progress?: 'modal';
}

/** Where one ticked row has got to in a run. */
export type UpdateRowState = 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

/** `updateRowStatus` — pushed as each ticked row starts and ends. */
export interface UpdateRowStatus {
    id: string;
    state: UpdateRowState;
    /** Done: what to know, when there is something. Failed or skipped: why. */
    message?: string;
}

/**
 * The id a project's local copy step is told by. It is not a row of the check: after a
 * project's updates wrote to GitHub, its panel gains one more step, bringing the copy
 * agents edit up to it, which stays with its outcome (owner, 2026-10-21: it was a passing
 * stage line that vanished).
 *
 * @param projectPath - the project, as its panel is keyed
 * @returns the step's id
 */
export function localCopyRowId(projectPath: string): string {
    return `localCopy:${projectPath}`;
}

/** `applyUpdates` — the answer (Pattern B). Each row's own outcome was pushed as it ended. */
export interface ApplyUpdatesResponse {
    success: boolean;
    error?: string;
    /** Set when some updates did not apply; the run still ended, and their rows say why. */
    warning?: string;
    /**
     * How many rows the SC left unticked a fresh check still lists, when any: the window
     * then offers "Back to updates". A ticked row that did not apply is not counted.
     */
    remaining?: number;
}

/** `recheckUpdates` — the rows of a fresh Check for Updates; empty when nothing waits. */
export interface RecheckUpdatesResponse {
    success: true;
    data: { rows: PendingUpdateRow[] };
}

/** `takeUpdatesRequest` — the rows to show when the screen was opened for them, else null. */
export interface TakeUpdatesRequestResponse {
    success: true;
    data: { rows: PendingUpdateRow[] | null };
}
