/**
 * useEditDraftAutosave — persist in-progress edit-mode changes to a reversible
 * per-project draft.
 *
 * In edit mode the wizard holds every edit in in-memory state; nothing survives an
 * exit until the final rebuild. This hook watches the editable slice
 * ({@link pickEditDraft}) and debounce-posts `save-edit-draft` so reopening the
 * editor restores the latest edits. The debounced write is the primary mechanism;
 * the hook also flushes on unmount as a best-effort catch for the last
 * sub-debounce edits (a webview panel dispose may tear the view down without a
 * React unmount, so the debounce — not the flush — is what guarantees
 * persistence). A draft is written only while the slice diverges from the saved
 * baseline. In create/import mode (no project path to key on) it does nothing.
 *
 * @module features/project-creation/ui/wizard/hooks/useEditDraftAutosave
 */

import { useEffect, useRef } from 'react';
import { pickEditDraft } from '../editDraft';
import { vscode } from '@/core/ui/utils/vscode-api';
import type { EditDraft, WizardState } from '@/types/webview';

/**
 * Debounce for the edit-draft autosave: long enough to coalesce a burst of edits,
 * short enough that a brief pause before closing still persists the latest.
 */
export const EDIT_DRAFT_DEBOUNCE_MS = 600;

interface UseEditDraftAutosaveArgs {
    /** The live wizard state; only its editable slice is persisted. */
    state: WizardState;
    /** The edited project's path (edit mode only). Falsy → autosave is disabled. */
    editProjectPath?: string;
    /**
     * The serialized editable slice of the project's SAVED (draft-less) state. A
     * draft is written only when the current slice diverges from this baseline, so
     * merely opening the editor (or discarding back to saved) never persists a
     * no-op draft — which would otherwise raise a false "unsaved changes" banner.
     */
    baselineSerialized: string;
}

interface PendingDraft {
    path: string;
    draft: EditDraft;
}

/**
 * Autosave the wizard's editable slice to a per-project draft (edit mode only),
 * but only while it differs from the saved baseline.
 *
 * @param args - the live wizard state, the edited project's path, and the baseline
 */
export function useEditDraftAutosave({
    state,
    editProjectPath,
    baselineSerialized,
}: UseEditDraftAutosaveArgs): void {
    const draft = editProjectPath ? pickEditDraft(state) : null;
    // Only the SERIALIZED editable slice drives the effect — raw `state` changes
    // identity every render, which would defeat the debounce. An empty string means
    // "nothing to persist": create mode, or the slice equals the saved baseline.
    const currentSerialized = draft ? JSON.stringify(draft) : '';
    const serialized =
        draft && currentSerialized !== baselineSerialized ? currentSerialized : '';

    const pendingRef = useRef<PendingDraft | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Whether the slice has diverged from the baseline at least once this session —
    // so a return to baseline (edits reverted) knows to CLEAR the persisted draft.
    const divergedRef = useRef<boolean>(false);
    // Latest values, read inside the effect without widening its dependency list.
    // Null when there is nothing to persist (create mode, or slice === baseline).
    const latestRef = useRef<PendingDraft | null>(null);
    latestRef.current =
        editProjectPath && draft && serialized ? { path: editProjectPath, draft } : null;
    const pathRef = useRef<string | undefined>(editProjectPath);
    pathRef.current = editProjectPath;

    useEffect(() => {
        const latest = latestRef.current;
        if (latest) {
            divergedRef.current = true;
            pendingRef.current = latest;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                const pending = pendingRef.current;
                if (pending) {
                    vscode.postMessage('save-edit-draft', {
                        projectPath: pending.path,
                        draft: pending.draft,
                    });
                }
                pendingRef.current = null;
                timerRef.current = null;
            }, EDIT_DRAFT_DEBOUNCE_MS);
            return () => {
                if (timerRef.current) {
                    clearTimeout(timerRef.current);
                    timerRef.current = null;
                }
            };
        }

        // At the baseline (or create mode). If the slice diverged earlier this
        // session and has now returned to the saved values, the edits were reverted:
        // drop the pending save and clear any persisted draft so no stale draft (and
        // no false "unsaved changes restored" banner) survives.
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        pendingRef.current = null;
        if (divergedRef.current && pathRef.current) {
            divergedRef.current = false;
            vscode.postMessage('clear-edit-draft', { projectPath: pathRef.current });
        }
        return undefined;
    }, [serialized]);

    // Flush the latest pending draft on unmount so closing the editor persists it.
    useEffect(() => {
        return () => {
            const pending = pendingRef.current;
            if (pending) {
                vscode.postMessage('save-edit-draft', {
                    projectPath: pending.path,
                    draft: pending.draft,
                });
                pendingRef.current = null;
            }
        };
    }, []);
}
