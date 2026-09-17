/**
 * appManagementReinstall — uninstall then install, for an app Commerce would
 * not upgrade in place (AB-13, step 4).
 */

import { reinstallAppManagementApp } from '@/features/app-builder/services/appManagementReinstall';
import type { AppManagementUninstallResult } from '@/features/app-builder/services/appManagementUninstaller';
import type { AppManagementInstallResult } from '@/features/app-builder/services/appManagementUpgrade';

const INSTALLED: AppManagementInstallResult = {
    status: 'installed',
    version: '0.2.0',
    detail: 'Installed in Commerce.',
};

function deps(removed: AppManagementUninstallResult, installed: AppManagementInstallResult = INSTALLED) {
    const order: string[] = [];
    return {
        order,
        uninstall: jest.fn(async () => {
            order.push('uninstall');
            return removed;
        }),
        install: jest.fn(async () => {
            order.push('install');
            return installed;
        }),
    };
}

describe('reinstallAppManagementApp', () => {
    it('uninstalls, then installs, and returns the install outcome', async () => {
        const d = deps({ status: 'uninstalled' });

        await expect(reinstallAppManagementApp(d)).resolves.toEqual(INSTALLED);
        expect(d.order).toEqual(['uninstall', 'install']);
    });

    it('installs when Commerce had nothing installed', async () => {
        const d = deps({ status: 'skipped', detail: 'Nothing is installed in Commerce.' });

        await expect(reinstallAppManagementApp(d)).resolves.toEqual(INSTALLED);
        expect(d.install).toHaveBeenCalledTimes(1);
    });

    it('installs nothing when the uninstall failed, and still asks for a reinstall', async () => {
        const d = deps({ status: 'failed', detail: 'The uninstall kept hitting a transient conflict.' });

        await expect(reinstallAppManagementApp(d)).resolves.toEqual({
            status: 'failed',
            needsReinstall: true,
            detail: 'Could not remove the installed version from Commerce, so nothing was reinstalled: The uninstall kept hitting a transient conflict.',
        });
        expect(d.install).not.toHaveBeenCalled();
    });

    it('says the old version is gone when the install then fails, without asking for a reinstall', async () => {
        const d = deps({ status: 'uninstalled' }, { status: 'failed', detail: 'Webhook subscription failed.' });

        const result = await reinstallAppManagementApp(d);

        expect(result).toEqual({
            status: 'failed',
            detail: 'The old version was removed from Commerce, but the new one did not install: Webhook subscription failed.',
        });
        expect(result.needsReinstall).toBeUndefined();
    });
});
