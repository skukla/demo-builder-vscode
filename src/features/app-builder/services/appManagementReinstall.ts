/**
 * Reinstall an App Management app in Commerce: uninstall, then install.
 *
 * Only for the case Commerce refuses an in-place upgrade (`REFUSED_UPGRADE`):
 * the new code is already deployed, but Commerce keeps running the old
 * version. lib-app 2.x uninstalls from the configuration it recorded at
 * install time, so the uninstall works against the deployed new code and no
 * second deploy is needed.
 *
 * @module features/app-builder/services/appManagementReinstall
 */

import type { AppManagementUninstallResult } from './appManagementUninstaller';
import type { AppManagementInstallResult } from './appManagementUpgrade';

export interface ReinstallDeps {
    uninstall: () => Promise<AppManagementUninstallResult>;
    install: () => Promise<AppManagementInstallResult>;
}

/**
 * Uninstall, then install. Stops before installing when the uninstall failed,
 * so the old version stays in place rather than two versions meeting.
 *
 * @returns the install's outcome. A failed uninstall still needs a reinstall;
 *   a failed install after a finished uninstall needs only an install.
 */
export async function reinstallAppManagementApp(deps: ReinstallDeps): Promise<AppManagementInstallResult> {
    const removed = await deps.uninstall();
    if (removed.status === 'failed') {
        return {
            status: 'failed',
            needsReinstall: true,
            detail: `Could not remove the installed version from Commerce, so nothing was reinstalled: ${removed.detail ?? 'no reason given'}`,
        };
    }
    const installed = await deps.install();
    if (installed.status === 'failed') {
        return {
            status: 'failed',
            detail: `The old version was removed from Commerce, but the new one did not install: ${installed.detail ?? 'no reason given'}`,
        };
    }
    return installed;
}
