/**
 * The AEM Code Sync install script — written once, rendered by both surfaces.
 *
 * Two places walk a user through the same GitHub screens:
 *
 *  - {@link CodeSyncStatusView} — the wizard's Code Sync sub-step, at configure time.
 *  - {@link GitHubAppInstallDialog} — the mid-run recovery panel, shown when the
 *    setup pipeline (`storefrontSetupPhaseHelpers`, `storefrontSetupPhase3`) or
 *    project creation stops because the app is missing.
 *
 * They are different MOMENTS — one is "set this up", the other is "your run just
 * stopped" — and each keeps its own framing. What they must not have is two
 * different scripts. They had drifted to exactly that: different step wording and
 * different button names ("Install App"/"Check Again" versus "Open Installation
 * Page"/"Check Installation") for the same three GitHub screens, so a user who
 * met both was told to press buttons that do not exist on the other.
 *
 * `edsResetService` already names this failure mode for its own remedy text:
 * "Two remedy texts one line apart is the drift, not the fix for it."
 *
 * @module features/eds/ui/helpers/codeSyncInstallContent
 */

import type { Instruction } from '@/core/ui/components/ui/NumberedInstructions';

/** The button that opens the GitHub App page. Both surfaces label it identically. */
export const CODE_SYNC_INSTALL_ACTION = 'Install App';

/** The button that re-runs the check. Named in the final step, so it must match. */
export const CODE_SYNC_RECHECK_ACTION = 'Check Again';

/**
 * The install steps for one repository.
 *
 * Returns a fresh array each call — the steps embed `owner`/`repo`, and a shared
 * mutable constant would be a trap for a caller that filtered or appended.
 *
 * @param owner - GitHub owner, named in the Configure step
 * @param repo - repository to grant access to, named in the access step
 */
export function buildCodeSyncInstallSteps(owner: string, repo: string): Instruction[] {
    return [
        {
            step: `Click "${CODE_SYNC_INSTALL_ACTION}"`,
            details: 'Opens the AEM Code Sync GitHub App page',
        },
        {
            step: 'Configure the app',
            details: `Click "Configure", sign in if prompted, then click "Configure" next to "${owner}"`,
        },
        {
            step: 'Grant repository access',
            details: `Select "Only select repositories", search for "${repo}", and click the green "Save" button`,
        },
        {
            step: `Return here and click "${CODE_SYNC_RECHECK_ACTION}"`,
            details: "We'll verify the installation completed",
        },
    ];
}
