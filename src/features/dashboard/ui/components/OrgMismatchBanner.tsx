/**
 * OrgMismatchBanner
 *
 * Shown when the project's Adobe org isn't reachable by the current IMS token
 * (proactive entry check). Offers a FORCED "Switch IMS Org" recovery and,
 * after an attempt that still leaves the user in the wrong org, a no-loop hint
 * that another browser tab may be holding the wrong org.
 *
 * @module features/dashboard/ui/components/OrgMismatchBanner
 */

import { View, Flex, Text, Link } from '@adobe/react-spectrum';
import React from 'react';
import type { OrgMismatchInfo } from '@/features/authentication/services/detectProjectOrgMismatch';

export interface OrgMismatchBannerProps {
    /** The detected mismatch (expected org + the org the token reaches). */
    orgMismatch: OrgMismatchInfo;
    /** True once a forced switch has been attempted this session. */
    switchAttempted: boolean;
    /** Trigger the forced account/org switch. */
    onSwitchOrg: () => void;
}

/** Build the no-loop hint shown after a switch attempt that still mismatches. */
function buildTabHint(currentOrg?: string): string {
    if (currentOrg) {
        return `Still signed into ${currentOrg}. You may have another browser tab signed into `
            + `${currentOrg} — close it, or choose the correct organization in the sign-in window.`;
    }
    return 'Still signed into the wrong organization. You may have another browser tab signed in — '
        + 'close it, or choose the correct organization in the sign-in window.';
}

export function OrgMismatchBanner({ orgMismatch, switchAttempted, onSwitchOrg }: OrgMismatchBannerProps) {
    const { currentOrg } = orgMismatch;
    const intro = `This project uses a different Adobe organization than the account you're signed into`
        + (currentOrg ? ` (${currentOrg})` : '')
        + '. Switch accounts to continue.';

    return (
        <div className="page-container-padded org-mismatch-banner-text" data-testid="org-mismatch-banner">
            <View
                backgroundColor="static-yellow-400"
                borderRadius="medium"
                padding="size-200"
            >
                <Flex direction="column" gap="size-100">
                    <Text>{intro}</Text>
                    {switchAttempted && <Text>{buildTabHint(currentOrg)}</Text>}
                    <Link onPress={onSwitchOrg} isQuiet>
                        Switch IMS Org
                    </Link>
                </Flex>
            </View>
        </div>
    );
}
