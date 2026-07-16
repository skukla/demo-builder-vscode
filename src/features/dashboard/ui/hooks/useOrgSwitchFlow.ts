/**
 * useOrgSwitchFlow — the forced account/org switch flow state.
 *
 * Extracted from ProjectDashboardScreen (decompose pass after ADR-011 D3).
 * Owns the three pieces the org-mismatch banner needs:
 *   - `switchAttempted`: set on the first switch attempt so a PERSISTENT
 *     mismatch surfaces the no-loop hint (another browser tab may be holding
 *     the wrong org). Reset only when the org check RESOLVES clean ('none') —
 *     not on the transient 'checking' a re-check passes through, which would
 *     drop the hint.
 *   - `isSwitchingOrg`: true while the forced round-trip (browser login +
 *     re-verify) is in flight — drives the banner's disabled "Switching…"
 *     button. Cleared on completion regardless of outcome (success,
 *     still-mismatched, cancelled) so the button never strands.
 *   - `onSwitchOrg`: the guarded trigger. A ref guards re-entry synchronously
 *     (state lags a render, so a fast double-press could otherwise fire the
 *     round-trip twice).
 *
 * @module features/dashboard/ui/hooks/useOrgSwitchFlow
 */

import { useEffect, useRef, useState } from 'react';
import type { OrgCheckState } from './useDashboardStatus';

export interface OrgSwitchFlow {
    /** Whether a switch was attempted this session (drives the no-loop hint). */
    switchAttempted: boolean;
    /** True while the forced switch round-trip is in flight. */
    isSwitchingOrg: boolean;
    /** The guarded switch trigger (re-entry-safe). */
    onSwitchOrg: () => Promise<void>;
}

/**
 * The org-switch flow state for the dashboard's org-mismatch banner.
 *
 * @param orgCheckState - the live org-check state (resets the attempt on 'none')
 * @param handleSwitchOrg - the actions hook's forced-switch round-trip
 * @returns attempt flag, in-flight flag, and the guarded trigger
 */
export function useOrgSwitchFlow(
    orgCheckState: OrgCheckState,
    handleSwitchOrg: () => Promise<void>,
): OrgSwitchFlow {
    const [switchAttempted, setSwitchAttempted] = useState(false);
    const [isSwitchingOrg, setIsSwitchingOrg] = useState(false);
    const switchInFlightRef = useRef(false);

    // Reset the attempt flag once the org check RESOLVES clean, so a future,
    // unrelated mismatch starts without a stale hint.
    useEffect(() => {
        if (orgCheckState === 'none') {
            setSwitchAttempted(false);
        }
    }, [orgCheckState]);

    const onSwitchOrg = async (): Promise<void> => {
        if (switchInFlightRef.current) return;
        switchInFlightRef.current = true;
        setSwitchAttempted(true);
        setIsSwitchingOrg(true);
        try {
            await handleSwitchOrg();
        } finally {
            switchInFlightRef.current = false;
            setIsSwitchingOrg(false);
        }
    };

    return { switchAttempted, isSwitchingOrg, onSwitchOrg };
}
