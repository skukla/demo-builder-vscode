/**
 * useSavePackage: Save as Package's state once the storefront has been read (EDS-72). Two acts:
 * save the details file with the card on the SC's own Welcome step, and remove both. Each ends as
 * an outcome the window shows as its result.
 *
 * @module features/dashboard/ui/components/share/useSavePackage
 */

import { useCallback, useState } from 'react';
import { removeDetails, saveDetails } from './demoPackageRequests';
import { useShareDraft, type UseShareDraft } from './useShareDraft';
import type { DemoPackagePreview, RemoveDemoPackageResult } from '@/types/webviewRequests';

/** How an act ended. */
export type SavePackageOutcome =
    | { kind: 'saved'; name: string; fileKept: boolean }
    | { kind: 'save-failed'; reason: string }
    | { kind: 'removed'; result: RemoveDemoPackageResult }
    | { kind: 'remove-failed'; reason: string };

export interface UseSavePackage extends UseShareDraft {
    busy?: 'save' | 'remove';
    /** A name to save under, and nothing running. */
    canSave: boolean;
    /** The project's card is on the Welcome step: Remove Package is offered. */
    onList: boolean;
    outcome?: SavePackageOutcome;
    save: () => void;
    remove: () => void;
}

/**
 * The form's draft, its two acts and how the last one ended.
 *
 * @param preview - what the storefront read answered
 * @returns the state and the callbacks the window binds
 */
export function useSavePackage(preview: DemoPackagePreview): UseSavePackage {
    const details = useShareDraft(preview.draft);
    const [busy, setBusy] = useState<'save' | 'remove' | undefined>();
    const [outcome, setOutcome] = useState<SavePackageOutcome | undefined>();
    const { name, description } = details.draft;

    const save = useCallback(() => {
        const request = { name: name.trim(), description: description.trim(), addToWelcome: true };
        setBusy('save');
        saveDetails(request)
            .then((result) => setOutcome({ kind: 'saved', name: request.name, fileKept: result.file === 'skipped' }))
            .catch((failure: Error) => setOutcome({ kind: 'save-failed', reason: failure.message }))
            .finally(() => setBusy(undefined));
    }, [name, description]);

    const remove = useCallback(() => {
        setBusy('remove');
        removeDetails()
            .then((result) => setOutcome({ kind: 'removed', result }))
            .catch((failure: Error) => setOutcome({ kind: 'remove-failed', reason: failure.message }))
            .finally(() => setBusy(undefined));
    }, []);

    return {
        ...details,
        busy,
        canSave: !busy && name.trim().length > 0,
        onList: preview.onList,
        outcome,
        save,
        remove,
    };
}
