/**
 * useShareLink — the Share dialog's link form state, once the storefront has
 * been read. Two commitment points, as Save as demo package had: the button
 * (save the details when they are missing or changed, then copy) and the undo
 * (remove the details). Typing and ticking never talk to the host
 * (`docs/patterns/selection-pattern.md`).
 *
 * "Needs a save" is the one rule the button's words follow: the details file is
 * not ours yet, or the name, description or Welcome box differ from what was
 * last saved. Otherwise the press only copies.
 *
 * @module features/dashboard/ui/components/share/useShareLink
 */

import { useCallback, useState } from 'react';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type {
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

interface ShareDraft {
    name: string;
    description: string;
}

export interface UseShareLink {
    draft: ShareDraft;
    setName: (name: string) => void;
    setDescription: (description: string) => void;
    welcome: boolean;
    setWelcome: (welcome: boolean) => void;
    /** The press will write the details first. */
    needsSave: boolean;
    canPress: boolean;
    /** Something of ours to undo: our file, or our card. */
    canRemove: boolean;
    busy?: 'save' | 'remove';
    copied: boolean;
    error?: { title: 'save' | 'remove'; message: string };
    /** Why the details file was left alone, when it was not ours. */
    skipped?: string;
    removed?: RemoveDemoPackageResult;
    press: () => void;
    remove: () => void;
}

function sameDraft(a: ShareDraft, b: ShareDraft): boolean {
    return a.name.trim() === b.name.trim() && a.description.trim() === b.description.trim();
}

/** The two host writes, each answering its data or throwing the host's words. */
async function saveDetails(request: SaveDemoPackageRequest): Promise<SaveDemoPackageResult> {
    const answer = await webviewClient.request<Answer<SaveDemoPackageResult>>('saveDemoPackage', request);
    if (!answer.success || !answer.data) throw new Error(answer.error ?? 'The details could not be saved.');
    return answer.data;
}

async function removeDetails(): Promise<RemoveDemoPackageResult> {
    const answer = await webviewClient.request<Answer<RemoveDemoPackageResult>>('removeDemoPackage');
    if (!answer.success || !answer.data) throw new Error(answer.error ?? 'The details could not be removed.');
    return answer.data;
}

/**
 * The link form's state and its two acts.
 *
 * @param preview - what the storefront read answered
 * @returns the state and the callbacks the form binds
 */
export function useShareLink(preview: DemoPackagePreview): UseShareLink {
    const [saved, setSaved] = useState(preview.saved);
    const [onList, setOnList] = useState(preview.onList);
    const [baseline, setBaseline] = useState<ShareDraft>(preview.draft);
    const [draft, setDraft] = useState<ShareDraft>(preview.draft);
    // A storefront already shared shows where its card is; a new one defaults to on.
    const [welcome, setWelcome] = useState(preview.saved ? preview.onList : true);
    const [busy, setBusy] = useState<'save' | 'remove' | undefined>();
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<UseShareLink['error']>();
    const [skipped, setSkipped] = useState<string | undefined>();
    const [removed, setRemoved] = useState<RemoveDemoPackageResult | undefined>();

    const needsSave = !saved || !sameDraft(draft, baseline) || welcome !== onList;
    const begin = useCallback((kind: 'save' | 'remove'): void => {
        setBusy(kind);
        setError(undefined);
        setSkipped(undefined);
        setRemoved(undefined);
    }, []);

    const press = useCallback(() => {
        const request: SaveDemoPackageRequest = {
            name: draft.name.trim(),
            description: draft.description.trim(),
            addToWelcome: welcome,
        };
        begin('save');
        (async () => {
            if (needsSave) {
                const result = await saveDetails(request);
                setOnList(result.onList);
                setSaved(result.file !== 'skipped');
                setBaseline({ name: request.name, description: request.description });
                if (result.file === 'skipped') setSkipped(result.fileReason);
            }
            await navigator.clipboard.writeText(preview.link);
            setCopied(true);
            setTimeout(() => setCopied(false), FRONTEND_TIMEOUTS.LOADING_MIN_DISPLAY);
        })()
            .catch((failure: Error) => setError({ title: 'save', message: failure.message }))
            .finally(() => setBusy(undefined));
    }, [begin, draft, welcome, needsSave, preview.link]);

    const remove = useCallback(() => {
        begin('remove');
        removeDetails()
            .then((result) => {
                setRemoved(result);
                setSaved(false);
                setOnList(false);
            })
            .catch((failure: Error) => setError({ title: 'remove', message: failure.message }))
            .finally(() => setBusy(undefined));
    }, [begin]);

    return {
        draft,
        setName: useCallback((name: string) => setDraft((current) => ({ ...current, name })), []),
        setDescription: useCallback((description: string) => setDraft((current) => ({ ...current, description })), []),
        welcome,
        setWelcome,
        needsSave,
        canPress: !busy && (!needsSave || draft.name.trim().length > 0),
        canRemove: saved || onList,
        busy,
        copied,
        error,
        skipped,
        removed,
        press,
        remove,
    };
}
