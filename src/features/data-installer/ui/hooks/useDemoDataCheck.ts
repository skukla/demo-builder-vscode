/**
 * The check behind "Clear Demo Data" (datapack-simplification step 06): `check-demo-data`, asked once
 * when the window opens, for what clearing every website the project uses would do; and again on
 * Retry, when a data type was too slow to answer.
 *
 * Through `useDataInstallerRequest`, so a refusal the handler RETURNS (signed out, org mismatch, a
 * website the instance has not got) arrives as `failure` rather than as an answer.
 *
 * @module features/data-installer/ui/hooks/useDemoDataCheck
 */

import { useCallback, useEffect } from 'react';
import { type DataInstallerFailure, useDataInstallerRequest } from './useDataInstallerRequest';
import type { ClearCheck } from '@/types/demoDataWipe';

export interface DemoDataCheckState {
    /** The check's answer; null before it arrives, or while it is asked again. */
    answer: ClearCheck | null;
    loading: boolean;
    failure: DataInstallerFailure | null;
    /** Ask again. */
    retry: () => void;
}

export function useDemoDataCheck(): DemoDataCheckState {
    const check = useDataInstallerRequest<ClearCheck>('check-demo-data');
    const { load } = check;
    const retry = useCallback((): void => load({}), [load]);
    useEffect(() => {
        load({});
    }, [load]);
    // While it asks again, the last answer and failure are stale: neither is shown.
    if (check.loading) return { answer: null, loading: true, failure: null, retry };
    return { answer: check.value, loading: false, failure: check.failure, retry };
}
