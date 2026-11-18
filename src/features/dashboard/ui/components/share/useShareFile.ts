/**
 * useShareFile — the Share dialog's file form state: which parts are ticked, and the one save that
 * bundles them through the host's save dialog. Lifted out of `ShareFileForm` when its Save File
 * moved to the window's footer (step-07 Win2), so the footer and the form read one state.
 *
 * @module features/dashboard/ui/components/share/useShareFile
 */

import { useCallback, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import type { ExportDemoBundleRequest, ExportDemoBundleResult } from '@/types/webviewRequests';

/** A handler's answer: branch on `success` before reading anything else (webview-command-handler). */
interface Answer<D> {
    success: boolean;
    error?: string;
    data?: D;
}

const FILE_FAILED = "Couldn't save the file.";

export interface UseShareFile {
    setup: boolean;
    setSetup: (setup: boolean) => void;
    storefront: boolean;
    setStorefront: (storefront: boolean) => void;
    /** Nothing is ticked, so there is nothing to save. */
    nothing: boolean;
    busy: boolean;
    saved?: ExportDemoBundleResult;
    error?: string;
    save: () => void;
    /** Shows the saved file in the operating system's file browser (walk F236). */
    reveal: () => void;
}

/**
 * The file form's state and its one act.
 *
 * @param isEds - Edge Delivery project: the storefront part applies, and starts ticked
 * @returns the state and the save
 */
export function useShareFile(isEds: boolean): UseShareFile {
    const [setup, setSetup] = useState(true);
    const [storefront, setStorefront] = useState(isEds);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState<ExportDemoBundleResult | undefined>();
    const [error, setError] = useState<string | undefined>();
    const save = useCallback((): void => {
        setBusy(true);
        setError(undefined);
        webviewClient
            .request<Answer<ExportDemoBundleResult>>('exportDemoBundle', { setup, storefront } satisfies ExportDemoBundleRequest)
            .then((answer) => {
                if (!answer.success || !answer.data) {
                    setError(answer.error ?? FILE_FAILED);
                    return;
                }
                if (!answer.data.cancelled) setSaved(answer.data);
            })
            .catch((failure: Error) => setError(failure.message))
            .finally(() => setBusy(false));
    }, [setup, storefront]);
    const savedPath = saved?.path;
    const reveal = useCallback((): void => {
        if (savedPath) void webviewClient.request('revealFile', { path: savedPath });
    }, [savedPath]);
    return { setup, setSetup, storefront, setStorefront, nothing: !setup && !storefront, busy, saved, error, save, reveal };
}
