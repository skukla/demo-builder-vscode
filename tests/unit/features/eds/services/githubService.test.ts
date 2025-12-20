/**
 * Unit Tests: GitHubService
 *
 * Tests for OAuth authentication, token management, repository operations,
 * file operations, and error handling for GitHub integration.
 *
 * Coverage: 27 tests across 6 categories
 * - OAuth Flow (4 tests)
 * - Token Management (10 tests)
 * - Repository Operations (5 tests)
 * - File Operations (3 tests)
 * - Error Handling (4 tests)
 * - Token Clearing (1 test)
 */

import * as vscode from 'vscode';

// Mock vscode module (auto-resolved via jest.config.js moduleNameMapper)
jest.mock('vscode');

// Mock @octokit/core with proper plugin support
const mockOctokitRequest = jest.fn();

class MockOctokit {
    request = mockOctokitRequest;

    static plugin(_plugin: any): typeof MockOctokit {
        return MockOctokit;
    }
}

jest.mock('@octokit/core', () => ({
    Octokit: MockOctokit,
}));

// Mock @octokit/plugin-retry
jest.mock('@octokit/plugin-retry', () => ({
    retry: jest.fn((Octokit: any) => Octokit),
}));

// Mock logging
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => mockLogger),
    Logger: jest.fn(() => mockLogger),
}));

// Mock timeout config
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        OAUTH_FLOW: 120000,
        API_CALL: 30000,
        TOKEN_VALIDATION_TTL: 300000,
    },
}));

// Import types after mocks
import type { GitHubService } from '@/features/eds/services/githubService';

