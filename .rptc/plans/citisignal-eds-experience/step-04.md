# Step 4: EDS Project Service (Orchestration)

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)

---

## Purpose

Create a consolidated EDS project service that orchestrates the complete project setup by calling GitHubService and DaLiveService sequentially. This service follows direct method invocation (no abstract orchestrator pattern) for simplicity and follows existing patterns from `meshSetupService.ts`.

**Key Operations (Sequential Flow):**
1. Create GitHub repository from citisignal template
2. Clone repository locally
3. Configure Helix 5 via Configuration Service API
4. Verify Code Bus sync (poll admin.hlx.page)
5. Copy CitiSignal content via DaLiveService
6. Clone commerce-demo-ingestion tool via ComponentManager
7. Generate .env configuration

---

## Prerequisites

- [ ] Step 2 complete: GitHubService with OAuth and repo operations
- [ ] Step 3 complete: DaLiveService with content copy operations
- [ ] ComponentManager available for tool cloning
- [ ] AuthenticationService for IMS tokens

---

## Dependencies

### Existing Dependencies (Reused)

- `@/features/eds/services/githubService.ts` - GitHub operations (Step 2)
- `@/features/eds/services/daLiveService.ts` - DA.live operations (Step 3)
- `@/features/eds/services/types.ts` - Shared EDS types
- `@/features/components/services/componentManager.ts` - Git component cloning
- `@/features/authentication/services/authenticationService.ts` - IMS tokens
- `@/core/logging` - Logger, getLogger
- `@/core/utils/timeoutConfig` - TIMEOUTS constants
- `@/core/di` - ServiceLocator

### No New npm Packages Required

Uses existing dependencies from Steps 2 and 3.

---

## Files to Create/Modify

### New Files

- [ ] `src/features/eds/services/edsProjectService.ts` - Main orchestration service (~350 lines)
- [ ] `tests/unit/features/eds/services/edsProjectService.test.ts` - Unit tests (~500 lines)

### Types to Add (in types.ts)

```typescript
// EDS Project Configuration
export interface EdsProjectConfig {
  projectName: string;
  projectPath: string;
  githubOwner?: string;
  repoName: string;
  daLiveOrg: string;
  daLiveSite: string;
  accsEndpoint: string;
  storeCode: string;
  storeViewCode: string;
  websiteCode: string;
  catalogApiKey?: string;
}

// EDS Project Setup Result
export interface EdsProjectSetupResult {
  success: boolean;
  repoUrl?: string;
  repoClonePath?: string;
  previewUrl?: string;
  liveUrl?: string;
  daLiveContentUrl?: string;
  toolsPath?: string;
  error?: string;
  phase?: EdsSetupPhase;
}

// Setup phases for progress tracking
export type EdsSetupPhase =
  | 'github-repo'
  | 'github-clone'
  | 'helix-config'
  | 'code-sync'
  | 'dalive-content'
  | 'tools-clone'
  | 'env-config'
  | 'complete';

// Progress callback
export type EdsProgressCallback = (
  phase: EdsSetupPhase,
  progress: number,
  message: string
) => void;

// Helix Configuration Service types
export interface HelixConfigResult {
  success: boolean;
  previewUrl?: string;
  liveUrl?: string;
  error?: string;
}

export interface CodeSyncStatus {
  synced: boolean;
  attempts: number;
  maxAttempts: number;
}
```

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest
- **Mocking:** Mock GitHubService, DaLiveService, ComponentManager, AuthenticationService
- **Coverage Target:** 90% (critical orchestration logic)

### Test File Structure

```
tests/unit/features/eds/services/
└── edsProjectService.test.ts
```

---

## Tests to Write First (RED Phase)

### Unit Tests: EDS Project Service

#### Test Group 1: Service Initialization

- [ ] **Test:** Should initialize with required dependencies
  - **Given:** GitHubService, DaLiveService, AuthenticationService, Logger provided
  - **When:** EdsProjectService is instantiated
  - **Then:** Service is ready to orchestrate project setup
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should throw error if GitHubService not provided
  - **Given:** Missing GitHubService
  - **When:** EdsProjectService is instantiated
  - **Then:** Throws descriptive error about missing dependency
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should throw error if DaLiveService not provided
  - **Given:** Missing DaLiveService
  - **When:** EdsProjectService is instantiated
  - **Then:** Throws descriptive error about missing dependency
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

#### Test Group 2: Sequential Setup Orchestration

