/**
 * EDS-23 — "the AEM Code Sync App does not cover this repository".
 *
 * `/status` cannot say it: its inner `code.status: 400` read the same before the
 * App covered skukla/kukla-justrite and after. The code endpoint can, in its
 * `x-error`. These pin the classification against the live-captured string and
 * the undetermined verdict the resolver now returns for an inner 400.
 */
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import type { RepoInfo } from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import {
    buildAppNotOnRepositoryMessage,
    isAppNotOnRepositoryError,
    resolveAppInstallation,
} from '@/features/eds/services/appInstallationResolver';
import { GITHUB_APP_INSTALL_URL } from '@/features/eds/services/github/githubAppService';
import {
    CODE_ENDPOINT_APP_NOT_ON_REPO_X_ERROR,
    PREVIEW_CODE_APP_NOT_ON_REPO_ERROR,
} from '../../../helpers/helixAdminFixtures';
import { createMockLogger } from '../../../helpers/loggerFake';

const REPO: RepoInfo = {
    repoOwner: 'skukla',
    repoName: 'kukla-justrite',
    repoUrl: 'https://github.com/skukla/kukla-justrite',
};

describe('isAppNotOnRepositoryError', () => {
    it('recognises the error previewCode throws for the live-captured x-error', () => {
        expect(isAppNotOnRepositoryError(PREVIEW_CODE_APP_NOT_ON_REPO_ERROR)).toBe(true);
    });

    it('recognises the bare x-error too', () => {
        expect(isAppNotOnRepositoryError(CODE_ENDPOINT_APP_NOT_ON_REPO_X_ERROR)).toBe(true);
    });

    it.each([
        'Failed to preview code: 400 Bad Request',
        'helix 503',
        'Failed to preview code: 400 Bad Request — [admin] unable to fetch fstab',
    ])('does not claim a missing App for "%s"', (message) => {
        expect(isAppNotOnRepositoryError(message)).toBe(false);
    });
});

describe('buildAppNotOnRepositoryMessage', () => {
    it('names the repository, says what is wrong, and links the install page', () => {
        const message = buildAppNotOnRepositoryMessage(REPO.repoOwner, REPO.repoName);
        expect(message).toContain('skukla/kukla-justrite');
        expect(message).toMatch(/AEM Code Sync/);
        expect(message).toContain(GITHUB_APP_INSTALL_URL);
    });
});

describe('resolveAppInstallation — an inner 400', () => {
    it('is undetermined, and says which inner status it was', async () => {
        const isAppInstalled = jest
            .fn()
            .mockResolvedValue({ isInstalled: false, codeStatus: 400, transient: true });

        const outcome = await resolveAppInstallation({ isAppInstalled }, REPO, createMockLogger());

        expect(outcome).toEqual({
            kind: 'undetermined',
            codeStatus: 400,
            httpStatus: undefined,
            helixError: undefined,
            noCredential: undefined,
        });
        expect(isAppInstalled).toHaveBeenCalledWith('skukla', 'kukla-justrite');
    });
});
