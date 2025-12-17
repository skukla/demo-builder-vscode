# Step 2: GitHub Service (Consolidated)

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)

---

## Purpose

Create a consolidated GitHub service that handles OAuth authentication, token management, API operations, and repository management for EDS storefront deployment. This service follows the existing `AuthenticationService` pattern with caching, retry logic, and proper error handling.

---

## Prerequisites

- [ ] Step 1 complete (Component Registry updated with eds-citisignal-storefront)
- [ ] VS Code SecretStorage API available for token persistence
- [ ] GitHub OAuth App credentials configured (client ID, redirect URI)

---

## Dependencies

### New Packages

- [ ] **Package:** `@octokit/core@^6.0.0`
  - **Purpose:** GitHub API client for REST operations
  - **Installation:** `npm install @octokit/core`

- [ ] **Package:** `@octokit/plugin-retry@^7.0.0`
  - **Purpose:** Automatic retry for transient GitHub API failures
  - **Installation:** `npm install @octokit/plugin-retry`

### Existing Dependencies

- `@/core/logging` - Logger, getLogger
- `@/core/utils/timeoutConfig` - TIMEOUTS constants
- `@/types/errors` - AppError, AuthError, NetworkError
- `vscode` - SecretStorage for token persistence

---

## Files to Create/Modify

### New Files

- [ ] `src/features/eds/services/types.ts` - TypeScript interfaces for EDS feature
- [ ] `src/features/eds/services/githubService.ts` - Consolidated GitHub service
- [ ] `tests/unit/features/eds/services/githubService.test.ts` - Unit tests

### Directory Structure

```
src/features/eds/
├── index.ts                    # Public API exports
├── services/
│   ├── types.ts               # TypeScript interfaces
│   └── githubService.ts       # GitHub service implementation
└── README.md                  # Feature documentation

tests/unit/features/eds/
└── services/
    └── githubService.test.ts  # Unit tests
```

---

## Test Strategy

### Test File: `tests/unit/features/eds/services/githubService.test.ts`

### Test Categories

1. **OAuth Flow Tests** - Browser popup, token exchange, callback handling
2. **Token Management Tests** - Storage, retrieval, validation, refresh
3. **Repository Operations Tests** - Creation from template, cloning
4. **File Operations Tests** - Read, write, commit operations
5. **Error Handling Tests** - Network failures, auth errors, rate limits

---

## Tests to Write First (RED Phase)

### OAuth Flow Tests

- [ ] **Test:** `should open browser for GitHub OAuth authorization`
  - **Given:** No existing GitHub token
  - **When:** `initiateOAuth()` is called
  - **Then:** Opens browser to GitHub OAuth authorize URL with correct parameters
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should exchange authorization code for access token`
  - **Given:** Valid authorization code from OAuth callback
  - **When:** `exchangeCodeForToken(code)` is called
  - **Then:** Returns valid access token and stores in SecretStorage
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should handle OAuth cancellation by user`
  - **Given:** User cancels OAuth flow in browser
  - **When:** Callback received with error parameter
  - **Then:** Returns AuthError with code AUTH_CANCELLED
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should handle OAuth timeout after 2 minutes`
  - **Given:** OAuth flow started
  - **When:** No callback received within TIMEOUTS.BROWSER_AUTH
  - **Then:** Rejects with TimeoutError
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

### Token Management Tests

- [ ] **Test:** `should store token in VS Code SecretStorage`
  - **Given:** Valid GitHub access token
  - **When:** `storeToken(token)` is called
  - **Then:** Token is stored securely via context.secrets.store()
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should retrieve token from SecretStorage`
  - **Given:** Token previously stored
  - **When:** `getToken()` is called
  - **Then:** Returns the stored token
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should validate token with GitHub API`
  - **Given:** Stored token exists
  - **When:** `validateToken()` is called
  - **Then:** Returns { valid: true, scopes: ['repo', ...] } for valid token
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should detect expired or revoked token`
  - **Given:** Token that was revoked or expired
  - **When:** `validateToken()` is called
  - **Then:** Returns { valid: false } and clears stored token
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should check required scopes (repo, user:email)`
  - **Given:** Valid token with limited scopes
  - **When:** `validateToken()` is called
  - **Then:** Returns { valid: false, missingScopes: [...] } if scopes insufficient
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should return cached validation result within TTL`
  - **Given:** Token validated within last 5 minutes
  - **When:** `validateToken()` is called again
  - **Then:** Returns cached result without API call
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

