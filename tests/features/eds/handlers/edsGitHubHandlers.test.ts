/**
 * EDS GitHub Handlers Tests
 *
 * Tests for GitHub-related EDS handlers including repository creation.
 * Verifies defense-in-depth normalization of repository names.
 */

// Mock the GitHub services before importing handlers
const mockCreateFromTemplate = jest.fn();
const mockWaitForContent = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn(() => ({
        repoOperations: {
            createFromTemplate: mockCreateFromTemplate,
            waitForContent: mockWaitForContent,
        },
    })),
}));

// Mock logger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

import { handleCreateGitHubRepo } from '@/features/eds/handlers/edsGitHubHandlers';
import type { HandlerContext } from '@/types/handlers';

describe('handleCreateGitHubRepo', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {
            logger: {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            },
            sendMessage: jest.fn(),
        } as unknown as HandlerContext;

        // Setup successful repo creation
        mockCreateFromTemplate.mockResolvedValue({
            id: 12345,
            name: 'normalized-repo',
            fullName: 'user/normalized-repo',
            htmlUrl: 'https://github.com/user/normalized-repo',
            cloneUrl: 'https://github.com/user/normalized-repo.git',
            defaultBranch: 'main',
        });
        mockWaitForContent.mockResolvedValue(undefined);
    });

    describe('name normalization (defense-in-depth)', () => {
        it('should normalize repository name with spaces to dashes', async () => {
            // Given: Repo name with spaces (UI may not have normalized it)
            const payload = {
                repoName: 'My Test Repo',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            await handleCreateGitHubRepo(mockContext, payload);

            // Then: API should be called with normalized name (spaces → dashes, lowercase)
            expect(mockCreateFromTemplate).toHaveBeenCalledWith(
                'adobe',
                'citisignal-template',
                'my-test-repo', // Normalized: spaces → dashes, lowercase
                false,
            );
        });

        it('should normalize repository name with underscores to dashes', async () => {
            // Given: Repo name with underscores
            const payload = {
                repoName: 'My_Test_Repo',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            await handleCreateGitHubRepo(mockContext, payload);

            // Then: API should be called with normalized name
            expect(mockCreateFromTemplate).toHaveBeenCalledWith(
                'adobe',
                'citisignal-template',
                'my-test-repo', // Normalized: underscores → dashes, lowercase
                false,
            );
        });

        it('should normalize repository name with mixed case to lowercase', async () => {
            // Given: Repo name with mixed case
            const payload = {
                repoName: 'MyTestRepo',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            await handleCreateGitHubRepo(mockContext, payload);

            // Then: API should be called with lowercase name
            expect(mockCreateFromTemplate).toHaveBeenCalledWith(
                'adobe',
                'citisignal-template',
                'mytestrepo', // Normalized: lowercase
                false,
            );
        });

        it('should pass through already normalized names unchanged', async () => {
            // Given: Already normalized repo name
            const payload = {
                repoName: 'my-test-repo',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            await handleCreateGitHubRepo(mockContext, payload);

            // Then: API should be called with same name
            expect(mockCreateFromTemplate).toHaveBeenCalledWith(
                'adobe',
                'citisignal-template',
                'my-test-repo',
                false,
            );
        });

        it('should strip leading non-alphanumeric characters', async () => {
            // Given: Repo name with leading special chars
            const payload = {
                repoName: '--my-repo',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            await handleCreateGitHubRepo(mockContext, payload);

            // Then: API should be called with stripped name
            expect(mockCreateFromTemplate).toHaveBeenCalledWith(
                'adobe',
                'citisignal-template',
                'my-repo', // Normalized: leading hyphens stripped
                false,
            );
        });

        it('should remove special characters except dots', async () => {
            // Given: Repo name with special characters
            const payload = {
                repoName: 'my-repo!@#$%^&*()',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            await handleCreateGitHubRepo(mockContext, payload);

            // Then: API should be called with cleaned name
            expect(mockCreateFromTemplate).toHaveBeenCalledWith(
                'adobe',
                'citisignal-template',
                'my-repo', // Normalized: special chars removed
                false,
            );
        });

        it('should preserve dots in repository names', async () => {
            // Given: Repo name with dots (valid for GitHub)
            const payload = {
                repoName: 'my.test.repo',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            await handleCreateGitHubRepo(mockContext, payload);

            // Then: API should be called with dots preserved
            expect(mockCreateFromTemplate).toHaveBeenCalledWith(
                'adobe',
                'citisignal-template',
                'my.test.repo', // Dots preserved (valid for GitHub)
                false,
            );
        });
    });

    describe('error handling', () => {
        it('should return error when repoName is missing', async () => {
            // Given: Missing repoName
            const payload = {
                repoName: '',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            const result = await handleCreateGitHubRepo(mockContext, payload);

            // Then: Should return error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required parameters');
        });

        it('should return error when templateOwner is missing', async () => {
            // Given: Missing templateOwner
            const payload = {
                repoName: 'my-repo',
                templateOwner: '',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            const result = await handleCreateGitHubRepo(mockContext, payload);

            // Then: Should return error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Missing required parameters');
        });

        it('should handle API errors gracefully', async () => {
            // Given: API throws error
            mockCreateFromTemplate.mockRejectedValue(new Error('API error'));
            const payload = {
                repoName: 'my-repo',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            const result = await handleCreateGitHubRepo(mockContext, payload);

            // Then: Should return error
            expect(result.success).toBe(false);
            expect(result.error).toBe('API error');
        });
    });

    describe('success path', () => {
        it('should return repository info on success', async () => {
            // Given: Valid payload
            const payload = {
                repoName: 'my-repo',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            const result = await handleCreateGitHubRepo(mockContext, payload);

            // Then: Should return success with repo info
            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                owner: 'user',
                name: 'normalized-repo',
                url: 'https://github.com/user/normalized-repo',
                fullName: 'user/normalized-repo',
            });
        });

        it('should wait for repository content after creation', async () => {
            // Given: Valid payload
            const payload = {
                repoName: 'my-repo',
                templateOwner: 'adobe',
                templateRepo: 'citisignal-template',
            };

            // When: Creating repository
            await handleCreateGitHubRepo(mockContext, payload);

            // Then: Should wait for content
            expect(mockWaitForContent).toHaveBeenCalledWith('user', 'normalized-repo');
        });
    });
});