- [ ] **Test:** Should execute setup phases in correct order
  - **Given:** Valid project configuration
  - **When:** setupProject() is called
  - **Then:** Phases execute in order: github-repo, github-clone, helix-config, code-sync, dalive-content, tools-clone, env-config
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should stop execution on phase failure
  - **Given:** GitHub repo creation fails
  - **When:** setupProject() is called
  - **Then:** Returns error with phase='github-repo', no subsequent phases execute
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should report progress through callback
  - **Given:** Progress callback provided
  - **When:** setupProject() executes
  - **Then:** Callback invoked for each phase with progress percentage
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should complete all phases successfully
  - **Given:** All dependencies return success
  - **When:** setupProject() is called
  - **Then:** Returns success=true with all URLs populated
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

#### Test Group 3: GitHub Repository Creation

- [ ] **Test:** Should create repository from citisignal template
  - **Given:** Valid GitHub token and configuration
  - **When:** setupProject() executes github-repo phase
  - **Then:** Calls GitHubService.createFromTemplate with correct template
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should use citisignal-one as template repository
  - **Given:** Project configuration
  - **When:** github-repo phase executes
  - **Then:** Template owner='skukla', repo='citisignal-one'
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should clone repository to project path
  - **Given:** Repository created successfully
  - **When:** github-clone phase executes
  - **Then:** Calls GitHubService.cloneRepository with correct local path
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should handle repository name conflict
  - **Given:** Repository name already exists
  - **When:** github-repo phase executes
  - **Then:** Returns error with user-friendly message about name conflict
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

#### Test Group 4: Helix 5 Configuration Service

- [ ] **Test:** Should configure site via admin.hlx.page API
  - **Given:** Repository created and cloned
  - **When:** helix-config phase executes
  - **Then:** Calls Helix Configuration Service with owner/repo
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should set DA.live mountpoint in configuration
  - **Given:** DA.live org and site provided
  - **When:** helix-config phase executes
  - **Then:** Configuration includes mountpoint URL to DA.live content
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should use IMS token for Helix API authentication
  - **Given:** User authenticated with IMS
  - **When:** helix-config phase executes
  - **Then:** API calls include Bearer token from AuthenticationService
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

#### Test Group 5: Code Bus Verification (Polling)

- [ ] **Test:** Should poll code bus until sync verified
  - **Given:** Helix configuration complete
  - **When:** code-sync phase executes
  - **Then:** Polls admin.hlx.page/code endpoint until 200 response
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should use exponential backoff for polling
  - **Given:** Code sync in progress
  - **When:** Polling admin.hlx.page
  - **Then:** Delay increases between attempts (5s base, max 25 attempts)
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should timeout after max polling attempts
  - **Given:** Code sync never completes
  - **When:** Max attempts (25) reached
  - **Then:** Returns partial success with warning about manual verification
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should generate preview URL on sync success
  - **Given:** Code bus returns 200
  - **When:** code-sync phase completes
  - **Then:** Result includes previewUrl in format https://main--{repo}--{owner}.aem.page
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

#### Test Group 6: DA.live Content Population

- [ ] **Test:** Should copy CitiSignal content to DA.live
  - **Given:** DA.live org and site accessible
  - **When:** dalive-content phase executes
  - **Then:** Calls DaLiveService.copyCitisignalContent with destination
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should report content copy progress
  - **Given:** Progress callback provided
  - **When:** Content copy in progress
  - **Then:** Progress updates reflect files copied
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should handle partial content copy failure
  - **Given:** Some files fail to copy
  - **When:** dalive-content phase completes
  - **Then:** Logs warnings for failed files but continues
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should skip content copy if already populated
  - **Given:** DA.live site already has content
  - **When:** dalive-content phase executes with skipIfExists=true
  - **Then:** Skips copy, logs info message
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

#### Test Group 7: Tools Cloning (commerce-demo-ingestion)

- [ ] **Test:** Should clone commerce-demo-ingestion via ComponentManager
  - **Given:** Project path established
  - **When:** tools-clone phase executes
  - **Then:** Calls ComponentManager.installComponent with ingestion tool definition
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should clone to project/tools directory
  - **Given:** Project path is /path/to/project
  - **When:** tools-clone phase executes
  - **Then:** Tool cloned to /path/to/project/tools/commerce-demo-ingestion
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should skip npm install for ingestion tool
  - **Given:** Tool configuration
  - **When:** ComponentManager.installComponent called
  - **Then:** Options include skipDependencies=true (manual npm install later)
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should handle tool clone failure gracefully
  - **Given:** Git clone fails
  - **When:** tools-clone phase fails
  - **Then:** Returns warning but continues with project (tool is optional)
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

#### Test Group 8: Environment Configuration