### Repository Operations Tests

- [ ] **Test:** `should create repository from template`
  - **Given:** Valid token with repo scope
  - **When:** `createFromTemplate(templateOwner, templateRepo, newRepoName)` is called
  - **Then:** Creates new repo using GitHub template API
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should handle existing repository name conflict`
  - **Given:** Repository with same name already exists
  - **When:** `createFromTemplate()` is called
  - **Then:** Returns error with suggestion to use different name
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should clone repository to local path`
  - **Given:** Repository URL and local path
  - **When:** `cloneRepository(repoUrl, localPath)` is called
  - **Then:** Clones repo using git command with token authentication
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should get authenticated user information`
  - **Given:** Valid token
  - **When:** `getAuthenticatedUser()` is called
  - **Then:** Returns user object with login, email, name
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

### File Operations Tests

- [ ] **Test:** `should read file contents from repository`
  - **Given:** Valid token and existing file in repo
  - **When:** `getFileContent(owner, repo, path)` is called
  - **Then:** Returns decoded file content
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should create or update file in repository`
  - **Given:** Valid token with repo scope
  - **When:** `createOrUpdateFile(owner, repo, path, content, message)` is called
  - **Then:** Creates/updates file with commit
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should handle file not found gracefully`
  - **Given:** Non-existent file path
  - **When:** `getFileContent()` is called
  - **Then:** Returns null (not error) for 404 response
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

### Error Handling Tests

- [ ] **Test:** `should retry on transient network failures`
  - **Given:** First API call fails with network error
  - **When:** Any GitHub API operation is called
  - **Then:** Retries up to 3 times with exponential backoff
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should handle rate limit errors with Retry-After`
  - **Given:** GitHub returns 403 with rate limit exceeded
  - **When:** API operation is called
  - **Then:** Waits for Retry-After duration and retries
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should clear token on 401 Unauthorized`
  - **Given:** API returns 401 Unauthorized
  - **When:** Any authenticated API call is made
  - **Then:** Clears stored token and returns AuthError
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

- [ ] **Test:** `should handle GitHub service unavailable (503)`
  - **Given:** GitHub returns 503 Service Unavailable
  - **When:** API operation is called
  - **Then:** Returns NetworkError with retry suggestion
  - **File:** `tests/unit/features/eds/services/githubService.test.ts`

---

## Implementation Details

### RED Phase (Write failing tests first)

```typescript
// tests/unit/features/eds/services/githubService.test.ts

import { GitHubService } from '@/features/eds/services/githubService';
import type { GitHubToken, GitHubUser, GitHubRepo } from '@/features/eds/services/types';

// Mock dependencies
jest.mock('vscode', () => ({
    env: {
        openExternal: jest.fn(),
        uriScheme: 'vscode',
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
    window: {
        showErrorMessage: jest.fn(),
    },
}));

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        BROWSER_AUTH: 120000,
        API_CALL: 30000,
        COMPONENT_CLONE: 120000,
    },
    CACHE_TTL: {
        TOKEN_INSPECTION: 300000, // 5 minutes
    },
}));

