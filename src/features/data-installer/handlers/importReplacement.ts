/**
 * An import over the pack the demo uses (walk F97, owner 2026-11-09). Importing another pack, or
 * another version, used to run as a first install: what was in the store stayed, the project named
 * the new pack, and the old one's data had nothing pointing at it. Now that pack is removed first,
 * in the same job, by the engine's one removal path (`engineRemoval.ts`).
 *
 * The SC's changes to it are settled first, exactly as a removal settles them
 * (`settleChangesBeforeRemoval`): saved into the SC's own pack, saved as a new pack under a name they
 * give, or dropped. With no answer, the SC's own pack is saved into first, as a project reset does;
 * changes in a pack that is not theirs are refused with `CHANGES_NEED_ANSWER`, nothing removed and
 * nothing installed. A save moves the record onto the version it made, so that version
 * is what the import removes.
 *
 * Importing the same version again replaces nothing: it updates in place, as before. Restore is the
 * one exception (`restoreDatapack.ts`, owner 2026-11-12): it puts Commerce back to what the version
 * installs, so it uninstalls and installs even its own version (`restore`).
 *
 * @module features/data-installer/handlers/importReplacement
 */

import { versionLabel } from '../packVersions';
import { replacedName, replacesHeld } from '../replaceWords';
import type { DatapackEngine } from '../services/datapackEngine';
import { nodeRecordFiles, readInstallRecord } from '../services/demoBuilderEngine/installRecord';
import type { ImportRequest } from '../services/importRequest';
import { rememberedPackName } from '../services/packNames';
import type { ValidationResult } from '../types';
import { libraryDisplayName } from './libraryWriter';
import {
    type SavedFirst,
    removalStageReporter,
    settleChangesBeforeRemoval,
} from './removalChanges';
import type { Project } from '@/types/base';
import type { DatapackId } from '@/types/datapack';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** What a start request says about the changes in the pack it replaces (as a reset's do). */
export interface ReplaceAnswerPayload {
    changes?: string;
    saveAs?: { displayName?: unknown };
}

/** The import to start, and what it replaces when it replaces anything. */
export interface Replacement {
    request: ImportRequest;
    /** The pack replaced, as the SC knows it. */
    replaces?: string;
    /** The version a save of the SC's changes made, which is what is removed. */
    saved?: SavedFirst;
    /** Where that save went, as the SC reads it: "Nov 9, 1:56 PM", or a new pack's name (walk F105). */
    savedAs?: string;
    /** The pack replaced is another version of the same pack: that version, "Nov 9, 9:15 AM". */
    replacesVersion?: string;
    /** The import's own check, already run before anything was saved: the start reuses its answer. */
    validate?: () => Promise<ValidationResult>;
}

const REJECTED = 'The Data Installer rejected this install request.';

/**
 * The project's pack by the name the SC knows it by: remembered, else read from the library without
 * a sign-in prompt, else its id.
 */
export async function heldDisplayName(
    context: HandlerContext,
    held: NonNullable<Project['datapack']>,
): Promise<string> {
    try {
        const known =
            held.store === 'library'
                ? rememberedPackName(context.context.globalState, held.name)
                : undefined;
        return known ?? (await libraryDisplayName({ ...context, panel: undefined }, held)) ?? held.name;
    } catch {
        // A name is not worth stopping for: the id still says which pack.
        return held.name;
    }
}

/**
 * The pack the open project uses, when importing `importing` replaces it: another pack or version,
 * or, for a restore, any pack Demo Builder installed (it has a record to remove it by).
 */
async function heldToReplace(
    context: HandlerContext,
    importing: DatapackId,
    restore: boolean,
): Promise<NonNullable<Project['datapack']> | undefined> {
    const project = await context.stateManager.getCurrentProject();
    const held = project?.datapack;
    if (!project?.path || !held) return undefined;
    const hasRecord = (await readInstallRecord(nodeRecordFiles, project.path, held)) !== undefined;
    return (restore && hasRecord) || replacesHeld(held, importing, hasRecord) ? held : undefined;
}

/** A refusal from settling the changes, worded for an import: nothing was installed either. */
function nothingInstalled(response: HandlerResponse): HandlerResponse {
    const error = response.error?.replace(
        'Nothing was uninstalled.',
        'Nothing was uninstalled or installed.',
    );
    return { ...response, ...(error ? { error } : {}) };
}

/**
 * Settle an import that replaces the demo's pack, or pass the request through unchanged.
 *
 * The import is checked before anything is saved: a save must never land for an import that was
 * always going to be refused.
 *
 * @param how.restore - Restore only: replace the pack installed even with its own version
 * @returns the import to start (naming the pack to remove first), or the response to answer instead,
 *   in which case nothing was removed or installed
 */
export async function settleReplacement(
    context: HandlerContext,
    engine: DatapackEngine,
    request: ImportRequest,
    payload: ReplaceAnswerPayload | undefined,
    how: { restore?: boolean } = {},
): Promise<Replacement | { response: HandlerResponse }> {
    const held = await heldToReplace(context, request.id, how.restore === true);
    if (!held) return { request };
    const answer = payload?.changes;
    if (answer !== undefined && answer !== 'keep' && answer !== 'drop') {
        return { response: { success: false, error: `changes is keep or drop, not ${answer}.` } };
    }
    const verdict = await engine.validateImport(request);
    if (!verdict.valid) return { response: { success: false, error: verdict.reason ?? REJECTED } };
    const settled = await settleChangesBeforeRemoval(
        context,
        {
            pack: { name: held.name, version: held.version },
            ...(held.store ? { source: held.store } : {}),
            ...(answer ? { answer } : {}),
            // The SC's own pack is saved into without asking; any other is asked about (CHANGES_NEED_ANSWER).
            unanswered: 'keep',
            ...(payload?.saveAs ? { saveAs: payload.saveAs } : {}),
        },
        removalStageReporter(context),
    );
    if ('response' in settled) return { response: nothingInstalled(settled.response) };
    const replaced = settled.saved?.id ?? { name: held.name, version: held.version };
    const heldName = await heldDisplayName(context, held);
    return {
        request: { ...request, replaces: replaced },
        replaces: replacedName(held, heldName),
        ...(held.name === request.id.name ? { replacesVersion: versionLabel(held.version) } : {}),
        ...(settled.saved ? { saved: settled.saved, savedAs: savedLabel(settled.saved, held, heldName, payload) } : {}),
        validate: async () => verdict,
    };
}

/**
 * Where the SC's changes went, by the datapack's name, never a date (D3, Phase 2): the demo's own
 * pack by the name it shows; a new pack by the name it was given.
 */
function savedLabel(saved: SavedFirst, held: DatapackId, heldName: string, payload: ReplaceAnswerPayload | undefined): string {
    const named = payload?.saveAs?.displayName;
    if (saved.id.name !== held.name && typeof named === 'string' && named.trim() !== '') return named.trim();
    return heldName;
}

/** What a start or a removal answers carries where the changes went, whichever way the start went. */
export function withSavedNote(
    response: HandlerResponse,
    saved: SavedFirst | undefined,
    failed = 'The uninstall could not be started.',
): HandlerResponse {
    if (!saved) {
        return response;
    }
    if (!response.success) {
        return {
            ...response,
            error: `${response.error ?? failed} Your changes were saved: ${saved.note}`,
        };
    }
    return {
        ...response,
        data: { ...(response.data as object), savedNote: saved.note, saved: saved.id },
    };
}

