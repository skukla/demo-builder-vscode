/**
 * The project's Clear window's state (datapack-simplification step 06, C2b): the check
 * (`useDemoDataCheck`), whether Review Records is open, how many times Retry was pressed, and the
 * three ways to a type the check could not read (P6-Q3, reuse only): Retry, then Fix with AI once
 * retrying has not helped (`RETRIES_BEFORE_FIX`), for a type too slow to answer; Open Commerce Admin
 * for a type Commerce refused; Fix with AI for one it answered strangely. Fix with AI sends only
 * `from: 'clear-check'`: the prompt is built from what the check recorded, never from the window.
 *
 * @module features/data-installer/ui/hooks/useProjectClear
 */

import { useCallback, useState } from 'react';
import { type DemoDataCheckState, useDemoDataCheck } from './useDemoDataCheck';
import { useFixWithAi } from './useFixWithAi';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { HandlerResponse } from '@/types/handlers';

export interface ProjectClear extends DemoDataCheckState {
    reviewing: boolean;
    review: () => void;
    back: () => void;
    /** How many times Retry was pressed since the window opened. */
    retries: number;
    /**
     * Why a way to a fix did not open, for the problem line: Commerce Admin's refusal, or Fix with AI's
     * when there is nothing to fix (step-07 P5). Absent when it opened.
     */
    fixProblem?: string;
    fixWithAi: () => void;
    openAdmin: () => void;
}

/** The ways to a type a Clear check could not read, beyond Retry: Fix with AI and Open Commerce Admin. Clear Commerce Instance's too (C4). */
export type ClearFixes = Pick<ProjectClear, 'fixProblem' | 'fixWithAi' | 'openAdmin'>;

export function useClearFixes(): ClearFixes {
    const [adminProblem, setAdminProblem] = useState<string | undefined>(undefined);
    const fix = useFixWithAi('clear-check');
    const openAdmin = useCallback((): void => {
        setAdminProblem(undefined);
        void webviewClient
            .request<HandlerResponse>('open-commerce-admin')
            .then((res) => setAdminProblem(res?.success === false ? res.error : undefined))
            .catch(() => undefined);
    }, []);
    const fixProblem = adminProblem ?? fix.problem;
    return { ...(fixProblem ? { fixProblem } : {}), fixWithAi: fix.fixWithAi, openAdmin };
}

export function useProjectClear(): ProjectClear {
    const check = useDemoDataCheck();
    const { retry: askAgain } = check;
    const [reviewing, setReviewing] = useState(false);
    const [retries, setRetries] = useState(0);
    const retry = useCallback((): void => {
        setRetries((n) => n + 1);
        askAgain();
    }, [askAgain]);
    const review = useCallback((): void => setReviewing(true), []);
    const back = useCallback((): void => setReviewing(false), []);
    return { ...check, retry, reviewing, review, back, retries, ...useClearFixes() };
}