describe('GitHubService', () => {
    let service: GitHubService;
    let mockSecrets: {
        get: jest.Mock;
        store: jest.Mock;
        delete: jest.Mock;
    };
    let mockOctokit: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockSecrets = {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
        };

        mockOctokit = {
            request: jest.fn(),
        };

        service = new GitHubService(mockSecrets as any);
        // Inject mock Octokit for testing
        (service as any).octokit = mockOctokit;
    });

    describe('OAuth Flow', () => {
        it('should open browser for GitHub OAuth authorization', async () => {
            // Arrange
            const vscode = require('vscode');

            // Act
            const authPromise = service.initiateOAuth();

            // Assert
            expect(vscode.env.openExternal).toHaveBeenCalledWith(
                expect.objectContaining({
                    toString: expect.any(Function),
                }),
            );
            const callArg = vscode.env.openExternal.mock.calls[0][0].toString();
            expect(callArg).toContain('github.com/login/oauth/authorize');
            expect(callArg).toContain('client_id=');
            expect(callArg).toContain('scope=repo%20user:email');
        });

        it('should exchange authorization code for access token', async () => {
            // Arrange
            const code = 'test-auth-code';
            mockOctokit.request.mockResolvedValueOnce({
                data: { access_token: 'gho_test123', scope: 'repo,user:email', token_type: 'bearer' },
            });

            // Act
            const result = await service.exchangeCodeForToken(code);

            // Assert
            expect(result.token).toBe('gho_test123');
            expect(result.scopes).toContain('repo');
            expect(mockSecrets.store).toHaveBeenCalledWith('github.token', 'gho_test123');
        });

        it('should handle OAuth cancellation by user', async () => {
            // Arrange
            const error = 'access_denied';
            const errorDescription = 'The user has denied your application access.';

            // Act & Assert
            await expect(service.handleOAuthCallback(undefined, error, errorDescription))
                .rejects.toThrow('User cancelled GitHub authorization');
        });

        it('should handle OAuth timeout after 2 minutes', async () => {
            // Arrange
            jest.useFakeTimers();

            // Act
            const authPromise = service.initiateOAuth();
            jest.advanceTimersByTime(120001); // Just over 2 minutes

            // Assert
            await expect(authPromise).rejects.toThrow('timed out');

            jest.useRealTimers();
        });
    });

    describe('Token Management', () => {
        it('should store token in VS Code SecretStorage', async () => {
            // Act
            await service.storeToken('gho_test123');

            // Assert
            expect(mockSecrets.store).toHaveBeenCalledWith('github.token', 'gho_test123');
        });

        it('should retrieve token from SecretStorage', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');

            // Act
            const token = await service.getToken();

            // Assert
            expect(token).toBe('gho_test123');
            expect(mockSecrets.get).toHaveBeenCalledWith('github.token');
        });

        it('should validate token with GitHub API', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');
            mockOctokit.request.mockResolvedValueOnce({
                headers: { 'x-oauth-scopes': 'repo, user:email' },
                data: { login: 'testuser' },
            });

            // Act
            const result = await service.validateToken();

            // Assert
            expect(result.valid).toBe(true);
            expect(result.scopes).toContain('repo');
            expect(result.scopes).toContain('user:email');
        });

        it('should detect expired or revoked token', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_expired');
            mockOctokit.request.mockRejectedValueOnce({
                status: 401,
                message: 'Bad credentials',
            });

            // Act
            const result = await service.validateToken();

            // Assert
            expect(result.valid).toBe(false);
            expect(mockSecrets.delete).toHaveBeenCalledWith('github.token');
        });

        it('should check required scopes (repo, user:email)', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_limited');
            mockOctokit.request.mockResolvedValueOnce({
                headers: { 'x-oauth-scopes': 'public_repo' }, // Missing repo and user:email
                data: { login: 'testuser' },
            });

            // Act
            const result = await service.validateToken();

            // Assert
            expect(result.valid).toBe(false);
            expect(result.missingScopes).toContain('repo');
            expect(result.missingScopes).toContain('user:email');
        });

        it('should return cached validation result within TTL', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValue('gho_test123');
            mockOctokit.request.mockResolvedValueOnce({
                headers: { 'x-oauth-scopes': 'repo, user:email' },
                data: { login: 'testuser' },
            });

            // Act - First call
            await service.validateToken();
            // Act - Second call (should use cache)
            const result = await service.validateToken();

            // Assert - Only one API call
            expect(mockOctokit.request).toHaveBeenCalledTimes(1);
            expect(result.valid).toBe(true);
        });
    });

    describe('Repository Operations', () => {
        it('should create repository from template', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');
            mockOctokit.request.mockResolvedValueOnce({
                data: {
                    id: 12345,
                    name: 'my-storefront',
                    full_name: 'testuser/my-storefront',
                    html_url: 'https://github.com/testuser/my-storefront',
                    clone_url: 'https://github.com/testuser/my-storefront.git',
                },
            });

            // Act
            const result = await service.createFromTemplate(
                'adobe-rnd',
                'citisignal-eds-template',
                'my-storefront',
            );

            // Assert
            expect(result.name).toBe('my-storefront');
            expect(result.cloneUrl).toBe('https://github.com/testuser/my-storefront.git');
            expect(mockOctokit.request).toHaveBeenCalledWith(
                'POST /repos/{template_owner}/{template_repo}/generate',
                expect.objectContaining({
                    template_owner: 'adobe-rnd',
                    template_repo: 'citisignal-eds-template',
                    name: 'my-storefront',
                }),
            );
        });

        it('should handle existing repository name conflict', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');
            mockOctokit.request.mockRejectedValueOnce({
                status: 422,
                message: 'Repository creation failed.',
                response: {
                    data: {
                        message: 'Repository creation failed.',
                        errors: [{ message: 'name already exists on this account' }],
                    },
                },
            });

            // Act & Assert
            await expect(
                service.createFromTemplate('adobe-rnd', 'citisignal-eds-template', 'existing-repo'),
            ).rejects.toThrow('already exists');
        });

        it('should clone repository to local path', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');
            const mockExecutor = {
                execute: jest.fn().mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }),
            };
            (service as any).commandExecutor = mockExecutor;

            // Act
            await service.cloneRepository(
                'https://github.com/testuser/my-storefront.git',
                '/path/to/local',
            );

            // Assert
            expect(mockExecutor.execute).toHaveBeenCalledWith(
                expect.stringContaining('git clone'),
                expect.objectContaining({ timeout: expect.any(Number) }),
            );
        });

        it('should get authenticated user information', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');
            mockOctokit.request.mockResolvedValueOnce({
                data: {
                    login: 'testuser',
                    email: 'test@example.com',
                    name: 'Test User',
                    avatar_url: 'https://avatars.githubusercontent.com/u/12345',
                },
            });

            // Act
            const user = await service.getAuthenticatedUser();

            // Assert
            expect(user.login).toBe('testuser');
            expect(user.email).toBe('test@example.com');
        });
    });

    describe('File Operations', () => {
        it('should read file contents from repository', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');
            const content = Buffer.from('# README').toString('base64');
            mockOctokit.request.mockResolvedValueOnce({
                data: {
                    content,
                    encoding: 'base64',
                    sha: 'abc123',
                },
            });

            // Act
            const result = await service.getFileContent('testuser', 'my-repo', 'README.md');

            // Assert
            expect(result?.content).toBe('# README');
            expect(result?.sha).toBe('abc123');
        });

        it('should create or update file in repository', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');
            mockOctokit.request.mockResolvedValueOnce({
                data: {
                    content: { sha: 'newsha123' },
                    commit: { sha: 'commitsha456' },
                },
            });

            // Act
            const result = await service.createOrUpdateFile(
                'testuser',
                'my-repo',
                'config.json',
                '{"key": "value"}',
                'Update config',
            );

            // Assert
            expect(result.sha).toBe('newsha123');
            expect(mockOctokit.request).toHaveBeenCalledWith(
                'PUT /repos/{owner}/{repo}/contents/{path}',
                expect.objectContaining({
                    owner: 'testuser',
                    repo: 'my-repo',
                    path: 'config.json',
                    message: 'Update config',
                    content: expect.any(String), // base64 encoded
                }),
            );
        });

        it('should handle file not found gracefully', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');
            mockOctokit.request.mockRejectedValueOnce({
                status: 404,
                message: 'Not Found',
            });

            // Act
            const result = await service.getFileContent('testuser', 'my-repo', 'nonexistent.txt');

            // Assert
            expect(result).toBeNull();
        });
    });

    describe('Error Handling', () => {
        it('should retry on transient network failures', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValue('gho_test123');
            mockOctokit.request
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockRejectedValueOnce(new Error('ETIMEDOUT'))
                .mockResolvedValueOnce({ data: { login: 'testuser' } });

            // Act
            const user = await service.getAuthenticatedUser();

            // Assert
            expect(user.login).toBe('testuser');
            expect(mockOctokit.request).toHaveBeenCalledTimes(3);
        });

        it('should handle rate limit errors with Retry-After', async () => {
            // Arrange
            jest.useFakeTimers();
            mockSecrets.get.mockResolvedValue('gho_test123');
            mockOctokit.request
                .mockRejectedValueOnce({
                    status: 403,
                    response: {
                        headers: { 'retry-after': '2' },
                    },
                    message: 'API rate limit exceeded',
                })
                .mockResolvedValueOnce({ data: { login: 'testuser' } });

            // Act
            const userPromise = service.getAuthenticatedUser();
            jest.advanceTimersByTime(2100);
            const user = await userPromise;

            // Assert
            expect(user.login).toBe('testuser');
            jest.useRealTimers();
        });

        it('should clear token on 401 Unauthorized', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_expired');
            mockOctokit.request.mockRejectedValueOnce({
                status: 401,
                message: 'Bad credentials',
            });

            // Act & Assert
            await expect(service.getAuthenticatedUser()).rejects.toThrow();
            expect(mockSecrets.delete).toHaveBeenCalledWith('github.token');
        });

        it('should handle GitHub service unavailable (503)', async () => {
            // Arrange
            mockSecrets.get.mockResolvedValueOnce('gho_test123');
            mockOctokit.request.mockRejectedValueOnce({
                status: 503,
                message: 'Service Unavailable',
            });

            // Act & Assert
            await expect(service.getAuthenticatedUser()).rejects.toThrow('Service Unavailable');
        });
    });
});
```

### GREEN Phase (Minimal implementation to pass tests)

#### Types (`src/features/eds/services/types.ts`)

```typescript
/**
 * TypeScript interfaces for EDS feature
 */

