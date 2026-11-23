/**
 * Manage GitHub Repositories signs in through the one GitHub sign-in (PL-104 fix 2).
 *
 * It asked for and stored a token scoped only ['repo','delete_repo'], with no recovery
 * from a stale cached session. The stored token is shared, so that narrow token was the
 * one later storefront work got. These drive the real `signInToGitHub` and assert what
 * VS Code was asked for and what was stored.
 */

const mockGetSession = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockShowErrorMessage = jest.fn();

// Own vscode mock: authentication.getSession and the message boxes forward to this suite's own
//   mocks; the shared mock has no authentication API.
jest.mock('vscode', () => ({
    authentication: { getSession: (...a: unknown[]) => mockGetSession(...a) },
    window: {
        showWarningMessage: (...a: unknown[]) => mockShowWarningMessage(...a),
        showErrorMessage: (...a: unknown[]) => mockShowErrorMessage(...a),
        setStatusBarMessage: jest.fn(),
    },
}));

import { signInForRepoManagement } from '@/features/eds/commands/manageGitHubRepos';
import type { GitHubSignInTokenStore } from '@/features/eds/handlers/edsGitHubHandlers';
import { GITHUB_SCOPES } from '@/features/eds/services/types';
import { createMockLogger } from '../../../helpers/loggerFake';

function tokenServiceFake(valid = true) {
    const fake = {
        storeToken: jest.fn().mockResolvedValue(undefined),
        validateToken: jest.fn().mockResolvedValue({ valid }),
        clearToken: jest.fn().mockResolvedValue(undefined),
    };
    const service: GitHubSignInTokenStore = fake;
    return { fake, service };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockShowWarningMessage.mockResolvedValue('Sign In');
    mockGetSession.mockResolvedValue({ accessToken: 'gh-session-token', account: { label: 'sc' } });
});

it('asks VS Code for every scope the extension uses and stores the token with them', async () => {
    const { fake, service } = tokenServiceFake();

    const signedIn = await signInForRepoManagement(service, createMockLogger());

    expect(signedIn).toBe(true);
    expect(mockGetSession).toHaveBeenCalledWith('github', [...GITHUB_SCOPES], {
        createIfNone: true,
    });
    expect(fake.storeToken).toHaveBeenCalledWith({
        token: 'gh-session-token',
        tokenType: 'bearer',
        scopes: [...GITHUB_SCOPES],
    });
});

it('recovers a stale cached session with a fresh sign-in', async () => {
    const { service } = tokenServiceFake(false);

    await signInForRepoManagement(service, createMockLogger());

    expect(mockGetSession).toHaveBeenLastCalledWith('github', [...GITHUB_SCOPES], {
        forceNewSession: expect.objectContaining({ detail: expect.any(String) }),
    });
});

it('signs in to nothing when the SC does not press Sign In', async () => {
    mockShowWarningMessage.mockResolvedValue(undefined);
    const { service } = tokenServiceFake();

    expect(await signInForRepoManagement(service, createMockLogger())).toBe(false);
    expect(mockGetSession).not.toHaveBeenCalled();
});

it('says so when the sign-in fails', async () => {
    mockGetSession.mockRejectedValue(new Error('provider down'));
    const { service } = tokenServiceFake();

    expect(await signInForRepoManagement(service, createMockLogger())).toBe(false);
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
        'GitHub authentication failed. Please try again.'
    );
});