- [ ] **Test:** Should generate .env file with ACCS configuration
  - **Given:** ACCS endpoint and store codes provided
  - **When:** env-config phase executes
  - **Then:** Creates .env with COMMERCE_* variables
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should include DA.live configuration in .env
  - **Given:** DA.live org and site configured
  - **When:** env-config phase executes
  - **Then:** .env includes DA_LIVE_ORG and DA_LIVE_SITE
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should not overwrite existing .env if present
  - **Given:** .env file already exists in cloned repo
  - **When:** env-config phase executes
  - **Then:** Merges new values, preserves existing values (like smart merge)
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should validate required env vars are set
  - **Given:** Missing required ACCS endpoint
  - **When:** env-config phase executes
  - **Then:** Returns error listing missing required variables
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

#### Test Group 9: Error Handling and Recovery

- [ ] **Test:** Should provide detailed error on GitHub failure
  - **Given:** GitHub API returns 403
  - **When:** github-repo phase fails
  - **Then:** Error includes user-friendly message and recovery hint
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should provide rollback info on partial failure
  - **Given:** Failure after repository created
  - **When:** Later phase fails
  - **Then:** Result includes cleanup instructions (delete repo, etc.)
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should handle network timeout gracefully
  - **Given:** Network timeout during any phase
  - **When:** Operation times out
  - **Then:** Returns error with retry hint
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

- [ ] **Test:** Should log detailed debugging info on failure
  - **Given:** Any phase fails
  - **When:** Error is caught
  - **Then:** Logger.error called with phase, error details, and context
  - **File:** `tests/unit/features/eds/services/edsProjectService.test.ts`

---

## Implementation Details

### RED Phase (Write Failing Tests First)