/**
 * GitHub authentication token with metadata
 */
export interface GitHubToken {
    token: string;
    scopes: string[];
    tokenType: string;
}

/**
 * GitHub token validation result
 */
export interface GitHubTokenValidation {
    valid: boolean;
    scopes?: string[];
    missingScopes?: string[];
    user?: string;
}

/**
 * GitHub user information
 */
export interface GitHubUser {
    login: string;
    email: string | null;
    name: string | null;
    avatarUrl: string;
}

/**
 * GitHub repository information
 */
export interface GitHubRepo {
    id: number;
    name: string;
    fullName: string;
    htmlUrl: string;
    cloneUrl: string;
    defaultBranch: string;
}

/**
 * GitHub file content result
 */
export interface GitHubFileContent {
    content: string;
    sha: string;
    path: string;
    encoding: string;
}

/**
 * GitHub file operation result
 */
export interface GitHubFileResult {
    sha: string;
    commitSha: string;
}

/**
 * EDS project configuration
 */
export interface EDSProjectConfig {
    repoOwner: string;
    repoName: string;
    daLiveOrg: string;
    daLiveSite: string;
    accsEndpoint?: string;
}
```

#### Service (`src/features/eds/services/githubService.ts`)

```typescript
/**
 * GitHub Service - Consolidated service for OAuth, API, and repository operations
 *
 * Handles:
 * - OAuth popup flow for GitHub authentication
 * - Token storage via VS Code SecretStorage
 * - Repository creation from templates
 * - File operations (read, write, commit)
 *
 * Pattern: Follows AuthenticationService structure with caching and retry logic
 */

