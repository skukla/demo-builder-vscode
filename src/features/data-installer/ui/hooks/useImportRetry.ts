/**
 * The job window's three ways to run a job (owner, 2026-11-07): Install from the summary, Retry
 * on a stop a retry can get past, and Fix with AI on a problem it cannot. Retry runs the same import
 * again (what is already in sends nothing, so it carries on from where it stopped) and counts its
 * presses, so the window can offer Fix with AI once retrying has not helped (`RETRIES_BEFORE_FIX`).
 * Fix with AI asks the extension to open the SC's AI on the recorded problem (`useFixWithAi`);
 * a Dry Run's asks for the recorded dry run instead (step 03, S5), sending nothing of the window.
 * With nothing to fix, the refusal is `fixProblem`, the window's problem line (step-07 P5).
 *
 * Used by `useDatapackJob`, which keeps the state the requests share.
 *
 * @module features/data-installer/ui/hooks/useImportRetry
 */

import { useCallback, useState } from 'react';
import { useFixWithAi } from './useFixWithAi';

export interface ImportRuns {
    /** How many times Retry was pressed on this import; a fresh Import starts again at none. */
    retries: number;
    startImport: () => void;
    retry: () => void;
    fixWithAi: () => void;
    fixDryRunWithAi: () => void;
    /** Fix with AI had nothing to fix: its refusal, for the window's problem line (step-07 P5). */
    fixProblem?: string;
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
    const install = useFixWithAi();
    // The recorded Dry Run, not the last install.
    const dryRun = useFixWithAi('dry-run');
    const fixProblem = install.problem ?? dryRun.problem;
    return {
        retries,
        startImport,
        retry,
        fixWithAi: install.fixWithAi,
        fixDryRunWithAi: dryRun.fixWithAi,
        ...(fixProblem ? { fixProblem } : {}),
    };
}