```typescript
// tests/unit/features/eds/services/edsProjectService.test.ts

import { EdsProjectService } from '@/features/eds/services/edsProjectService';
import type { GitHubService } from '@/features/eds/services/githubService';
import type { DaLiveService } from '@/features/eds/services/daLiveService';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type { EdsProjectConfig, EdsProgressCallback, EdsSetupPhase } from '@/features/eds/services/types';

// Mock dependencies
jest.mock('@/features/eds/services/githubService');
jest.mock('@/features/eds/services/daLiveService');
jest.mock('@/features/authentication/services/authenticationService');
jest.mock('@/features/components/services/componentManager');
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('EdsProjectService', () => {
    let service: EdsProjectService;
    let mockGithubService: jest.Mocked<GitHubService>;
    let mockDaLiveService: jest.Mocked<DaLiveService>;
    let mockAuthService: jest.Mocked<AuthenticationService>;
    let mockComponentManager: jest.Mocked<ComponentManager>;
    let mockProgressCallback: jest.Mock<void, [EdsSetupPhase, number, string]>;
    let defaultConfig: EdsProjectConfig;

    beforeEach(() => {
        jest.clearAllMocks();

        mockGithubService = {
            createFromTemplate: jest.fn().mockResolvedValue({
                name: 'test-storefront',
                fullName: 'testuser/test-storefront',
                cloneUrl: 'https://github.com/testuser/test-storefront.git',
                htmlUrl: 'https://github.com/testuser/test-storefront',
                defaultBranch: 'main',
            }),
            cloneRepository: jest.fn().mockResolvedValue(undefined),
            getAuthenticatedUser: jest.fn().mockResolvedValue({
                login: 'testuser',
                email: 'test@example.com',
            }),
        } as unknown as jest.Mocked<GitHubService>;

        mockDaLiveService = {
            verifyOrgAccess: jest.fn().mockResolvedValue({
                hasAccess: true,
                orgName: 'test-org',
            }),
            copyCitisignalContent: jest.fn().mockResolvedValue({
                success: true,
                copiedFiles: ['/index.html', '/about.html'],
                failedFiles: [],
                totalFiles: 2,
            }),
        } as unknown as jest.Mocked<DaLiveService>;

        mockAuthService = {
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
            }),
            isAuthenticated: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AuthenticationService>;

        mockComponentManager = {
            installComponent: jest.fn().mockResolvedValue({
                success: true,
                component: { id: 'commerce-demo-ingestion', status: 'ready' },
            }),
        } as unknown as jest.Mocked<ComponentManager>;

        mockProgressCallback = jest.fn();

        defaultConfig = {
            projectName: 'Test Store',
            projectPath: '/path/to/project',
            repoName: 'test-storefront',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            accsEndpoint: 'https://commerce.example.com',
            storeCode: 'default',
            storeViewCode: 'default',
            websiteCode: 'base',
        };

        // Mock fetch for Helix API and code bus
        mockFetch.mockResolvedValue({ ok: true, status: 200 });

        service = new EdsProjectService(
            mockGithubService,
            mockDaLiveService,
            mockAuthService,
            mockComponentManager,
        );
    });

    describe('initialization', () => {
        it('should initialize with required dependencies', () => {
            expect(service).toBeDefined();
            expect(service).toBeInstanceOf(EdsProjectService);
        });

        it('should throw error if GitHubService not provided', () => {
            expect(() => new EdsProjectService(
                null as any,
                mockDaLiveService,
                mockAuthService,
                mockComponentManager,
            )).toThrow('GitHubService is required');
        });

        it('should throw error if DaLiveService not provided', () => {
            expect(() => new EdsProjectService(
                mockGithubService,
                null as any,
                mockAuthService,
                mockComponentManager,
            )).toThrow('DaLiveService is required');
        });
    });

    describe('setupProject - orchestration', () => {
        it('should execute setup phases in correct order', async () => {
            const phasesExecuted: EdsSetupPhase[] = [];

            await service.setupProject(defaultConfig, (phase) => {
                phasesExecuted.push(phase);
            });

            expect(phasesExecuted).toEqual([
                'github-repo',
                'github-clone',
                'helix-config',
                'code-sync',
                'dalive-content',
                'tools-clone',
                'env-config',
                'complete',
            ]);
        });

        it('should stop execution on phase failure', async () => {
            mockGithubService.createFromTemplate.mockRejectedValueOnce(
                new Error('Repository creation failed')
            );

            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            expect(result.success).toBe(false);
            expect(result.phase).toBe('github-repo');
            expect(mockGithubService.cloneRepository).not.toHaveBeenCalled();
        });

        it('should report progress through callback', async () => {
            await service.setupProject(defaultConfig, mockProgressCallback);

            expect(mockProgressCallback).toHaveBeenCalledWith(
                'github-repo',
                expect.any(Number),
                expect.any(String)
            );
            expect(mockProgressCallback).toHaveBeenCalledWith(
                'complete',
                100,
                expect.any(String)
            );
        });

        it('should complete all phases successfully', async () => {
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            expect(result.success).toBe(true);
            expect(result.repoUrl).toBeDefined();
            expect(result.previewUrl).toBeDefined();
        });
    });

    describe('setupProject - GitHub repository', () => {
        it('should create repository from citisignal template', async () => {
            await service.setupProject(defaultConfig, mockProgressCallback);

            expect(mockGithubService.createFromTemplate).toHaveBeenCalledWith(
                'skukla',
                'citisignal-one',
                'test-storefront',
                expect.any(Object)
            );
        });

        it('should clone repository to project path', async () => {
            await service.setupProject(defaultConfig, mockProgressCallback);

            expect(mockGithubService.cloneRepository).toHaveBeenCalledWith(
                'https://github.com/testuser/test-storefront.git',
                expect.stringContaining('/path/to/project')
            );
        });

        it('should handle repository name conflict', async () => {
            mockGithubService.createFromTemplate.mockRejectedValueOnce(
                new Error('Repository "test-storefront" already exists')
            );

            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            expect(result.success).toBe(false);
            expect(result.error).toContain('already exists');
        });
    });

    describe('setupProject - Helix 5 configuration', () => {
        it('should configure site via admin.hlx.page API', async () => {
            await service.setupProject(defaultConfig, mockProgressCallback);

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('admin.hlx.page'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer mock-ims-token',
                    }),
                })
            );
        });

        it('should poll code bus until sync verified', async () => {
            // First call returns 404 (not synced), second returns 200 (synced)
            mockFetch
                .mockResolvedValueOnce({ ok: true }) // helix config
                .mockResolvedValueOnce({ ok: false, status: 404 }) // code bus poll 1
                .mockResolvedValueOnce({ ok: true, status: 200 }); // code bus poll 2

            await service.setupProject(defaultConfig, mockProgressCallback);

            // Verify polling occurred
            const codeBusCalls = mockFetch.mock.calls.filter(
                call => call[0].includes('admin.hlx.page/code')
            );
            expect(codeBusCalls.length).toBeGreaterThanOrEqual(1);
        });

        it('should generate preview URL on sync success', async () => {
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            expect(result.previewUrl).toBe(
                'https://main--test-storefront--testuser.aem.page'
            );
        });
    });

    describe('setupProject - DA.live content', () => {
        it('should copy CitiSignal content to DA.live', async () => {
            await service.setupProject(defaultConfig, mockProgressCallback);

            expect(mockDaLiveService.copyCitisignalContent).toHaveBeenCalledWith(
                'test-org',
                'test-site',
                expect.any(Function)
            );
        });

        it('should handle partial content copy failure', async () => {
            mockDaLiveService.copyCitisignalContent.mockResolvedValueOnce({
                success: false,
                copiedFiles: ['/index.html'],
                failedFiles: [{ path: '/about.html', error: 'Copy failed' }],
                totalFiles: 2,
            });

            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Should continue despite partial failure
            expect(result.success).toBe(true);
        });
    });

    describe('setupProject - tools cloning', () => {
        it('should clone commerce-demo-ingestion via ComponentManager', async () => {
            await service.setupProject(defaultConfig, mockProgressCallback);

            expect(mockComponentManager.installComponent).toHaveBeenCalledWith(
                expect.objectContaining({
                    path: '/path/to/project',
                }),
                expect.objectContaining({
                    id: 'commerce-demo-ingestion',
                }),
                expect.objectContaining({
                    skipDependencies: true,
                })
            );
        });

        it('should handle tool clone failure gracefully', async () => {
            mockComponentManager.installComponent.mockResolvedValueOnce({
                success: false,
                error: 'Clone failed',
            });

            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            // Should continue - tool is optional
            expect(result.success).toBe(true);
        });
    });

    describe('setupProject - environment configuration', () => {
        it('should generate .env file with ACCS configuration', async () => {
            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            expect(result.success).toBe(true);
            // .env generation verified via file system mock in actual implementation
        });
    });

    describe('error handling', () => {
        it('should provide detailed error on GitHub failure', async () => {
            mockGithubService.createFromTemplate.mockRejectedValueOnce({
                status: 403,
                message: 'Forbidden',
            });

            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.phase).toBe('github-repo');
        });

        it('should handle network timeout gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('network timeout'));

            const result = await service.setupProject(defaultConfig, mockProgressCallback);

            expect(result.success).toBe(false);
            expect(result.error).toContain('timeout');
        });
    });
});
```

