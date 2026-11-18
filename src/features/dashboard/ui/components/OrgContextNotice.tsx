/**
 * OrgContextNotice
 *
 * The attention-grabbing half of the dashboard's org-context surfacing: a dark,
 * orange-accent-bordered warning banner shown ONLY when the proactive check
 * resolves to a mismatch, with a forced "Switch IMS Org" recovery (+ a hint about
 * other Adobe tabs after a switch that did not take).
 *
 * Ambient status (checking / verified-ok with the org name) lives in the "IMS
 * Org" status badge instead — see `imsOrgDisplay` in useDashboardStatus. This
 * component is just the actionable mismatch banner; it returns null otherwise.
 *
 * @module features/dashboard/ui/components/OrgContextNotice
 */

import React from 'react';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import { DialogButton } from '@/core/ui/components/ui/Modal';
import type { OrgMismatchInfo } from '@/features/authentication/services/detectProjectOrgMismatch';
import type { OrgCheckState } from '@/features/dashboard/ui/hooks/useDashboardStatus';

export interface OrgContextNoticeProps {
    /** Current org-check lifecycle state — the banner shows only on 'mismatch'. */
    state: OrgCheckState;
    /** The detected mismatch (present when state is 'mismatch'). */
    orgMismatch?: OrgMismatchInfo;
    /** True once a forced switch has been attempted this session. */
    switchAttempted: boolean;
    /** True while the forced switch round-trip is in flight (disables the button). */
    isSwitching?: boolean;
    /** Trigger the forced account/org switch. */
    onSwitchOrg: () => void;
}

/** What is wrong, in plain words (walk F239): the project's organization, then the one signed in. */
function buildMessage(expectedOrgName: string | undefined, currentOrg: string | undefined): string {
    if (expectedOrgName && currentOrg) return `This project belongs to ${expectedOrgName}, but you're signed in to ${currentOrg}.`;
    if (expectedOrgName) return `This project belongs to ${expectedOrgName}.`;
    if (currentOrg) return `You're signed in to ${currentOrg}, not this project's organization.`;
    return "You're signed in to a different organization than this project's.";
}

/** After a switch that landed in the wrong organization again: the usual cause, and what to do. */
const SWITCH_HINT = 'Still not switched? Close other Adobe tabs in your browser, then try again.';

export function OrgContextNotice({
    state,
    orgMismatch,
    switchAttempted,
    isSwitching = false,
    onSwitchOrg,
}: OrgContextNoticeProps) {
    if (state !== 'mismatch' || !orgMismatch) {
        return null;
    }

    const { currentOrg, expectedOrgName } = orgMismatch;
    return (
        <div className="page-container-padded">
            <InlineNotice
                title="Wrong Adobe Organization"
                testId="org-mismatch-banner"
                hint={switchAttempted ? SWITCH_HINT : undefined}
                action={
                    // A busy button, not a spinner plus "Switching" (owner, 2026-10-31): the house
                    // DialogButton, whose spinner shows on blue (walk F239).
                    <DialogButton button={{ label: 'Switch IMS Org', variant: 'accent', onPress: onSwitchOrg, isPending: isSwitching }} />
                }
            >
                {buildMessage(expectedOrgName, currentOrg)}
            </InlineNotice>
        </div>
    );
}
