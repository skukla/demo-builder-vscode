/**
 * useDemoPackage — the "Save as demo package" dialog's state. One read on open
 * (the prefilled draft, the checks, the link), then two commitment points: Save
 * writes the description file into the SC's own storefront repository and puts
 * the card on their Add a demo list; Remove takes both back. Typing and ticking
 * never talk to the host (`docs/patterns/selection-pattern.md`).
 *
 * @module features/dashboard/ui/components/demo-package/useDemoPackage
 */

import { useCallback, useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type {
    DemoPackageCheck,
    DemoPackagePreview,
    RemoveDemoPackageResult,
    SaveDemoPackageRequest,
    SaveDemoPackageResult,
} from '@/types/webviewRequests';

/** A handler's answer: branch on `success` before reading anything else (webview-command-handler). */
interface Answer<D> {
    success: boolean;
    error?: string;
    data?: D;
}

export interface PackageDraft {
    name: string;
    description: string;
    markTemplate: boolean;
}

/** What the last commit did, in the words the dialog shows. */
export type PackageOutcome =
    | { kind: 'saved'; file: SaveDemoPackageResult['file']; fileReason?: string }
    | { kind: 'removed'; file: RemoveDemoPackageResult['file'] };

export type PackageLoad =
    | { status: 'loading' }
    | { status: 'failed'; error: string }
    | { status: 'ready'; link: string; checks: DemoPackageCheck[]; saved: boolean };

export interface UseDemoPackage {
    load: PackageLoad;
    draft: PackageDraft;
    setName: (name: string) => void;
    setDescription: (description: string) => void;
    setMarkTemplate: (on: boolean) => void;
    /** 'save' or 'remove' while that request is in flight. */
    busy?: 'save' | 'remove';
    outcome?: PackageOutcome;
    actionError?: string;
    canSave: boolean;
    save: () => void;
    remove: () => void;
}

const EMPTY_DRAFT: PackageDraft = { name: '', description: '', markTemplate: false };

/**
 * The dialog's state and its two commits.
 *
 * @returns the state and the callbacks the dialog binds
 */
export function useDemoPackage(): UseDemoPackage {
    const [load, setLoad] = useState<PackageLoad>({ status: 'loading' });
    const [draft, setDraft] = useState<PackageDraft>(EMPTY_DRAFT);
    const [busy, setBusy] = useState<'save' | 'remove' | undefined>();
    const [outcome, setOutcome] = useState<PackageOutcome | undefined>();
    const [actionError, setActionError] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        webviewClient
            .request<Answer<DemoPackagePreview>>('getDemoPackagePreview')
            .then((answer) => {
                if (cancelled) return;
                if (!answer.success || !answer.data) {
                    setLoad({ status: 'failed', error: answer.error ?? 'The project could not be read.' });
                    return;
                }
                const { draft: prefilled, checks, link, saved, onList, templateFlagSet } = answer.data;
                setDraft({ name: prefilled.name, description: prefilled.description, markTemplate: templateFlagSet });
                // "Saved" means there is something to remove: our file, or our card.
                setLoad({ status: 'ready', link, checks, saved: saved || onList });
            })
            .catch((error: Error) => {
                if (!cancelled) setLoad({ status: 'failed', error: error.message });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const save = useCallback(() => {
        if (load.status !== 'ready') return;
        const request: SaveDemoPackageRequest = {
            name: draft.name.trim(),
            description: draft.description.trim(),
            markTemplate: draft.markTemplate,
        };
        setBusy('save');
        setActionError(undefined);
        webviewClient
            .request<Answer<SaveDemoPackageResult>>('saveDemoPackage', request)
            .then((answer) => {
                if (!answer.success || !answer.data) {
                    setActionError(answer.error ?? 'The demo package could not be saved.');
                    return;
                }
                const { file, fileReason, checks, link } = answer.data;
                setOutcome({ kind: 'saved', file, ...(fileReason ? { fileReason } : {}) });
                setLoad({ status: 'ready', link, checks, saved: true });
            })
            .catch((error: Error) => setActionError(error.message))
            .finally(() => setBusy(undefined));
    }, [draft, load]);

    const remove = useCallback(() => {
        if (load.status !== 'ready') return;
        setBusy('remove');
        setActionError(undefined);
        webviewClient
            .request<Answer<RemoveDemoPackageResult>>('removeDemoPackage')
            .then((answer) => {
                if (!answer.success || !answer.data) {
                    setActionError(answer.error ?? 'The demo package could not be removed.');
                    return;
                }
                setOutcome({ kind: 'removed', file: answer.data.file });
                setDraft((current) => ({ ...current, markTemplate: false }));
                setLoad({ ...load, saved: false });
            })
            .catch((error: Error) => setActionError(error.message))
            .finally(() => setBusy(undefined));
    }, [load]);

    return {
        load,
        draft,
        setName: useCallback((name: string) => setDraft((current) => ({ ...current, name })), []),
        setDescription: useCallback(
            (description: string) => setDraft((current) => ({ ...current, description })),
            [],
        ),
        setMarkTemplate: useCallback(
            (markTemplate: boolean) => setDraft((current) => ({ ...current, markTemplate })),
            [],
        ),
        busy,
        outcome,
        actionError,
        canSave: load.status === 'ready' && draft.name.trim().length > 0 && !busy,
        save,
        remove,
    };
}