describe('GitHubService', () => {
    let service: GitHubService;
    let mockSecretStorage: {
        get: jest.Mock;
        store: jest.Mock;
        delete: jest.Mock;
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create mock SecretStorage
        mockSecretStorage = {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
        };

        // Dynamically import to get fresh instance after mocks are set up
        const module = await import('@/features/eds/services/githubService');
        service = new module.GitHubService(mockSecretStorage as unknown as vscode.SecretStorage);
    });

    // ==========================================================
    // OAuth Flow Tests (4 tests)
    // ==========================================================
    describe('OAuth Flow', () => {
        it('should open browser for GitHub OAuth authorization', async () => {
            // Given: OAuth config with client ID
            const clientId = 'test-client-id';
            const redirectUri = 'vscode://adobe-demo-builder.github-auth';

            // Mock browser opening
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(true);

            // When: Starting OAuth flow
            const authPromise = service.startOAuthFlow(clientId, redirectUri);

            // Simulate callback with code
            await new Promise(resolve => setTimeout(resolve, 10));
            service.handleOAuthCallback({ code: 'test-auth-code', state: expect.any(String) });

            const result = await authPromise;

            // Then: Browser should open with correct OAuth URL
            expect(vscode.env.openExternal).toHaveBeenCalledWith(
                expect.objectContaining({
                    toString: expect.any(Function),
                })
            );

            // Verify OAuth URL contains required parameters
            const openExternalCall = (vscode.env.openExternal as jest.Mock).mock.calls[0][0];
            const authUrl = openExternalCall.toString();
            expect(authUrl).toContain('github.com/login/oauth/authorize');
            expect(authUrl).toContain(`client_id=${clientId}`);
            // Scopes are combined in one param with space encoded as + or %20
            expect(authUrl).toMatch(/scope=repo[+%20]user%3Aemail/);

            expect(result.code).toBe('test-auth-code');
        });

        it('should exchange authorization code for access token', async () => {
            // Given: Valid authorization code
            const code = 'valid-auth-code';
            const clientId = 'test-client-id';
            const clientSecret = 'test-client-secret';

            // Mock token exchange response
            mockOctokitRequest.mockResolvedValueOnce({
                data: {
                    access_token: 'gho_test_access_token',
                    token_type: 'bearer',
                    scope: 'repo,user:email',
                },
            });

            // When: Exchanging code for token
            const token = await service.exchangeCodeForToken(code, clientId, clientSecret);

            // Then: Token should be returned
            expect(token).toEqual({
                token: 'gho_test_access_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            });
        });

        it('should handle OAuth cancellation by user', async () => {
            // Given: User cancels OAuth flow
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(false);

            // When: Starting OAuth flow that gets cancelled
            const resultPromise = service.startOAuthFlow('client-id', 'redirect-uri');

            // Then: Should reject with cancellation error
            await expect(resultPromise).rejects.toThrow('OAuth flow cancelled');
        });

        it('should handle OAuth timeout after 2 minutes', async () => {
            // Given: OAuth flow that never completes
            jest.useFakeTimers();
            (vscode.env.openExternal as jest.Mock).mockResolvedValue(true);

            // When: Starting OAuth flow
            const resultPromise = service.startOAuthFlow('client-id', 'redirect-uri');

            // Advance time past timeout
            jest.advanceTimersByTime(121000); // 2 minutes + 1 second

            // Then: Should reject with timeout error
            // Use catch to handle the promise in fake timer context
            let thrownError: Error | undefined;
            try {
                await resultPromise;
            } catch (error) {
                thrownError = error as Error;
            }
            expect(thrownError?.message).toBe('OAuth flow timed out');

            jest.useRealTimers();
        });
    });

    // ==========================================================
    // Token Management Tests (6 tests)
    // ==========================================================
    describe('Token Management', () => {
        it('should store token in VS Code SecretStorage', async () => {
            // Given: Valid GitHub token
            const token = {
                token: 'gho_test_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            };

            // When: Storing token
            await service.storeToken(token);

            // Then: Token should be stored in SecretStorage
            expect(mockSecretStorage.store).toHaveBeenCalledWith(
                'github-token',
                JSON.stringify(token)
            );
        });

        it('should retrieve token from SecretStorage', async () => {
            // Given: Token stored in SecretStorage
            const storedToken = {
                token: 'gho_stored_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // When: Retrieving token
            const token = await service.getToken();

            // Then: Token should be returned
            expect(token).toEqual(storedToken);
            expect(mockSecretStorage.get).toHaveBeenCalledWith('github-token');
        });

        it('should return undefined when no token stored', async () => {
            // Given: No token in storage
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When: Retrieving token
            const token = await service.getToken();

            // Then: Should return undefined
            expect(token).toBeUndefined();
        });

        it('should handle corrupted token JSON gracefully', async () => {
            // Given: Corrupted token in storage
            mockSecretStorage.get.mockResolvedValue('not-valid-json');

            // When: Retrieving token
            const token = await service.getToken();

            // Then: Should return undefined and log warning
            expect(token).toBeUndefined();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to parse stored token')
            );
        });

        it('should return invalid when no token for validation', async () => {
            // Given: No token stored
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When: Validating token
            const validation = await service.validateToken();

            // Then: Should return invalid
            expect(validation.valid).toBe(false);
        });

        it('should validate token with GitHub API', async () => {
            // Given: Valid token in storage
            const storedToken = {
                token: 'gho_valid_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // Mock GitHub API response for token validation
            mockOctokitRequest.mockResolvedValueOnce({
                data: {
                    login: 'testuser',
                    email: 'test@example.com',
                    name: 'Test User',
                },
                headers: {
                    'x-oauth-scopes': 'repo, user:email',
                },
            });

            // When: Validating token
            const validation = await service.validateToken();

            // Then: Validation should pass
            expect(validation.valid).toBe(true);
            expect(validation.scopes).toEqual(['repo', 'user:email']);
            expect(validation.user?.login).toBe('testuser');
        });

        it('should detect expired or revoked token', async () => {
            // Given: Expired/revoked token in storage
            const storedToken = {
                token: 'gho_expired_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // Mock GitHub API 401 response
            mockOctokitRequest.mockRejectedValueOnce({
                status: 401,
                message: 'Bad credentials',
            });

            // When: Validating token
            const validation = await service.validateToken();

            // Then: Validation should fail
            expect(validation.valid).toBe(false);
            expect(validation.user).toBeUndefined();
        });

        it('should check required scopes (repo, user:email)', async () => {
            // Given: Token with missing scopes
            const storedToken = {
                token: 'gho_limited_token',
                tokenType: 'bearer',
                scopes: ['repo'], // Missing user:email
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // Mock GitHub API response with limited scopes
            mockOctokitRequest.mockResolvedValueOnce({
                data: { login: 'testuser' },
                headers: {
                    'x-oauth-scopes': 'repo',
                },
            });

            // When: Validating token
            const validation = await service.validateToken();

            // Then: Should indicate missing scopes
            expect(validation.valid).toBe(false);
            expect(validation.missingScopes).toContain('user:email');
        });

        it('should return cached validation result within TTL', async () => {
            // Given: Token already validated
            const storedToken = {
                token: 'gho_cached_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // First validation - calls API
            mockOctokitRequest.mockResolvedValueOnce({
                data: { login: 'testuser' },
                headers: { 'x-oauth-scopes': 'repo, user:email' },
            });
            await service.validateToken();

            // When: Validating again within TTL
            const secondValidation = await service.validateToken();

            // Then: Should use cached result (no additional API call)
            expect(mockOctokitRequest).toHaveBeenCalledTimes(1);
            expect(secondValidation.valid).toBe(true);
        });

        it('should handle missing scope header from GitHub API', async () => {
            // Given: Token in storage
            const storedToken = {
                token: 'gho_no_scope_header_token',
                tokenType: 'bearer',
                scopes: [],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // Mock response without x-oauth-scopes header
            mockOctokitRequest.mockResolvedValueOnce({
                data: { login: 'testuser' },
                headers: {}, // No x-oauth-scopes header
            });

            // When: Validating token
            const validation = await service.validateToken();

            // Then: Should indicate missing required scopes
            expect(validation.valid).toBe(false);
            expect(validation.scopes).toEqual([]);
            expect(validation.missingScopes).toContain('repo');
            expect(validation.missingScopes).toContain('user:email');
        });
    });

    // ==========================================================
    // Repository Operations Tests (5 tests)
    // ==========================================================
    describe('Repository Operations', () => {
        beforeEach(() => {
            // Setup authenticated token
            const storedToken = {
                token: 'gho_valid_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));
        });

        it('should throw error when not authenticated', async () => {
            // Given: No token stored
            mockSecretStorage.get.mockResolvedValue(undefined);

            // When: Trying to create repository
            // Then: Should throw not authenticated error
            await expect(
                service.createFromTemplate('owner', 'template', 'new-repo')
            ).rejects.toThrow('Not authenticated');
        });

        it('should create repository from template', async () => {
            // Given: Template repository details
            const templateOwner = 'adobe';
            const templateRepo = 'eds-template';
            const newRepoName = 'my-new-site';

            // Mock template creation response
            mockOctokitRequest.mockResolvedValueOnce({
                data: {
                    id: 123456,
                    name: newRepoName,
                    full_name: `testuser/${newRepoName}`,
                    html_url: `https://github.com/testuser/${newRepoName}`,
                    clone_url: `https://github.com/testuser/${newRepoName}.git`,
                    default_branch: 'main',
                },
            });

            // When: Creating repository from template
            const repo = await service.createFromTemplate(templateOwner, templateRepo, newRepoName);

            // Then: Repository should be created
            expect(repo.name).toBe(newRepoName);
            expect(repo.fullName).toBe(`testuser/${newRepoName}`);
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'POST /repos/{template_owner}/{template_repo}/generate',
                expect.objectContaining({
                    template_owner: templateOwner,
                    template_repo: templateRepo,
                    name: newRepoName,
                })
            );
        });

        it('should handle existing repository name conflict', async () => {
            // Given: Repository name that already exists
            const templateOwner = 'adobe';
            const templateRepo = 'eds-template';
            const existingRepoName = 'existing-repo';

            // Mock 422 response for name conflict
            mockOctokitRequest.mockRejectedValueOnce({
                status: 422,
                message: 'Repository creation failed.',
                errors: [{ message: 'name already exists on this account' }],
            });

            // When: Trying to create repository with existing name
            // Then: Should throw specific error
            await expect(
                service.createFromTemplate(templateOwner, templateRepo, existingRepoName)
            ).rejects.toThrow('Repository name already exists');
        });

        it('should clone repository to local path', async () => {
            // Given: Repository to clone
            const repoUrl = 'https://github.com/testuser/my-repo.git';
            const localPath = '/Users/test/projects/my-repo';

            // Mock git clone command execution
            const mockExec = jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
            jest.spyOn(service as any, 'executeGitCommand').mockImplementation(mockExec);

            // When: Cloning repository
            await service.cloneRepository(repoUrl, localPath);

            // Then: Git clone should be executed with token auth
            expect(mockExec).toHaveBeenCalledWith(
                expect.stringContaining('git clone'),
                expect.any(String)
            );
        });

        it('should get authenticated user information', async () => {
            // Given: Authenticated with GitHub
            mockOctokitRequest.mockResolvedValueOnce({
                data: {
                    login: 'testuser',
                    email: 'test@example.com',
                    name: 'Test User',
                    avatar_url: 'https://avatars.githubusercontent.com/u/12345',
                },
            });

            // When: Getting user info
            const user = await service.getAuthenticatedUser();

            // Then: User info should be returned
            expect(user.login).toBe('testuser');
            expect(user.email).toBe('test@example.com');
            expect(user.name).toBe('Test User');
            expect(mockOctokitRequest).toHaveBeenCalledWith('GET /user');
        });
    });

    // ==========================================================
    // File Operations Tests (3 tests)
    // ==========================================================
    describe('File Operations', () => {
        beforeEach(() => {
            // Setup authenticated token
            const storedToken = {
                token: 'gho_valid_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));
        });

        it('should read file contents from repository', async () => {
            // Given: File exists in repository
            const owner = 'testuser';
            const repo = 'my-repo';
            const path = 'README.md';

            // Mock file content response
            const fileContent = Buffer.from('# My Repository').toString('base64');
            mockOctokitRequest.mockResolvedValueOnce({
                data: {
                    content: fileContent,
                    sha: 'abc123sha',
                    path: path,
                    encoding: 'base64',
                },
            });

            // When: Reading file
            const content = await service.getFileContent(owner, repo, path);

            // Then: File content should be returned decoded
            expect(content?.content).toBe('# My Repository');
            expect(content?.sha).toBe('abc123sha');
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'GET /repos/{owner}/{repo}/contents/{path}',
                expect.objectContaining({ owner, repo, path })
            );
        });

        it('should create or update file in repository', async () => {
            // Given: File to create/update
            const owner = 'testuser';
            const repo = 'my-repo';
            const path = 'config.json';
            const content = '{"key": "value"}';
            const message = 'Update config';

            // Mock file update response
            mockOctokitRequest.mockResolvedValueOnce({
                data: {
                    content: {
                        sha: 'newsha456',
                    },
                    commit: {
                        sha: 'commitsha789',
                    },
                },
            });

            // When: Creating/updating file
            const result = await service.createOrUpdateFile(owner, repo, path, content, message);

            // Then: File should be created/updated
            expect(result.sha).toBe('newsha456');
            expect(result.commitSha).toBe('commitsha789');
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'PUT /repos/{owner}/{repo}/contents/{path}',
                expect.objectContaining({
                    owner,
                    repo,
                    path,
                    message,
                    content: expect.any(String), // Base64 encoded
                })
            );
        });

        it('should handle file not found gracefully (return null)', async () => {
            // Given: File does not exist
            const owner = 'testuser';
            const repo = 'my-repo';
            const path = 'nonexistent.txt';

            // Mock 404 response
            mockOctokitRequest.mockRejectedValueOnce({
                status: 404,
                message: 'Not Found',
            });

            // When: Reading non-existent file
            const content = await service.getFileContent(owner, repo, path);

            // Then: Should return null (not throw)
            expect(content).toBeNull();
        });
    });

    // ==========================================================
    // Error Handling Tests (4 tests)
    // ==========================================================
    describe('Error Handling', () => {
        beforeEach(async () => {
            // Clear all mocks for clean state
            jest.clearAllMocks();
            mockOctokitRequest.mockReset();

            // Get fresh service instance for each error handling test
            const module = await import('@/features/eds/services/githubService');
            service = new module.GitHubService(mockSecretStorage as unknown as vscode.SecretStorage);

            // Setup authenticated token
            const storedToken = {
                token: 'gho_valid_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));
        });

        it('should pass through transient network failures for retry plugin to handle', async () => {
            // Given: Transient network failure (retry plugin is mocked, so no actual retry)
            // The @octokit/plugin-retry handles retries - we verify errors are passed through
            mockOctokitRequest.mockRejectedValueOnce({
                status: 500,
                message: 'Internal Server Error',
            });

            // When: Making API call
            // Then: Should throw the error (retry plugin would handle retries in production)
            await expect(service.getAuthenticatedUser()).rejects.toMatchObject({
                status: 500,
            });
        });

        it('should handle rate limit errors with Retry-After', async () => {
            // Given: Rate limit error
            const rateLimitError = {
                status: 403,
                message: 'API rate limit exceeded',
                headers: {
                    'retry-after': '60',
                    'x-ratelimit-remaining': '0',
                    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
                },
            };
            mockOctokitRequest.mockRejectedValueOnce(rateLimitError);

            // When: Making API call that gets rate limited
            // Then: Should throw rate limit error with retry info
            await expect(service.getAuthenticatedUser()).rejects.toMatchObject({
                message: expect.stringContaining('rate limit'),
            });
        });

        it('should clear token on 401 Unauthorized', async () => {
            // Given: Token that becomes invalid
            mockOctokitRequest.mockRejectedValueOnce({
                status: 401,
                message: 'Bad credentials',
            });

            // When: Making API call with invalid token
            try {
                await service.getAuthenticatedUser();
            } catch {
                // Expected to throw
            }

            // Then: Token should be cleared from storage
            expect(mockSecretStorage.delete).toHaveBeenCalledWith('github-token');
        });

        it('should handle GitHub service unavailable (503)', async () => {
            // Given: GitHub service is unavailable
            mockOctokitRequest.mockRejectedValueOnce({
                status: 503,
                message: 'Service Unavailable',
            });

            // When: Making API call during outage
            // Then: Should throw service unavailable error
            await expect(service.getAuthenticatedUser()).rejects.toThrow(
                'GitHub service is temporarily unavailable'
            );
        });
    });

    // ==========================================================
    // Token Clearing Tests
    // ==========================================================
    describe('Token Clearing', () => {
        it('should clear token from SecretStorage', async () => {
            // Given: Token exists in storage

            // When: Clearing token
            await service.clearToken();

            // Then: Token should be deleted
            expect(mockSecretStorage.delete).toHaveBeenCalledWith('github-token');
        });
    });

    // ==========================================================
    // Repository Deletion Tests (4 tests)
    // ==========================================================
    describe('Repository Deletion', () => {
        beforeEach(() => {
            // Setup authenticated token
            const storedToken = {
                token: 'gho_valid_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email', 'delete_repo'],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));
        });

        it('should delete repository via DELETE /repos/{owner}/{repo}', async () => {
            // Given: Repository to delete
            const owner = 'testuser';
            const repo = 'my-repo';

            // Mock successful deletion
            mockOctokitRequest.mockResolvedValueOnce({
                status: 204,
                data: null,
            });

            // When: Deleting repository
            await service.deleteRepository(owner, repo);

            // Then: Should call DELETE endpoint
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'DELETE /repos/{owner}/{repo}',
                expect.objectContaining({
                    owner,
                    repo,
                })
            );
        });

        it('should archive repository via PATCH with archived: true', async () => {
            // Given: Repository to archive
            const owner = 'testuser';
            const repo = 'my-repo';

            // Mock successful archive
            mockOctokitRequest.mockResolvedValueOnce({
                status: 200,
                data: { archived: true },
            });

            // When: Archiving repository
            await service.archiveRepository(owner, repo);

            // Then: Should call PATCH endpoint with archived flag
            expect(mockOctokitRequest).toHaveBeenCalledWith(
                'PATCH /repos/{owner}/{repo}',
                expect.objectContaining({
                    owner,
                    repo,
                    archived: true,
                })
            );
        });

        it('should throw error when delete_repo scope missing for delete', async () => {
            // Given: Token without delete_repo scope
            const storedToken = {
                token: 'gho_limited_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'], // Missing delete_repo
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // Mock 403 error for missing scope
            mockOctokitRequest.mockRejectedValueOnce({
                status: 403,
                message: 'Resource not accessible by personal access token',
            });

            // When: Trying to delete repository
            // Then: Should throw scope error
            await expect(
                service.deleteRepository('testuser', 'my-repo')
            ).rejects.toThrow(/scope|permission|accessible/i);
        });

        it('should work with repo scope for archive (no delete_repo needed)', async () => {
            // Given: Token with only repo scope (no delete_repo)
            const storedToken = {
                token: 'gho_repo_only_token',
                tokenType: 'bearer',
                scopes: ['repo', 'user:email'],
            };
            mockSecretStorage.get.mockResolvedValue(JSON.stringify(storedToken));

            // Mock successful archive
            mockOctokitRequest.mockResolvedValueOnce({
                status: 200,
                data: { archived: true },
            });

            // When: Archiving repository
            // Then: Should succeed (repo scope is sufficient)
            await expect(
                service.archiveRepository('testuser', 'my-repo')
            ).resolves.not.toThrow();
        });
    });
});
