/**
 * useShareLink — the Share dialog's link form state, once the storefront has
 * been read. One commitment point: the button saves the details when they are
 * missing or changed, then copies. Typing never talks to the host
 * (`docs/patterns/selection-pattern.md`).
 *
 * "Needs a save" is the one rule the button's words follow: the details file is
 * not ours yet, or the name or description differ from what was last saved.
 * Otherwise the press only copies. The save sends no `addToWelcome`, so the SC's
 * Welcome step is left exactly as it is: the card is Save as Package's (EDS-72).
 *
 * @module features/dashboard/ui/components/share/useShareLink
 */

import { useCallback, useState } from 'react';
import { saveDetails } from './demoPackageRequests';
import { useShareDraft, type ShareDraft, type UseShareDraft } from './useShareDraft';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import type { DemoPackagePreview, SaveDemoPackageRequest } from '@/types/webviewRequests';

export interface UseShareLink extends UseShareDraft {
    /** The press will write the details first. */
    needsSave: boolean;
    canPress: boolean;
    busy?: 'save';
    copied: boolean;
    /** Why the link could not be prepared. */
    error?: string;
    /** Why the details file was left alone, when it was not ours. */
    skipped?: string;
    press: () => void;
}

function sameDraft(a: ShareDraft, b: ShareDraft): boolean {
    return a.name.trim() === b.name.trim() && a.description.trim() === b.description.trim();
}

/**
 * The link form's state and its one act.
 *
 * @param preview - what the storefront read answered
 * @returns the state and the callbacks the form binds
 */
export function useShareLink(preview: DemoPackagePreview): UseShareLink {
    const details = useShareDraft(preview.draft);
    const { draft } = details;
    const [saved, setSaved] = useState(preview.saved);
    const [baseline, setBaseline] = useState<ShareDraft>(preview.draft);
    const [busy, setBusy] = useState<'save' | undefined>();
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const [skipped, setSkipped] = useState<string | undefined>();

    const needsSave = !saved || !sameDraft(draft, baseline);

    const press = useCallback(() => {
        const request: SaveDemoPackageRequest = { name: draft.name.trim(), description: draft.description.trim() };
        setBusy('save');
        setError(undefined);
        setSkipped(undefined);
        (async () => {
            if (needsSave) {
                const result = await saveDetails(request);
                setSaved(result.file !== 'skipped');
                setBaseline({ name: request.name, description: request.description });
                if (result.file === 'skipped') setSkipped(result.fileReason);
            }
            await navigator.clipboard.writeText(preview.link);
            setCopied(true);
            setTimeout(() => setCopied(false), FRONTEND_TIMEOUTS.LOADING_MIN_DISPLAY);
        })()
            .catch((failure: Error) => setError(failure.message))
            .finally(() => setBusy(undefined));
    }, [draft, needsSave, preview.link]);

    return {
        ...details,
        needsSave,
        canPress: !busy && (!needsSave || draft.name.trim().length > 0),
        busy,
        copied,
        error,
        skipped,
        press,
    };
}
