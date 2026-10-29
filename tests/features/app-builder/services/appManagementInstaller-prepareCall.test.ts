/**
 * prepareAppManagementCall — the opening the install and the uninstall share.
 *
 * It resolves the Commerce target, the app's Adobe context and a sign-in, in
 * that order, and answers the first refusal. The order matters: a project that
 * cannot name its Commerce instance must not ask for a sign-in it would not use.
 *
 * Assertions are the returned value and what `getAuth` was (or was not) asked.
 */

import { buildAppData } from '@/features/app-builder/services/appManagementAppData';
import {
    deriveCommerceTarget,
    prepareAppManagementCall,
} from '@/features/app-builder/services/appManagementInstaller';
import { paasProject } from './appManagementInstaller.testUtils';

const AUTH = { accessToken: 'fake-test-pw-not-a-secret', imsOrgId: 'ABC@AdobeOrg' };

describe('prepareAppManagementCall', () => {
    it('answers the target, the appData and the auth when all three resolve', async () => {
        const project = paasProject();
        const getAuth = jest.fn().mockResolvedValue(AUTH);

        const inputs = await prepareAppManagementCall(project, 'app', getAuth, 'install');

        expect(inputs).toEqual({
            target: deriveCommerceTarget(project),
            appData: buildAppData(project, 'app'),
            auth: AUTH,
        });
        expect(getAuth).toHaveBeenCalledTimes(1);
        expect(getAuth).toHaveBeenCalledWith();
    });

    it('refuses an underivable Commerce target before asking for a sign-in', async () => {
        const getAuth = jest.fn().mockResolvedValue(AUTH);

        const inputs = await prepareAppManagementCall(
            paasProject({ componentSelections: {} }),
            'app',
            getAuth,
            'install',
        );

        expect(inputs).toEqual({ error: 'This project has no Commerce backend (found "none").' });
        expect(getAuth).not.toHaveBeenCalled();
    });

    it('refuses an incomplete Adobe context before asking for a sign-in', async () => {
        const project = paasProject();
        delete project.adobe?.workspaceName;
        const getAuth = jest.fn().mockResolvedValue(AUTH);

        const inputs = await prepareAppManagementCall(project, 'app', getAuth, 'uninstall');

        expect(inputs).toEqual(buildAppData(project, 'app'));
        expect(inputs).toEqual({ error: expect.stringContaining('workspaceName') });
        expect(getAuth).not.toHaveBeenCalled();
    });

    it.each(['install', 'uninstall'] as const)(
        'names the %s call when no sign-in is available',
        async (verb) => {
            const getAuth = jest.fn().mockResolvedValue(undefined);

            const inputs = await prepareAppManagementCall(paasProject(), 'app', getAuth, verb);

            expect(inputs).toEqual({
                error: `No Adobe sign-in is available to authenticate the ${verb} call.`,
            });
        },
    );
});