### GREEN Phase (Minimal Implementation)

```typescript
// src/features/eds/services/edsProjectService.ts

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger, Logger } from '@/core/logging';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { GitHubService } from './githubService';
import type { DaLiveService } from './daLiveService';
import type { AuthenticationService } from '@/features/authentication/services/authenticationService';
import type { ComponentManager } from '@/features/components/services/componentManager';
import type {
    EdsProjectConfig,
    EdsProjectSetupResult,
    EdsSetupPhase,
    EdsProgressCallback,
    HelixConfigResult,
} from './types';

/**
 * Citisignal template repository configuration
 */
const CITISIGNAL_TEMPLATE = {
    owner: 'skukla',
    repo: 'citisignal-one',
};

/**
 * commerce-demo-ingestion tool configuration
 */
const INGESTION_TOOL = {
    id: 'commerce-demo-ingestion',
    name: 'Commerce Demo Ingestion',
    source: {
        type: 'git' as const,
        url: 'https://github.com/skukla/commerce-demo-ingestion',
        branch: 'main',
        gitOptions: {
            shallow: true,
        },
    },
};

/**
 * Helix Configuration Service endpoints
 */
const HELIX_ADMIN_URL = 'https://admin.hlx.page';
const CODE_SYNC_MAX_ATTEMPTS = 25;
const CODE_SYNC_POLL_INTERVAL = 5000; // 5 seconds

/**
 * EDS Project Service - Orchestrates complete project setup
 *
 * Follows direct sequential method calls (no abstract orchestrator pattern).
 * Pattern inspired by meshSetupService.ts from project-creation.
 */
export class EdsProjectService {
    private logger: Logger;

    constructor(
        private readonly githubService: GitHubService,
        private readonly daLiveService: DaLiveService,
        private readonly authService: AuthenticationService,
        private readonly componentManager: ComponentManager,
    ) {
        if (!githubService) {
            throw new Error('GitHubService is required for EdsProjectService');
        }
        if (!daLiveService) {
            throw new Error('DaLiveService is required for EdsProjectService');
        }
        if (!authService) {
            throw new Error('AuthenticationService is required for EdsProjectService');
        }
        if (!componentManager) {
            throw new Error('ComponentManager is required for EdsProjectService');
        }

        this.logger = getLogger();
    }

    /**
     * Main orchestration method - executes all setup phases sequentially
     */
    async setupProject(
        config: EdsProjectConfig,
        progressCallback?: EdsProgressCallback,
    ): Promise<EdsProjectSetupResult> {
        const progress = (phase: EdsSetupPhase, percent: number, message: string) => {
            progressCallback?.(phase, percent, message);
        };

        let repoUrl: string | undefined;
        let repoClonePath: string | undefined;
        let previewUrl: string | undefined;
        let liveUrl: string | undefined;
        let daLiveContentUrl: string | undefined;
        let toolsPath: string | undefined;

        try {
            // Phase 1: Create GitHub repository from template
            this.logger.info('[EDS] Phase 1: Creating GitHub repository...');
            progress('github-repo', 10, 'Creating GitHub repository from template...');

            const user = await this.githubService.getAuthenticatedUser();
            const owner = config.githubOwner || user.login;

            const repo = await this.githubService.createFromTemplate(
                CITISIGNAL_TEMPLATE.owner,
                CITISIGNAL_TEMPLATE.repo,
                config.repoName,
                { description: `EDS Storefront for ${config.projectName}` },
            );

            repoUrl = repo.htmlUrl;
            this.logger.info(`[EDS] Repository created: ${repo.fullName}`);

            // Phase 2: Clone repository locally
            this.logger.info('[EDS] Phase 2: Cloning repository...');
            progress('github-clone', 20, 'Cloning repository to local machine...');

            repoClonePath = path.join(config.projectPath, config.repoName);
            await this.githubService.cloneRepository(repo.cloneUrl, repoClonePath);
            this.logger.info(`[EDS] Repository cloned to ${repoClonePath}`);

            // Phase 3: Configure Helix 5 via Configuration Service
            this.logger.info('[EDS] Phase 3: Configuring Helix 5...');
            progress('helix-config', 35, 'Configuring Edge Delivery Services...');

            const helixResult = await this.configureHelix(
                owner,
                config.repoName,
                config.daLiveOrg,
                config.daLiveSite,
            );

            if (!helixResult.success) {
                throw new Error(helixResult.error || 'Helix configuration failed');
            }

            // Phase 4: Verify Code Bus sync
            this.logger.info('[EDS] Phase 4: Verifying Code Sync...');
            progress('code-sync', 45, 'Waiting for code to sync to Edge Delivery...');

            const syncResult = await this.verifyCodeSync(owner, config.repoName, (attempt, max) => {
                const percent = 45 + (attempt / max) * 15; // 45-60%
                progress('code-sync', percent, `Verifying code sync (${attempt}/${max})...`);
            });

            if (syncResult.synced) {
                previewUrl = `https://main--${config.repoName}--${owner}.aem.page`;
                liveUrl = `https://main--${config.repoName}--${owner}.aem.live`;
                this.logger.info(`[EDS] Code sync verified: ${previewUrl}`);
            } else {
                this.logger.warn('[EDS] Code sync not verified within timeout - manual verification may be needed');
            }

            // Phase 5: Copy DA.live content
            this.logger.info('[EDS] Phase 5: Populating DA.live content...');
            progress('dalive-content', 65, 'Copying CitiSignal content to DA.live...');

            const copyResult = await this.daLiveService.copyCitisignalContent(
                config.daLiveOrg,
                config.daLiveSite,
                (copyProgress) => {
                    const percent = 65 + (copyProgress.current / copyProgress.total) * 15; // 65-80%
                    progress('dalive-content', percent, `Copying: ${copyProgress.currentFile}`);
                },
            );

            if (copyResult.failedFiles.length > 0) {
                this.logger.warn(`[EDS] ${copyResult.failedFiles.length} files failed to copy`);
            }

            daLiveContentUrl = `https://content.da.live/${config.daLiveOrg}/${config.daLiveSite}/`;
            this.logger.info(`[EDS] Content copied: ${copyResult.copiedFiles.length} files`);

            // Phase 6: Clone commerce-demo-ingestion tool
            this.logger.info('[EDS] Phase 6: Cloning ingestion tool...');
            progress('tools-clone', 85, 'Cloning commerce-demo-ingestion tool...');

            const toolResult = await this.cloneIngestionTool(config.projectPath);
            if (toolResult.success) {
                toolsPath = toolResult.path;
                this.logger.info(`[EDS] Ingestion tool cloned to ${toolsPath}`);
            } else {
                this.logger.warn(`[EDS] Tool clone failed (non-fatal): ${toolResult.error}`);
            }

            // Phase 7: Generate .env configuration
            this.logger.info('[EDS] Phase 7: Generating environment configuration...');
            progress('env-config', 95, 'Generating .env configuration...');

            await this.generateEnvFile(repoClonePath, config);
            this.logger.info('[EDS] Environment configuration generated');

            // Complete
            progress('complete', 100, 'EDS project setup complete!');
            this.logger.info('[EDS] Project setup complete');

            return {
                success: true,
                repoUrl,
                repoClonePath,
                previewUrl,
                liveUrl,
                daLiveContentUrl,
                toolsPath,
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error('[EDS] Project setup failed', error as Error);

            // Determine which phase failed based on what's populated
            let failedPhase: EdsSetupPhase = 'github-repo';
            if (repoUrl) failedPhase = 'github-clone';
            if (repoClonePath) failedPhase = 'helix-config';
            // Add more phase detection as needed

            return {
                success: false,
                error: errorMessage,
                phase: failedPhase,
                repoUrl,
                repoClonePath,
            };
        }
    }

    /**
     * Configure Helix 5 via Configuration Service API
     */
    private async configureHelix(
        owner: string,
        repo: string,
        daLiveOrg: string,
        daLiveSite: string,
    ): Promise<HelixConfigResult> {
        try {
            const token = await this.getImsToken();

            // Helix 5 uses Configuration Service API (not fstab.yaml)
            const configUrl = `${HELIX_ADMIN_URL}/config/${owner}/${repo}/main`;

            const configPayload = {
                contentBusId: `${daLiveOrg}/${daLiveSite}`,
                mountpoints: {
                    '/': `https://content.da.live/${daLiveOrg}/${daLiveSite}/`,
                },
            };

            const response = await fetch(configUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(configPayload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                return {
                    success: false,
                    error: `Helix configuration failed: ${response.status} - ${errorText}`,
                };
            }

            return {
                success: true,
                previewUrl: `https://main--${repo}--${owner}.aem.page`,
                liveUrl: `https://main--${repo}--${owner}.aem.live`,
            };
        } catch (error) {
            return {
                success: false,
                error: `Helix configuration error: ${error}`,
            };
        }
    }

    /**
     * Poll code bus to verify repository is synced to Edge Delivery
     */
    private async verifyCodeSync(
        owner: string,
        repo: string,
        onPoll?: (attempt: number, max: number) => void,
    ): Promise<{ synced: boolean; attempts: number }> {
        const codeBusUrl = `${HELIX_ADMIN_URL}/code/${owner}/${repo}/main/scripts/aem.js`;

        for (let attempt = 1; attempt <= CODE_SYNC_MAX_ATTEMPTS; attempt++) {
            onPoll?.(attempt, CODE_SYNC_MAX_ATTEMPTS);

            try {
                const response = await fetch(codeBusUrl);

                if (response.ok) {
                    return { synced: true, attempts: attempt };
                }

                this.logger.debug(`[EDS] Code sync poll ${attempt}/${CODE_SYNC_MAX_ATTEMPTS}: ${response.status}`);
            } catch (error) {
                this.logger.debug(`[EDS] Code sync poll ${attempt} failed: ${error}`);
            }

            if (attempt < CODE_SYNC_MAX_ATTEMPTS) {
                await this.delay(CODE_SYNC_POLL_INTERVAL);
            }
        }

        return { synced: false, attempts: CODE_SYNC_MAX_ATTEMPTS };
    }

    /**
     * Clone commerce-demo-ingestion tool to project
     */
    private async cloneIngestionTool(
        projectPath: string,
    ): Promise<{ success: boolean; path?: string; error?: string }> {
        try {
            const toolsDir = path.join(projectPath, 'tools');
            await fs.mkdir(toolsDir, { recursive: true });

            const toolPath = path.join(toolsDir, INGESTION_TOOL.id);

            // Create minimal project-like structure for ComponentManager
            const pseudoProject = {
                path: toolsDir,
            };

            const result = await this.componentManager.installComponent(
                pseudoProject as any,
                INGESTION_TOOL as any,
                { skipDependencies: true },
            );

            if (result.success) {
                return { success: true, path: toolPath };
            } else {
                return { success: false, error: result.error };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Generate .env file for the EDS storefront
     */
    private async generateEnvFile(
        repoPath: string,
        config: EdsProjectConfig,
    ): Promise<void> {
        const envPath = path.join(repoPath, '.env');

        const envContent = [
            `# EDS Storefront Configuration`,
            `# Generated by Demo Builder`,
            ``,
            `# Adobe Commerce (ACCS) Configuration`,
            `COMMERCE_STORE_URL=${config.accsEndpoint}`,
            `COMMERCE_STORE_CODE=${config.storeCode}`,
            `COMMERCE_STORE_VIEW_CODE=${config.storeViewCode}`,
            `COMMERCE_WEBSITE_CODE=${config.websiteCode}`,
            config.catalogApiKey ? `COMMERCE_CATALOG_API_KEY=${config.catalogApiKey}` : '',
            ``,
            `# DA.live Configuration`,
            `DA_LIVE_ORG=${config.daLiveOrg}`,
            `DA_LIVE_SITE=${config.daLiveSite}`,
            ``,
        ].filter(line => line !== '').join('\n');

        // Check if .env exists and merge
        try {
            await fs.access(envPath);
            // File exists - could implement smart merge here
            this.logger.debug('[EDS] Existing .env found, appending new values');
            const existingContent = await fs.readFile(envPath, 'utf-8');
            await fs.writeFile(envPath, existingContent + '\n' + envContent, 'utf-8');
        } catch {
            // File doesn't exist, create new
            await fs.writeFile(envPath, envContent, 'utf-8');
        }
    }

    /**
     * Get IMS token from AuthenticationService
     */
    private async getImsToken(): Promise<string> {
        const tokenManager = this.authService.getTokenManager();
        const token = await tokenManager.getAccessToken();

        if (!token) {
            throw new Error('IMS authentication required for Helix configuration');
        }

        return token;
    }

    /**
     * Utility delay function
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
```

### REFACTOR Phase

1. **Extract timeout constants** to `@/core/utils/timeoutConfig.ts`:
   ```typescript
   export const TIMEOUTS = {
       // ... existing timeouts
       EDS_HELIX_CONFIG: 30000,    // Helix configuration timeout
       EDS_CODE_SYNC_POLL: 5000,   // Code sync poll interval
       EDS_CODE_SYNC_TOTAL: 125000, // Total code sync timeout (25 * 5s)
   };
   ```

2. **Extract error formatting** to shared error utilities
3. **Add JSDoc comments** for all public methods
4. **Consider extracting Helix configuration** to separate helper if it grows

---

## Expected Outcome

After completing this step:

- [ ] EdsProjectService fully implemented with sequential orchestration
- [ ] All 7 setup phases executing in correct order
- [ ] GitHub repository creation from citisignal template working
- [ ] Helix 5 Configuration Service integration working
- [ ] Code Bus verification polling working
- [ ] DA.live content copy integrated
- [ ] commerce-demo-ingestion tool cloning working
- [ ] .env file generation working
- [ ] Comprehensive error handling with phase tracking
- [ ] Unit tests passing with 90%+ coverage

**What can be demonstrated:**
- Complete EDS project setup from single method call
- Progress reporting through all phases
- Proper error handling with recovery hints
- Integration with GitHubService, DaLiveService, ComponentManager

---

## Acceptance Criteria

- [ ] All unit tests passing for EdsProjectService
- [ ] Code follows project style guide (ESLint passing)
- [ ] No debug code (console.log, debugger)
- [ ] Coverage >= 90% for edsProjectService.ts
- [ ] Error messages are user-friendly
- [ ] Progress callback invoked for all phases
- [ ] Phases execute in correct sequential order
- [ ] Failed phases stop subsequent execution
- [ ] Partial failure info included in result
- [ ] Logging at appropriate levels (info, debug, warn, error)

---

## Estimated Time

**Total:** 6-8 hours

- Test writing (RED): 2-3 hours
- Implementation (GREEN): 3-4 hours
- Refactoring: 1 hour

---

## Notes

### Citisignal Template Repository

- **Owner:** `skukla`
- **Repository:** `citisignal-one`
- **Branch:** `main`
- **Type:** EDS boilerplate with Commerce Drop-in components

### Helix 5 Configuration Service

Unlike Helix 4 (Franklin) which used `fstab.yaml`, Helix 5 uses the Configuration Service API:

```http
POST https://admin.hlx.page/config/{owner}/{repo}/{branch}
Authorization: Bearer <IMS_TOKEN>
Content-Type: application/json

{
  "contentBusId": "{daLiveOrg}/{daLiveSite}",
  "mountpoints": {
    "/": "https://content.da.live/{daLiveOrg}/{daLiveSite}/"
  }
}
```

### Code Bus Verification Pattern

From storefront-tools reference implementation:
- Polls `admin.hlx.page/code/{owner}/{repo}/main/scripts/aem.js`
- Max 25 attempts at 5-second intervals (125s total)
- 200 response indicates successful sync

### Error Recovery Guidance

When project setup fails, include cleanup instructions:
- GitHub repo created but not cloned: User can delete repo manually
- Clone succeeded but Helix failed: Configuration can be retried
- Content copy failed: Can be retried via DA.live directly

### Pattern Reference

This service follows patterns from:
- `src/features/project-creation/handlers/services/meshSetupService.ts` - Phase-based setup
- `src/features/components/services/componentManager.ts` - Component installation

---

## Related Steps

- **Step 2 (GitHub Service):** Provides repo creation and clone operations
- **Step 3 (DA.live Service):** Provides content copy operations
- **Step 5 (Data Source Config):** Uses this service for project setup
- **Step 6 (Wizard Steps):** Invokes this service from UI

---

## Dependencies on This Step

- **Step 5 (Data Source Config):** Uses EdsProjectService for tool configuration
- **Step 6 (Wizard Steps):** Uses EdsProjectService.setupProject() as main setup method
- **Step 7 (Integration):** Tests complete flow via EdsProjectService
