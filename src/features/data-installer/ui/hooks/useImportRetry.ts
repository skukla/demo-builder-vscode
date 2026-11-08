/**
 * The import window's three ways to run an import (owner, 2026-11-07): Import from the form, Retry
 * on a stop a retry can get past, and Fix with AI on a problem it cannot. Retry runs the same import
 * again (what is already in sends nothing, so it carries on from where it stopped) and counts its
 * presses, so the window can offer Fix with AI once retrying has not helped (`RETRIES_BEFORE_FIX`).
 * Fix with AI asks the extension to open the SC's AI on the recorded problem (`importFixHandlers.ts`).
 *
 * Split out of `ImportDatapackModal`, which keeps the state the requests share.
 *
 * @module features/data-installer/ui/hooks/useImportRetry
 */

import { useCallback, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';

export interface ImportRuns {
    /** How many times Retry was pressed on this import; a fresh Import starts again at none. */
    retries: number;
    startImport: () => void;
    retry: () => void;
    fixWithAi: () => void;
}

/**
 * @param runImport - starts the import the form describes. Stable: the callbacks depend on it.
 */
export function useImportRetry(runImport: () => void): ImportRuns {
    const [retries, setRetries] = useState(0);
    const startImport = useCallback((): void => {
        setRetries(0);
        runImport();
    }, [runImport]);
    const retry = useCallback((): void => {
        setRetries((n) => n + 1);
        runImport();
    }, [runImport]);
    const fixWithAi = useCallback((): void => {
        void webviewClient.request('fix-datapack-import-with-ai', {});
    }, []);
    return { retries, startImport, retry, fixWithAi };
}
