/**
 * OrgContextNotice
 *
 * The attention-grabbing half of the dashboard's org-context surfacing: a dark,
 * orange-accent-bordered warning banner shown ONLY when the proactive check
 * resolves to a mismatch, with a forced "Switch IMS Org" recovery (+ a no-loop
 * tab hint after a failed switch).
 *
 * Ambient status (checking / verified-ok with the org name) lives in the "IMS
 * Org" status badge instead — see `imsOrgDisplay` in useDashboardStatus. This
 * component is just the actionable mismatch banner; it returns null otherwise.
 *
 * @module features/dashboard/ui/components/OrgContextNotice
 */

import { Text, Button, ProgressCircle } from '@adobe/react-spectrum';
import AlertCircle from '@spectrum-icons/workflow/AlertCircle';
import React from 'react';
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

function buildMessage(expectedOrgName: string | undefined, currentOrg: string | undefined): string {
    if (expectedOrgName && currentOrg) {
        return `You're signed into ${currentOrg}, but this project was created in ${expectedOrgName}.`;
    }
    if (expectedOrgName) {
        return `This project was created in ${expectedOrgName} — switch to it to continue.`;
    }
    if (currentOrg) {
        return `You're signed into ${currentOrg}, which isn't the organization this project was created in.`;
    }
    return `You're signed into a different Adobe organization than the one this project was created in.`;
}

/** No-loop hint shown after a failed forced switch. */
function buildHint(currentOrg: string | undefined): string {
    const org = currentOrg ?? 'it';
    return `Another browser tab may be holding ${org} — close it, or pick this project's `
        + 'organization in the sign-in window.';
}

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
            <div className="dashboard-org-banner" data-testid="org-mismatch-banner">
                <AlertCircle size="S" UNSAFE_className="dashboard-org-banner-icon" />
                <div className="dashboard-org-banner-body">
                    <Text UNSAFE_className="dashboard-org-banner-title">Wrong Adobe organization</Text>
                    <Text UNSAFE_className="status-text">{buildMessage(expectedOrgName, currentOrg)}</Text>
                    {switchAttempted && (
                        <Text UNSAFE_className="dashboard-org-banner-hint">{buildHint(currentOrg)}</Text>
                    )}
                </div>
                <div className="dashboard-org-banner-actions">
                    <Button variant="accent" onPress={onSwitchOrg} isDisabled={isSwitching}>
                        {isSwitching ? (
                            <>
                                <ProgressCircle
                                    size="S"
                                    isIndeterminate
                                    aria-label="Switching organization"
                                    UNSAFE_className="dashboard-org-banner-spinner"
                                />
                                <Text>Switching…</Text>
                            </>
                        ) : (
                            <Text>Switch IMS Org</Text>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