import * as vscode from 'vscode';
import { Octokit } from '@octokit/core';
import { retry } from '@octokit/plugin-retry';
import { getLogger } from '@/core/logging';
import { TIMEOUTS, CACHE_TTL } from '@/core/utils/timeoutConfig';
import type { CommandExecutor } from '@/core/shell';
import { ServiceLocator } from '@/core/di';
import { AuthError, NetworkError, TimeoutError } from '@/types/errors';
import { ErrorCode } from '@/types/errorCodes';
import type {
    GitHubToken,
    GitHubTokenValidation,
    GitHubUser,
    GitHubRepo,
    GitHubFileContent,
    GitHubFileResult,
} from './types';

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = 'YOUR_CLIENT_ID'; // TODO: Configure via extension settings
const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const REQUIRED_SCOPES = ['repo', 'user:email'];

// Secret storage key
const TOKEN_SECRET_KEY = 'github.token';

/**
 * Consolidated GitHub service
 */
export class GitHubService {
    private logger = getLogger();
    private octokit: Octokit | null = null;
    private commandExecutor: CommandExecutor;

    // Validation cache
    private validationCache: {
        result: GitHubTokenValidation;
        timestamp: number;
    } | null = null;

    // OAuth pending promise for callback resolution
    private oauthPendingResolve: ((code: string) => void) | null = null;
    private oauthPendingReject: ((error: Error) => void) | null = null;

