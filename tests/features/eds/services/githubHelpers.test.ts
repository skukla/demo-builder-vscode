/**
 * GitHub Helpers Tests
 */

import {
    ERROR_MESSAGES,
    generateOAuthState,
    injectTokenIntoUrl,
    mapToGitHubUser,
} from '@/features/eds/services/githubHelpers';

describe('githubHelpers', () => {
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
            expect(ERROR_MESSAGES.SERVICE_UNAVAILABLE).toBe('GitHub service is temporarily unavailable');
        });
    });

    describe('generateOAuthState', () => {
        it('should generate 32-character hex string', () => {
            const state = generateOAuthState();
            expect(state.length).toBe(32);
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
        it('should inject token into HTTPS URL', () => {
            const url = 'https://github.com/owner/repo.git';
            const token = 'test-token-123';

            const result = injectTokenIntoUrl(url, token);

            expect(result).toBe('https://test-token-123:x-oauth-basic@github.com/owner/repo.git');
        });

        it('should handle URL without path', () => {
            const url = 'https://github.com';
            const token = 'test-token';

            const result = injectTokenIntoUrl(url, token);

            expect(result).toContain('test-token:x-oauth-basic@github.com');
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
