/**
 * GitHub Helpers Tests
 */

// The real code calls `Octokit.plugin(retry)` and then `new` on the result. The
// mapped manual mock is a plain class, so its constructor arguments cannot be
// asserted; this factory replaces it with a jest.fn whose call arguments are the
// thing under test — that the token reaches Octokit as `auth`.
jest.mock('@octokit/core', () => {
    const MockOctokit = jest.fn().mockImplementation(() => ({ request: jest.fn() }));
    (MockOctokit as unknown as { plugin: jest.Mock }).plugin = jest.fn(() => MockOctokit);
    return { Octokit: MockOctokit };
});

import { Octokit } from '@octokit/core';
import { retry } from '@octokit/plugin-retry';
import {
    ERROR_MESSAGES,
    createAuthenticatedOctokit,
    generateOAuthState,
    injectTokenIntoUrl,
    mapToGitHubUser,
} from '@/features/eds/services/github/githubHelpers';

const mockOctokit = Octokit as unknown as jest.Mock & { plugin: jest.Mock };

describe('githubHelpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockOctokit.plugin.mockReturnValue(mockOctokit);
    });

    describe('ERROR_MESSAGES', () => {
        it('should have OAUTH_CANCELLED message', () => {
            expect(ERROR_MESSAGES.OAUTH_CANCELLED).toBe('OAuth flow cancelled');
        });

        it('should have OAUTH_TIMEOUT message', () => {
            expect(ERROR_MESSAGES.OAUTH_TIMEOUT).toBe('OAuth flow timed out');
        });

        it('should have NOT_AUTHENTICATED message', () => {
            expect(ERROR_MESSAGES.NOT_AUTHENTICATED).toBe('Not authenticated');
        });

        it('should have REPO_EXISTS message', () => {
            expect(ERROR_MESSAGES.REPO_EXISTS).toBe('Repository name already exists');
        });

        it('should have SERVICE_UNAVAILABLE message', () => {
            expect(ERROR_MESSAGES.SERVICE_UNAVAILABLE).toBe(
                'GitHub service is temporarily unavailable'
            );
        });
    });

    describe('createAuthenticatedOctokit', () => {
        it('should construct Octokit with the token as auth credential', () => {
            createAuthenticatedOctokit('ghp-test-token');

            expect(mockOctokit).toHaveBeenCalledWith({ auth: 'ghp-test-token' });
        });

        it('should apply the retry plugin before constructing', () => {
            createAuthenticatedOctokit('ghp-test-token');

            expect(mockOctokit.plugin).toHaveBeenCalledWith(retry);
        });

        it('should return the constructed instance', () => {
            const instance = createAuthenticatedOctokit('ghp-test-token');

            expect(instance).toBe(mockOctokit.mock.results[0].value);
        });
    });

    describe('generateOAuthState', () => {
        it('should generate 32-character hex string', () => {
            const state = generateOAuthState();
            expect(state).toHaveLength(32);
            expect(/^[0-9a-f]+$/i.test(state)).toBe(true);
        });

        it('should generate unique state strings', () => {
            const states = new Set<string>();
            for (let i = 0; i < 10; i++) {
                states.add(generateOAuthState());
            }
            expect(states.size).toBe(10);
        });
    });

    describe('injectTokenIntoUrl', () => {
        // Assertions read the URL back by PART rather than comparing against a
        // user-colon-password-at-host literal. The literal is the function's real
        // contract, but written out it is a credential-shaped string in a public repo,
        // and the secret scanner flagged exactly that shape on 2026-09-03. Parsing the
        // result proves the same thing without ever spelling it.
        it('should inject token into HTTPS URL', () => {
            const url = 'https://github.com/owner/repo.git';
            const token = 'test-token-123';

            const parsed = new URL(injectTokenIntoUrl(url, token));

            expect(parsed.username).toBe(token);
            expect(parsed.password).toBe('x-oauth-basic');
            expect(parsed.host).toBe('github.com');
            expect(parsed.pathname).toBe('/owner/repo.git');
        });

        it('should handle URL without path', () => {
            const url = 'https://github.com';
            const token = 'test-token';

            const parsed = new URL(injectTokenIntoUrl(url, token));

            expect(parsed.username).toBe(token);
            expect(parsed.password).toBe('x-oauth-basic');
            expect(parsed.host).toBe('github.com');
        });
    });

    describe('mapToGitHubUser', () => {
        it('should map all fields correctly', () => {
            const data = {
                login: 'testuser',
                email: 'test@example.com',
                name: 'Test User',
                avatar_url: 'https://avatars.github.com/u/123',
            };

            const result = mapToGitHubUser(data);

            expect(result).toEqual({
                login: 'testuser',
                email: 'test@example.com',
                name: 'Test User',
                avatarUrl: 'https://avatars.github.com/u/123',
            });
        });

        it('should handle null fields', () => {
            const data = {
                login: 'testuser',
                email: null,
                name: null,
                avatar_url: null,
            };

            const result = mapToGitHubUser(data);

            expect(result).toEqual({
                login: 'testuser',
                email: null,
                name: null,
                avatarUrl: null,
            });
        });

        it('should handle undefined fields', () => {
            const data = {
                login: 'testuser',
            };

            const result = mapToGitHubUser(data);

            expect(result).toEqual({
                login: 'testuser',
                email: null,
                name: null,
                avatarUrl: null,
            });
        });
    });
});
