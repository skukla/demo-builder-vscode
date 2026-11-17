/**
 * useFinishSetup — the project dashboard's Finish Setup guide (PL-101): whether it is open, what
 * opens it (the "N steps remaining" line, or the creation end screen's Finish Setup arriving as
 * `openFinishSetup`), Open Commerce Admin, and the run behind Apply.
 *
 * Apply on Republish the Code runs the dashboard's own Republish, in its own progress window: the
 * guide closes for it, as the integration guide hands a run that needs a window to the progress
 * window (`useGuideRun`'s `onAsk`). A successful Republish checks the step again on the extension
 * side (`recheckCodeStep`), and the status push it ends with redraws the line, the dots and,
 * reopened, the guide.
 *
 * The steps are not held here: they arrive on every status push, current, and the guide is handed
 * them on each render (the integration guide's rule).
 *
 * @module features/dashboard/ui/hooks/useFinishSetup
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { GuideRun } from '@/features/dashboard/ui/components/integrations/useGuideRun';
import type { FinishSetupStatus } from '@/types/webviewPayloads';

export interface FinishSetupControls {
    /** The steps, as the last status push carried them. */
    status?: FinishSetupStatus;
    isOpen: boolean;
    open: () => void;
    close: () => void;
    /** Opens Commerce Admin; settles once its window is likely up. */
    openAdmin: () => Promise<unknown>;
    /** Apply's run: Republish. Absent when the dashboard has no Republish (not a storefront). */
    run?: GuideRun;
}

/**
 * @param status - the steps from the dashboard's status
 * @param openOnArrival - the dashboard was opened for the guide: open it once steps arrive
 * @param republish - the dashboard's Republish, which Apply runs; absent, no Apply
 * @returns the guide's controls
 */
export function useFinishSetup(
    status: FinishSetupStatus | undefined,
    openOnArrival: boolean | undefined,
    republish: (() => void) | undefined,
): FinishSetupControls {
    const [isOpen, setIsOpen] = useState(false);
    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);

    // The end screen's Finish Setup: open once, when the first status with steps lands.
    const openedOnArrival = useRef(false);
    const hasSteps = (status?.items.length ?? 0) > 0;
    useEffect(() => {
        if (!openOnArrival || !hasSteps || openedOnArrival.current) return;
        openedOnArrival.current = true;
        setIsOpen(true);
    }, [openOnArrival, hasSteps]);

    const openAdmin = useCallback(() => webviewClient.request('openAdminPanel'), []);

    const run = useMemo<GuideRun | undefined>(() => {
        if (!republish) return undefined;
        return {
            running: false,
            stepIds: [],
            results: {},
            start: () => {
                setIsOpen(false);
                republish();
            },
        };
    }, [republish]);

    return { status, isOpen, open, close, openAdmin, run };
}
