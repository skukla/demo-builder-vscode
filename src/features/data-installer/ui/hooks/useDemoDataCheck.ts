/**
 * The check behind "Clear demo data" (datapack-engine step 10): `check-demo-data`, asked first for
 * the stores to choose from alone (`stores: []`, which reads only the store structure), then again
 * a moment after each tick, for what clearing the ticked stores would do. The choices are kept
 * between checks, so the list does not empty while a check runs.
 *
 * Through `useDataInstallerRequest`, so a refusal the handler RETURNS (signed out, org mismatch, a
 * store the instance has not got) arrives as `failure` rather than as an answer.
 *
 * @module features/data-installer/ui/hooks/useDemoDataCheck
 */

import { useEffect, useState } from 'react';
import { choicesOfTicks } from '../clearDemoDataWords';
import { type DataInstallerFailure, useDataInstallerRequest } from './useDataInstallerRequest';
import { useDebouncedValue } from '@/core/ui/hooks/useDebouncedValue';
import { FRONTEND_TIMEOUTS } from '@/core/ui/utils/frontendTimeouts';
import type { DemoDataCheck, WipeChoiceWebsite } from '@/types/demoDataWipe';

/** Nothing to choose from yet. Module-level: a stable reference. */
const NO_CHOICES: WipeChoiceWebsite[] = [];

export interface DemoDataCheckState {
    choices: WipeChoiceWebsite[];
    /** The answer for the ticks as they stood when it was asked; null before the first, or while none is ticked. */
    answer: DemoDataCheck | null;
    loading: boolean;
    failure: DataInstallerFailure | null;
    /** The choices have arrived at least once. */
    ready: boolean;
}

/**
 * @param ticks - the ticked stores, as `tickOf` keys
 */
export function useDemoDataCheck(ticks: ReadonlySet<string>): DemoDataCheckState {
    const check = useDataInstallerRequest<DemoDataCheck>('check-demo-data');
    const [choices, setChoices] = useState<WipeChoiceWebsite[]>(NO_CHOICES);
    const settled = useDebouncedValue(ticks, FRONTEND_TIMEOUTS.COMPONENT_DEBOUNCE);
    const { load } = check;
    useEffect(() => {
        load({ stores: choicesOfTicks(settled) });
    }, [load, settled]);

    const value = check.value;
    useEffect(() => {
        if (value) setChoices(value.choices);
    }, [value]);

    const waiting = check.loading || settled !== ticks;
    const answer = !waiting && value && settled.size > 0 ? value : null;
    return { choices, answer, loading: waiting, failure: waiting ? null : check.failure, ready: choices !== NO_CHOICES };
}
