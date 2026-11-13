/**
 * Clear Commerce Instance's reads (datapack-simplification step 06, C4): the instance's websites,
 * asked once when the window opens (`check-demo-data` with `websites: []`), the websites ticked, and
 * the check for them, asked when Next is pressed and again on Retry. Back drops the check and keeps
 * the ticks.
 *
 * Through `useDataInstallerRequest`, so a refusal the handler RETURNS (signed out, org mismatch)
 * arrives as `failure` rather than as an answer.
 *
 * @module features/data-installer/ui/hooks/useInstanceClear
 */

import { useCallback, useEffect, useState } from 'react';
import { type DataInstallerFailure, useDataInstallerRequest } from './useDataInstallerRequest';
import type { ClearCheck, InstanceChoices } from '@/types/demoDataWipe';

const NONE: ReadonlySet<string> = new Set();
const ALL_WEBSITES = { websites: [] };

export interface InstanceClear {
    /** The instance's websites; null until they arrive. */
    choices: InstanceChoices | null;
    ticks: ReadonlySet<string>;
    toggle: (code: string) => void;
    /** Select All: every website, or none when all are ticked. */
    toggleAll: () => void;
    /** Next: the check for the websites ticked, in the instance's order. */
    next: () => void;
    back: () => void;
    /** Next was pressed: the summary is asked for, or shown. */
    asked: boolean;
    /** The check's answer; null before it arrives, or while it is asked again. */
    check: ClearCheck | null;
    /** The websites' read, or the check, failed as a whole. */
    failure: DataInstallerFailure | null;
    /** Ask again: the websites, or the check once asked. */
    retry: () => void;
    /** How many times the check was asked again. */
    retries: number;
    /** Read the list again because the clearing found it changed: not a Retry. */
    recheck: () => void;
}

export function useInstanceClear(): InstanceClear {
    const websites = useDataInstallerRequest<InstanceChoices>('check-demo-data');
    const checked = useDataInstallerRequest<ClearCheck>('check-demo-data');
    const { load: loadWebsites } = websites;
    const { load: loadCheck } = checked;
    const [ticks, setTicks] = useState<ReadonlySet<string>>(NONE);
    const [asked, setAsked] = useState(false);
    const [retries, setRetries] = useState(0);
    useEffect(() => loadWebsites(ALL_WEBSITES), [loadWebsites]);
    const codes = (websites.value?.websites ?? []).map((w) => w.code);
    const chosen = codes.filter((code) => ticks.has(code));
    const toggle = (code: string): void => {
        const changed = new Set(ticks);
        if (!changed.delete(code)) changed.add(code);
        setTicks(changed);
    };
    const toggleAll = (): void => setTicks(chosen.length === codes.length ? NONE : new Set(codes));
    const next = (): void => {
        setAsked(true);
        loadCheck({ websites: chosen });
    };
    const back = useCallback((): void => setAsked(false), []);
    const retry = (): void => {
        if (!asked) return loadWebsites(ALL_WEBSITES);
        setRetries((n) => n + 1);
        return loadCheck({ websites: chosen });
    };
    const recheck = (): void => loadCheck({ websites: chosen });
    const reading = asked ? checked : websites;
    return {
        choices: websites.value,
        ticks,
        toggle,
        toggleAll,
        next,
        back,
        asked,
        check: asked && !checked.loading ? checked.value : null,
        failure: reading.loading ? null : reading.failure,
        retry,
        retries,
        recheck,
    };
}