    constructor(private secrets: vscode.SecretStorage) {
        this.commandExecutor = ServiceLocator.getCommandExecutor();
    }

    // ===== OAuth Flow =====

    /**
     * Initiate OAuth flow by opening browser
     * Returns promise that resolves when OAuth callback is received
     */
    async initiateOAuth(): Promise<GitHubToken> {
        this.logger.debug('[GitHub] Initiating OAuth flow');

        // Build OAuth URL
        const state = this.generateState();
        const redirectUri = `${vscode.env.uriScheme}://adobe-demo-builder.demo-builder/github-callback`;
        const scope = REQUIRED_SCOPES.join(' ');

        const authUrl = new URL(GITHUB_OAUTH_URL);
        authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', scope);
        authUrl.searchParams.set('state', state);

        // Create promise for OAuth callback
        const callbackPromise = new Promise<string>((resolve, reject) => {
            this.oauthPendingResolve = resolve;
            this.oauthPendingReject = reject;

            // Timeout after BROWSER_AUTH
            setTimeout(() => {
                if (this.oauthPendingReject) {
                    this.oauthPendingReject(
                        new TimeoutError('GitHub OAuth', TIMEOUTS.BROWSER_AUTH),
                    );
                    this.oauthPendingResolve = null;
                    this.oauthPendingReject = null;
                }
            }, TIMEOUTS.BROWSER_AUTH);
        });

        // Open browser
        await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));
        this.logger.debug('[GitHub] Browser opened for OAuth');

        // Wait for callback
        const code = await callbackPromise;

        // Exchange code for token
        return this.exchangeCodeForToken(code);
    }

    /**
     * Handle OAuth callback from URI handler
     */
    async handleOAuthCallback(
        code?: string,
        error?: string,
        errorDescription?: string,
    ): Promise<void> {
        if (error) {
            const message = error === 'access_denied'
                ? 'User cancelled GitHub authorization'
                : errorDescription || error;

            if (this.oauthPendingReject) {
                this.oauthPendingReject(new AuthError(
                    ErrorCode.AUTH_REQUIRED,
                    message,
                    { userMessage: message },
                ));
            }
            this.oauthPendingResolve = null;
            this.oauthPendingReject = null;
            return;
        }

        if (code && this.oauthPendingResolve) {
            this.oauthPendingResolve(code);
            this.oauthPendingResolve = null;
            this.oauthPendingReject = null;
        }
    }

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(code: string): Promise<GitHubToken> {
        this.logger.debug('[GitHub] Exchanging code for token');

        const response = await fetch(GITHUB_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET, // From secure config
                code,
            }),
        });

        if (!response.ok) {
            throw new AuthError(
                ErrorCode.AUTH_REQUIRED,
                'Failed to exchange OAuth code',
                { technical: `HTTP ${response.status}` },
            );
        }

        const data = await response.json();

        if (data.error) {
            throw new AuthError(
                ErrorCode.AUTH_REQUIRED,
                data.error_description || data.error,
            );
        }

        const token: GitHubToken = {
            token: data.access_token,
            scopes: (data.scope || '').split(',').map((s: string) => s.trim()),
            tokenType: data.token_type,
        };

        // Store token securely
        await this.storeToken(token.token);

        // Initialize Octokit with new token
        this.initializeOctokit(token.token);

        this.logger.info('[GitHub] OAuth completed successfully');
        return token;
    }

    // ===== Token Management =====

    /**
     * Store token in SecretStorage
     */
    async storeToken(token: string): Promise<void> {
        await this.secrets.store(TOKEN_SECRET_KEY, token);
        this.clearValidationCache();
    }

    /**
     * Get token from SecretStorage
     */
    async getToken(): Promise<string | undefined> {
        return this.secrets.get(TOKEN_SECRET_KEY);
    }

    /**
     * Clear stored token
     */
    async clearToken(): Promise<void> {
        await this.secrets.delete(TOKEN_SECRET_KEY);
        this.octokit = null;
        this.clearValidationCache();
    }

    /**
     * Validate token with GitHub API (with caching)
     */
    async validateToken(): Promise<GitHubTokenValidation> {
        // Check cache first
        if (this.validationCache) {
            const age = Date.now() - this.validationCache.timestamp;
            if (age < CACHE_TTL.TOKEN_INSPECTION) {
                this.logger.debug('[GitHub] Returning cached validation');
                return this.validationCache.result;
            }
        }

        const token = await this.getToken();
        if (!token) {
            return { valid: false };
        }

        try {
            await this.ensureOctokit();

            const response = await this.octokit!.request('GET /user');
            const scopes = (response.headers['x-oauth-scopes'] || '')
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean);

            // Check required scopes
            const missingScopes = REQUIRED_SCOPES.filter(s => !scopes.includes(s));

            const result: GitHubTokenValidation = {
                valid: missingScopes.length === 0,
                scopes,
                missingScopes: missingScopes.length > 0 ? missingScopes : undefined,
                user: response.data.login,
            };

            // Cache result
            this.validationCache = {
                result,
                timestamp: Date.now(),
            };

            return result;
        } catch (error: any) {
            if (error.status === 401) {
                await this.clearToken();
                return { valid: false };
            }
            throw error;
        }
    }

    // ===== Repository Operations =====

    /**
     * Create repository from template
     */
    async createFromTemplate(
        templateOwner: string,
        templateRepo: string,
        newRepoName: string,
        options?: { description?: string; private?: boolean },
    ): Promise<GitHubRepo> {
        await this.ensureOctokit();

        try {
            const response = await this.octokit!.request(
                'POST /repos/{template_owner}/{template_repo}/generate',
                {
                    template_owner: templateOwner,
                    template_repo: templateRepo,
                    name: newRepoName,
                    description: options?.description,
                    private: options?.private ?? false,
                    include_all_branches: false,
                },
            );

            return {
                id: response.data.id,
                name: response.data.name,
                fullName: response.data.full_name,
                htmlUrl: response.data.html_url,
                cloneUrl: response.data.clone_url,
                defaultBranch: response.data.default_branch || 'main',
            };
        } catch (error: any) {
            if (error.status === 422 && error.response?.data?.errors?.some(
                (e: any) => e.message?.includes('already exists'),
            )) {
                throw new Error(
                    `Repository "${newRepoName}" already exists. Please choose a different name.`,
                );
            }
            throw error;
        }
    }

    /**
     * Clone repository to local path
     */
    async cloneRepository(repoUrl: string, localPath: string): Promise<void> {
        const token = await this.getToken();
        if (!token) {
            throw AuthError.required('GitHub token required for cloning');
        }

        // Inject token into URL for authenticated clone
        const authedUrl = repoUrl.replace(
            'https://github.com/',
            `https://${token}@github.com/`,
        );

        await this.commandExecutor.execute(
            `git clone "${authedUrl}" "${localPath}"`,
            { timeout: TIMEOUTS.COMPONENT_CLONE },
        );

        this.logger.info(`[GitHub] Repository cloned to ${localPath}`);
    }

    /**
     * Get authenticated user
     */
    async getAuthenticatedUser(): Promise<GitHubUser> {
        await this.ensureOctokit();

        const response = await this.octokit!.request('GET /user');

        return {
            login: response.data.login,
            email: response.data.email,
            name: response.data.name,
            avatarUrl: response.data.avatar_url,
        };
    }

    // ===== File Operations =====

    /**
     * Get file content from repository
     * Returns null if file not found (404)
     */
    async getFileContent(
        owner: string,
        repo: string,
        path: string,
        ref?: string,
    ): Promise<GitHubFileContent | null> {
        await this.ensureOctokit();

        try {
            const response = await this.octokit!.request(
                'GET /repos/{owner}/{repo}/contents/{path}',
                {
                    owner,
                    repo,
                    path,
                    ref,
                },
            );

            // Handle file content
            if ('content' in response.data) {
                return {
                    content: Buffer.from(response.data.content, 'base64').toString('utf-8'),
                    sha: response.data.sha,
                    path: response.data.path,
                    encoding: response.data.encoding,
                };
            }

            return null;
        } catch (error: any) {
            if (error.status === 404) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Create or update file in repository
     */
    async createOrUpdateFile(
        owner: string,
        repo: string,
        path: string,
        content: string,
        message: string,
        sha?: string,
    ): Promise<GitHubFileResult> {
        await this.ensureOctokit();

        // If sha not provided, try to get it (for updates)
        let fileSha = sha;
        if (!fileSha) {
            const existing = await this.getFileContent(owner, repo, path);
            fileSha = existing?.sha;
        }

        const response = await this.octokit!.request(
            'PUT /repos/{owner}/{repo}/contents/{path}',
            {
                owner,
                repo,
                path,
                message,
                content: Buffer.from(content).toString('base64'),
                sha: fileSha,
            },
        );

        return {
            sha: response.data.content.sha,
            commitSha: response.data.commit.sha,
        };
    }

    // ===== Private Helpers =====

    /**
     * Initialize Octokit with token and retry plugin
     */
    private initializeOctokit(token: string): void {
        const OctokitWithRetry = Octokit.plugin(retry);
        this.octokit = new OctokitWithRetry({
            auth: token,
            retry: {
                doNotRetry: ['429'],
                retries: 3,
            },
        });
    }

    /**
     * Ensure Octokit is initialized with stored token
     */
    private async ensureOctokit(): Promise<void> {
        if (this.octokit) return;

        const token = await this.getToken();
        if (!token) {
            throw AuthError.required('GitHub token required');
        }

        this.initializeOctokit(token);
    }

    /**
     * Generate random state for OAuth
     */
    private generateState(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    /**
     * Clear validation cache
     */
    private clearValidationCache(): void {
        this.validationCache = null;
    }
}
```

### REFACTOR Phase (Improve quality)

1. **Extract constants** to TIMEOUTS configuration
2. **Add GitHub-specific timeout constants** to `timeoutConfig.ts`:
   ```typescript
   // Add to TIMEOUTS
   GITHUB_OAUTH: 120000,        // OAuth flow timeout (2 minutes)
   GITHUB_API: 30000,           // GitHub API call timeout
   GITHUB_CLONE: 120000,        // Repository clone timeout
   ```

3. **Add rate limit handling** with Retry-After header parsing
4. **Improve error messages** for common GitHub errors
5. **Add JSDoc comments** for public API

---

## Expected Outcome

After completing this step:

- [ ] GitHubService fully tested with 25+ test cases
- [ ] OAuth popup flow working with VS Code URI handler
- [ ] Token securely stored in SecretStorage
- [ ] Repository creation from template functional
- [ ] File operations (read/write) working
- [ ] Proper error handling for all failure scenarios
- [ ] Cache mechanism prevents redundant API calls

---

## Acceptance Criteria

- [ ] All 25 tests passing
- [ ] OAuth flow works in VS Code development host
- [ ] Token persists across extension restarts
- [ ] API rate limits handled gracefully
- [ ] 401 errors trigger token cleanup
- [ ] Network errors retry with backoff
- [ ] Code follows existing AuthenticationService patterns
- [ ] No TypeScript errors
- [ ] Coverage >= 85% for new code

---

## Estimated Time

**Total:** 6-8 hours

- Types definition: 30 minutes
- Test writing (RED): 2-3 hours
- Implementation (GREEN): 2-3 hours
- Refactoring: 1-2 hours

---

## Notes

### OAuth Configuration

The GitHub OAuth App must be configured with:
- **Client ID:** Stored in extension settings or constants
- **Client Secret:** Must be securely configured (NOT in code)
- **Callback URL:** `vscode://adobe-demo-builder.demo-builder/github-callback`

### Security Considerations

1. **Token Storage:** Uses VS Code SecretStorage (encrypted)
2. **No hardcoded secrets:** Client secret must come from secure config
3. **Token in URLs:** Only used temporarily for git clone, then removed
4. **Scope validation:** Ensures token has required permissions

### Reference Implementation

The OAuth flow follows patterns from:
- `storefront-tools/worker/worker.js` (lines 746-1044) - OAuth popup flow
- `storefront-tools/worker/worker-api.js` - Token validation patterns

---

## Dependencies on This Step

- **Step 3 (DA.live Service):** May reuse GitHub user info
- **Step 4 (EDS Project Service):** Uses GitHubService for repository operations
- **Step 6 (Wizard Steps):** Uses GitHubService for OAuth UI flow
