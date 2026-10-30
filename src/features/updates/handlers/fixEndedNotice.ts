/**
 * Telling the SC when their AI's fix of a kept clash ends (EDS-56).
 *
 * "Fix with AI" keeps a storefront update's clash in the local copy and opens the SC's
 * AI on it; the AI finishes or drops it through `finish_storefront_update`. Until
 * 2026-10-30 nothing told the SC either way: the Updates window kept saying the AI was
 * working on it, and the owner asked "AI finished. Now what do I do as an end user?"
 *
 * So the ending is told twice, both best effort:
 * - a notification, naming the update as its row does; a finished one offers the live
 *   storefront, the URL the dashboard's Open in Browser opens;
 * - the Updates window's row, when the window that kept the clash is still showing that
 *   run (`watchKeptRows`, by the run; `forgetKeptRows`, by the next list or run, whose ids
 *   would name other rows). The local copy line is told "up to date" only when the copy
 *   holds nothing GitHub does not, read after the push; otherwise its line stays as the
 *   run left it.
 *
 * Neither is waited on: the agent's answer never depends on the window (headless-safe).
 *
 * @module features/updates/handlers/fixEndedNotice
 */

import * as vscode from 'vscode';
import { openPrivateBrowser } from '@/core/utils/browserUtils';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { validateURL } from '@/core/validation/URLValidator';
import { storefrontUpdateName } from '@/features/updates/services/pendingUpdateRows';
import type { Project } from '@/types/base';
import type { UpdateRowStatus } from '@/types/pendingUpdates';
import { getEdsLiveUrl } from '@/types/typeGuards';

/** How the fix ended: pushed and live, dropped by the AI, or dropped for a newer version. */
type FixEnding = 'finished' | 'left' | 'moved-on';

/** Where a kept clash's project is on the Updates window that kept it. */
export interface KeptRow {
    /** The project's folder name, as `finish_storefront_update` takes it. */
    projectName: string;
    /** The update's row, by the id the window knows it by. */
    rowId: string;
    /** The project's local copy step. */
    localCopyId: string;
}

const OPEN_STOREFRONT = 'Open storefront';

/** What the row says once the fix has ended. */
const ROW_STATUS: Record<FixEnding, Omit<UpdateRowStatus, 'id'>> = {
    finished: { state: 'done', message: 'Updated by your AI.' },
    left: {
        state: 'skipped',
        message: 'Not updated. Your AI dropped the fix, so nothing changed. It is still offered in Check for Updates.',
    },
    'moved-on': {
        state: 'skipped',
        message: 'Not updated. A newer version came out, so the fix was dropped and nothing changed. Check for updates again.',
    },
};

let watched = new Map<string, { row: KeptRow; tell: (status: UpdateRowStatus) => void }>();

/**
 * Remember the rows of a run whose clashes were kept for the SC's AI, and how to reach
 * the window showing them.
 *
 * @param rows - one per kept clash
 * @param tell - pushes a row's status to that window; never throws
 */
export function watchKeptRows(rows: KeptRow[], tell: (status: UpdateRowStatus) => void): void {
    for (const row of rows) watched.set(row.projectName, { row, tell });
}

/** Forget every remembered row: the window has moved on to another list or run. */
export function forgetKeptRows(): void {
    watched = new Map();
}

/** The notification's sentence. */
function endingLine(project: Project, track: 'template' | 'boilerplate', ending: FixEnding): string {
    const update = `${getProjectDisplayName(project)}'s ${storefrontUpdateName(project, track)}`;
    if (ending === 'finished') return `${update} is live.`;
    if (ending === 'left') {
        return `Your AI dropped its fix for ${update}. Nothing changed, and the update is still offered in Check for Updates.`;
    }
    return `Your AI's fix for ${update} was dropped, because a newer version came out. `
        + 'Nothing changed. Check for updates to get the newer one.';
}

/** The live storefront to offer, when the project has one that validates. */
function liveSiteOf(project: Project): string | undefined {
    const url = getEdsLiveUrl(project);
    if (!url) return undefined;
    try {
        validateURL(url);
        return url;
    } catch {
        return undefined;
    }
}

/** Show the sentence; a finished fix offers the storefront. Not awaited. */
function notify(line: string, url: string | undefined): void {
    if (!url) {
        void vscode.window.showInformationMessage(line);
        return;
    }
    void vscode.window.showInformationMessage(line, OPEN_STOREFRONT).then(async (choice) => {
        if (choice === OPEN_STOREFRONT) await openPrivateBrowser(url);
    });
}

/** Flip the window's row, when it is still showing the run that kept the clash. */
function tellRow(project: Project, ending: FixEnding, localCopyClean: boolean): void {
    const entry = watched.get(project.name);
    if (!entry) return;
    watched.delete(project.name);
    entry.tell({ id: entry.row.rowId, ...ROW_STATUS[ending] });
    if (ending === 'finished' && localCopyClean) entry.tell({ id: entry.row.localCopyId, state: 'done' });
}

/**
 * Tell the SC how their AI's fix ended: a notification, and the Updates window's row when
 * it is still showing the run.
 *
 * @param project - the project whose kept clash ended
 * @param track - which storefront update it was
 * @param ending - how it ended
 * @param localCopyClean - a finished fix: whether the local copy holds nothing GitHub does not
 * @returns the sentence the SC was shown
 */
export function tellFixEnded(
    project: Project,
    track: 'template' | 'boilerplate',
    ending: FixEnding,
    localCopyClean = false,
): string {
    const line = endingLine(project, track, ending);
    notify(line, ending === 'finished' ? liveSiteOf(project) : undefined);
    tellRow(project, ending, localCopyClean);
    return line;
}
