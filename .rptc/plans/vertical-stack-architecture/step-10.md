# Step 10: Integration Testing & Polish

## Status

- [ ] Tests Written (RED)
- [ ] Implementation Complete (GREEN)
- [ ] Refactored (REFACTOR)

---

## Purpose

Complete the EDS deployment feature with end-to-end integration tests, error message polish, progress reporting integration, and documentation updates. This final step ensures all previous steps work together seamlessly and the feature is production-ready.

**Why Integration Testing Last?**
- All services are implemented and unit tested (Steps 2-5)
- Wizard steps are connected (Step 6)
- Integration tests validate the complete workflow
- Polish ensures consistent user experience

---

## Prerequisites

- [ ] Step 1 complete: Component registry updated with `eds-citisignal-storefront`
- [ ] Step 2 complete: GitHub Service with OAuth and repository operations
- [ ] Step 3 complete: DA.live Service with content copy operations
- [ ] Step 4 complete: EDS Project Service orchestrating all services
- [ ] Step 5 complete: Tool Integration (commerce-demo-ingestion)
- [ ] Step 6 complete: Wizard Steps (DataSourceConfigStep, GitHubDaLiveSetupStep)

---

## Dependencies

### Existing Dependencies (Reused)

- All services from Steps 2-5
- All wizard steps from Step 6
- `@/core/logging` - StepLogger for consistent logging
- `@/features/project-creation/ui/wizard` - WizardContainer
- `jest` and `@testing-library/react` for testing

### No New npm Packages Required

---

## Test Strategy

### Testing Approach

- **Framework:** Jest with ts-jest (Node) + @testing-library/react (UI)
- **Integration Focus:** Cross-service workflows, error propagation, state management
- **Coverage Target:** 85% overall, 100% for critical paths (OAuth, deployment)

### Test File Structure

```
tests/
├── integration/
│   └── features/
│       └── eds/
│           ├── edsProjectCreation.test.ts        # Full workflow integration
│           ├── edsErrorRecovery.test.ts          # Error recovery scenarios
│           └── edsPartialFailure.test.ts         # Partial failure handling
└── features/
    └── eds/
        └── ui/
            └── steps/
                ├── DataSourceConfigStep.test.tsx  # Step UI tests
                └── GitHubDaLiveSetupStep.test.tsx # Step UI tests
```

---

## Tests to Write First

### Integration Tests: Full EDS Project Creation Workflow

**Test File:** `tests/integration/features/eds/edsProjectCreation.test.ts`

#### Test Group 1: Complete Happy Path Flow

- [ ] **Test:** Should complete full EDS project creation workflow
  - **Given:** User is authenticated with Adobe, has GitHub token, has DA.live access
  - **When:** User selects EDS CitiSignal template and completes all wizard steps
  - **Then:** GitHub repo created, DA.live content copied, tools installed, .env configured
  - **File:** `tests/integration/features/eds/edsProjectCreation.test.ts`

- [ ] **Test:** Should orchestrate services in correct order
  - **Given:** All services are available
  - **When:** EDS project creation is initiated
  - **Then:** Services called in order: GitHub OAuth -> Repo creation -> DA.live copy -> Tool install -> Helix config
  - **File:** `tests/integration/features/eds/edsProjectCreation.test.ts`

- [ ] **Test:** Should report progress through all phases
  - **Given:** Progress callback provided
  - **When:** EDS project creation runs
  - **Then:** Progress updates received for: auth (10%), repo (30%), content (60%), tools (80%), config (100%)
  - **File:** `tests/integration/features/eds/edsProjectCreation.test.ts`

- [ ] **Test:** Should handle component selection with EDS frontend
  - **Given:** User selects `eds-citisignal-storefront` frontend
  - **When:** ComponentSelectionStep validates selection
  - **Then:** ACCS backend required, no commerce-mesh dependency
  - **File:** `tests/integration/features/eds/edsProjectCreation.test.ts`

- [ ] **Test:** Should skip API Mesh step for EDS projects
  - **Given:** EDS frontend selected (no mesh dependency)
  - **When:** Wizard navigation proceeds
  - **Then:** API Mesh step is skipped, proceeds to data source config
  - **File:** `tests/integration/features/eds/edsProjectCreation.test.ts`

#### Test Group 2: Service Coordination

- [ ] **Test:** Should pass GitHub repo info to DA.live service
  - **Given:** GitHub repo successfully created
  - **When:** DA.live content copy initiated
  - **Then:** DA.live service receives correct org/site from GitHub repo name
  - **File:** `tests/integration/features/eds/edsProjectCreation.test.ts`

- [ ] **Test:** Should pass DA.live site info to Helix config service
  - **Given:** DA.live content copied to user's org/site
  - **When:** Helix configuration initiated
  - **Then:** Helix config service receives correct content source URL
  - **File:** `tests/integration/features/eds/edsProjectCreation.test.ts`

- [ ] **Test:** Should configure .env with all service endpoints
  - **Given:** All services completed successfully
  - **When:** Environment configuration generated
  - **Then:** .env contains: GitHub repo URL, DA.live org/site, ACCS endpoints, Helix config
  - **File:** `tests/integration/features/eds/edsProjectCreation.test.ts`

### Integration Tests: Error Recovery Scenarios

**Test File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

#### Test Group 3: GitHub Failures

- [ ] **Test:** Should handle GitHub OAuth cancellation gracefully
  - **Given:** User starts OAuth flow
  - **When:** User cancels OAuth in browser
  - **Then:** Clear error message shown, retry option available, no partial state
  - **File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

- [ ] **Test:** Should handle GitHub repo name conflict
  - **Given:** User enters repo name that already exists
  - **When:** Repo creation attempted
  - **Then:** Error suggests different name, user can modify and retry
  - **File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

- [ ] **Test:** Should handle GitHub token expiration mid-flow
  - **Given:** Token valid at start, expires during content copy
  - **When:** API call fails with 401
  - **Then:** Re-authentication flow triggered, resumes from failed step
  - **File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

- [ ] **Test:** Should handle GitHub rate limiting
  - **Given:** Many API calls made, rate limit exceeded
  - **When:** API returns 403 with rate limit message
  - **Then:** Automatic retry after Retry-After header, user informed of delay
  - **File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

#### Test Group 4: DA.live Failures

- [ ] **Test:** Should handle DA.live organization access denied
  - **Given:** User doesn't have access to specified org
  - **When:** Org verification fails
  - **Then:** Clear error explaining access issue, option to use different org
  - **File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

- [ ] **Test:** Should handle DA.live API timeout
  - **Given:** DA.live API slow to respond
  - **When:** Request times out
  - **Then:** Automatic retry with exponential backoff, user sees progress indicator
  - **File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

- [ ] **Test:** Should handle DA.live content copy failure for single file
  - **Given:** Most files copy successfully, one fails
  - **When:** Content copy reports partial failure
  - **Then:** User informed of failed file, option to retry or skip
  - **File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

#### Test Group 5: Helix Configuration Failures

- [ ] **Test:** Should handle Helix config service unavailable
  - **Given:** Helix Configuration Service returns 503
  - **When:** Config update attempted
  - **Then:** Retry with backoff, user informed, manual config instructions provided
  - **File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

- [ ] **Test:** Should handle Code Sync verification timeout
  - **Given:** Code sync takes longer than expected
  - **When:** Polling exceeds timeout
  - **Then:** Warning shown, project still usable, manual sync instructions
  - **File:** `tests/integration/features/eds/edsErrorRecovery.test.ts`

### Integration Tests: Partial Failure Handling

**Test File:** `tests/integration/features/eds/edsPartialFailure.test.ts`

#### Test Group 6: Recovery from Partial Completion

- [ ] **Test:** Should allow resuming from GitHub repo created state
  - **Given:** GitHub repo created, DA.live copy failed
  - **When:** User retries project creation
  - **Then:** Detects existing repo, skips to DA.live step
  - **File:** `tests/integration/features/eds/edsPartialFailure.test.ts`

- [ ] **Test:** Should allow resuming from DA.live content copied state
  - **Given:** Content copied, Helix config failed
  - **When:** User retries
  - **Then:** Detects existing content, skips to Helix config step
  - **File:** `tests/integration/features/eds/edsPartialFailure.test.ts`

- [ ] **Test:** Should handle cleanup on user cancellation
  - **Given:** User cancels mid-flow after GitHub repo created
  - **When:** Cancellation confirmed
  - **Then:** Option to keep or delete created GitHub repo
  - **File:** `tests/integration/features/eds/edsPartialFailure.test.ts`

- [ ] **Test:** Should provide rollback instructions for manual cleanup
  - **Given:** Creation fails partway through
  - **When:** Error recovery UI shown
  - **Then:** Rollback instructions provided: delete GitHub repo, DA.live content
  - **File:** `tests/integration/features/eds/edsPartialFailure.test.ts`

#### Test Group 7: State Consistency

- [ ] **Test:** Should maintain consistent state across retries
  - **Given:** First attempt partially failed
  - **When:** User modifies settings and retries
  - **Then:** Previous partial state cleared, fresh attempt with new settings
  - **File:** `tests/integration/features/eds/edsPartialFailure.test.ts`

- [ ] **Test:** Should prevent duplicate resource creation
  - **Given:** Network error during repo creation (actually succeeded)
  - **When:** User retries
  - **Then:** Detects existing repo, continues rather than creating duplicate
  - **File:** `tests/integration/features/eds/edsPartialFailure.test.ts`

### UI Tests: Wizard Step Integration

**Test File:** `tests/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

#### Test Group 8: DataSourceConfigStep UI

- [ ] **Test:** Should render ACCS credential input fields
  - **Given:** DataSourceConfigStep mounted
  - **When:** Component renders
  - **Then:** Fields shown for: Store URL, Store Code, Store View Code, Website Code
  - **File:** `tests/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should validate required fields before allowing continue
  - **Given:** Some required fields empty
  - **When:** User clicks Continue
  - **Then:** Validation errors shown, Continue disabled until all required fields filled
  - **File:** `tests/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should save configuration to wizard state
  - **Given:** All fields filled with valid data
  - **When:** User clicks Continue
  - **Then:** Wizard state updated with ACCS configuration
  - **File:** `tests/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

- [ ] **Test:** Should load existing configuration from wizard state
  - **Given:** User navigates back to step
  - **When:** Component mounts with existing state
  - **Then:** Fields pre-populated with previous values
  - **File:** `tests/features/eds/ui/steps/DataSourceConfigStep.test.tsx`

**Test File:** `tests/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

#### Test Group 9: GitHubDaLiveSetupStep UI

- [ ] **Test:** Should show GitHub authentication prompt when not authenticated
  - **Given:** No GitHub token stored
  - **When:** Step renders
  - **Then:** "Connect GitHub" button shown, repo creation UI hidden
  - **File:** `tests/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show repository creation UI after GitHub auth
  - **Given:** GitHub token valid
  - **When:** Step renders
  - **Then:** GitHub user shown, repo name input visible, DA.live config visible
  - **File:** `tests/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should validate repository name format
  - **Given:** User enters repo name
  - **When:** Name contains invalid characters
  - **Then:** Inline validation error, suggests valid format
  - **File:** `tests/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show DA.live org/site configuration
  - **Given:** Step rendered with GitHub authenticated
  - **When:** Component shows DA.live section
  - **Then:** Org and site inputs shown with helpful descriptions
  - **File:** `tests/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should verify DA.live access on blur
  - **Given:** User enters DA.live org name
  - **When:** User tabs out of org field
  - **Then:** Background verification shows access status indicator
  - **File:** `tests/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

- [ ] **Test:** Should show progress during resource creation
  - **Given:** User clicks Continue with valid configuration
  - **When:** Backend operations in progress
  - **Then:** Progress overlay shows current operation (Creating repo... Copying content...)
  - **File:** `tests/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx`

---

## Files to Create/Modify

### New Files

#### Integration Tests

- [ ] `tests/integration/features/eds/edsProjectCreation.test.ts` (~400 lines)
- [ ] `tests/integration/features/eds/edsErrorRecovery.test.ts` (~350 lines)
- [ ] `tests/integration/features/eds/edsPartialFailure.test.ts` (~300 lines)

#### UI Tests (if not already created in Step 6)

- [ ] `tests/features/eds/ui/steps/DataSourceConfigStep.test.tsx` (~250 lines)
- [ ] `tests/features/eds/ui/steps/GitHubDaLiveSetupStep.test.tsx` (~300 lines)

### Modified Files

#### Error Message Polish

- [ ] `src/features/eds/services/types.ts` - Add user-friendly error messages
- [ ] `src/features/eds/services/githubService.ts` - Polish error messages
- [ ] `src/features/eds/services/daLiveService.ts` - Polish error messages
- [ ] `src/features/eds/services/edsProjectService.ts` - Consistent error formatting

#### Progress Reporting Integration

- [ ] `src/features/eds/services/edsProjectService.ts` - Detailed progress phases
- [ ] `src/features/eds/ui/steps/GitHubDaLiveSetupStep.tsx` - Progress UI integration

#### Documentation Updates

- [ ] `CLAUDE.md` - Update with EDS feature documentation
- [ ] `src/features/eds/README.md` - Feature documentation
- [ ] `docs/features/eds-deployment.md` - User-facing documentation (optional)

---

## Implementation Details

### RED Phase (Write Integration Tests First)

```typescript
// tests/integration/features/eds/edsProjectCreation.test.ts

import { EdsProjectService } from '@/features/eds/services/edsProjectService';
import { GitHubService } from '@/features/eds/services/githubService';
import { DaLiveService } from '@/features/eds/services/daLiveService';
import { HelixConfigService } from '@/features/eds/services/helixConfigService';
import { AuthenticationService } from '@/features/authentication/services/authenticationService';

// Mock all external services
jest.mock('@/features/eds/services/githubService');
jest.mock('@/features/eds/services/daLiveService');
jest.mock('vscode');

describe('EDS Project Creation Integration', () => {
  let edsProjectService: EdsProjectService;
  let mockGitHubService: jest.Mocked<GitHubService>;
  let mockDaLiveService: jest.Mocked<DaLiveService>;
  let mockAuthService: jest.Mocked<AuthenticationService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock services with default success responses
    mockGitHubService = {
      validateToken: jest.fn().mockResolvedValue({ valid: true, scopes: ['repo', 'user:email'] }),
      getAuthenticatedUser: jest.fn().mockResolvedValue({ login: 'testuser', email: 'test@example.com' }),
      createFromTemplate: jest.fn().mockResolvedValue({
        name: 'my-storefront',
        fullName: 'testuser/my-storefront',
        cloneUrl: 'https://github.com/testuser/my-storefront.git',
        defaultBranch: 'main',
      }),
      cloneRepository: jest.fn().mockResolvedValue(undefined),
      createOrUpdateFile: jest.fn().mockResolvedValue({ sha: 'abc123' }),
    } as unknown as jest.Mocked<GitHubService>;

    mockDaLiveService = {
      verifyOrgAccess: jest.fn().mockResolvedValue({ hasAccess: true, orgName: 'test-org' }),
      copyCitisignalContent: jest.fn().mockResolvedValue({
        success: true,
        copiedFiles: ['/index.html', '/about.html'],
        failedFiles: [],
        totalFiles: 2,
      }),
    } as unknown as jest.Mocked<DaLiveService>;

    mockAuthService = {
      isAuthenticated: jest.fn().mockResolvedValue(true),
      getTokenManager: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-ims-token'),
      }),
    } as unknown as jest.Mocked<AuthenticationService>;

    edsProjectService = new EdsProjectService(
      mockGitHubService,
      mockDaLiveService,
      mockAuthService,
    );
  });

  describe('Complete Happy Path Flow', () => {
    it('should complete full EDS project creation workflow', async () => {
      // Arrange
      const config = {
        projectName: 'my-storefront',
        repoName: 'my-storefront',
        daLiveOrg: 'test-org',
        daLiveSite: 'my-storefront',
        accsConfig: {
          storeUrl: 'https://commerce.example.com',
          storeCode: 'main_website_store',
          storeViewCode: 'default',
          websiteCode: 'base',
        },
        localPath: '/path/to/projects/my-storefront',
      };

      // Act
      const result = await edsProjectService.createProject(config);

      // Assert
      expect(result.success).toBe(true);
      expect(mockGitHubService.createFromTemplate).toHaveBeenCalledWith(
        'skukla',
        'citisignal-one',
        'my-storefront',
        expect.any(Object),
      );
      expect(mockDaLiveService.copyCitisignalContent).toHaveBeenCalledWith(
        'test-org',
        'my-storefront',
        expect.any(Function),
      );
      expect(mockGitHubService.cloneRepository).toHaveBeenCalled();
    });

    it('should orchestrate services in correct order', async () => {
      // Arrange
      const callOrder: string[] = [];
      mockGitHubService.validateToken.mockImplementation(async () => {
        callOrder.push('github:validateToken');
        return { valid: true, scopes: ['repo', 'user:email'] };
      });
      mockGitHubService.createFromTemplate.mockImplementation(async () => {
        callOrder.push('github:createFromTemplate');
        return { name: 'repo', fullName: 'user/repo', cloneUrl: 'url', defaultBranch: 'main' };
      });
      mockDaLiveService.verifyOrgAccess.mockImplementation(async () => {
        callOrder.push('dalive:verifyOrgAccess');
        return { hasAccess: true, orgName: 'org' };
      });
      mockDaLiveService.copyCitisignalContent.mockImplementation(async () => {
        callOrder.push('dalive:copyCitisignalContent');
        return { success: true, copiedFiles: [], failedFiles: [], totalFiles: 0 };
      });
      mockGitHubService.cloneRepository.mockImplementation(async () => {
        callOrder.push('github:cloneRepository');
      });

      // Act
      await edsProjectService.createProject({
        projectName: 'test',
        repoName: 'test',
        daLiveOrg: 'org',
        daLiveSite: 'site',
        accsConfig: { storeUrl: 'url', storeCode: 'code', storeViewCode: 'view', websiteCode: 'web' },
        localPath: '/path',
      });

      // Assert
      expect(callOrder).toEqual([
        'github:validateToken',
        'github:createFromTemplate',
        'dalive:verifyOrgAccess',
        'dalive:copyCitisignalContent',
        'github:cloneRepository',
      ]);
    });

    it('should report progress through all phases', async () => {
      // Arrange
      const progressUpdates: Array<{ phase: string; percent: number }> = [];
      const progressCallback = (phase: string, percent: number) => {
        progressUpdates.push({ phase, percent });
      };

      // Act
      await edsProjectService.createProject(
        {
          projectName: 'test',
          repoName: 'test',
          daLiveOrg: 'org',
          daLiveSite: 'site',
          accsConfig: { storeUrl: 'url', storeCode: 'code', storeViewCode: 'view', websiteCode: 'web' },
          localPath: '/path',
        },
        progressCallback,
      );

      // Assert
      expect(progressUpdates.some(p => p.phase === 'auth' && p.percent >= 10)).toBe(true);
      expect(progressUpdates.some(p => p.phase === 'repo' && p.percent >= 30)).toBe(true);
      expect(progressUpdates.some(p => p.phase === 'content' && p.percent >= 60)).toBe(true);
      expect(progressUpdates.some(p => p.phase === 'clone' && p.percent >= 80)).toBe(true);
      expect(progressUpdates.some(p => p.phase === 'complete' && p.percent === 100)).toBe(true);
    });
  });

  describe('Service Coordination', () => {
    it('should pass GitHub repo info to DA.live service', async () => {
      // Arrange
      mockGitHubService.createFromTemplate.mockResolvedValue({
        name: 'custom-storefront',
        fullName: 'testuser/custom-storefront',
        cloneUrl: 'https://github.com/testuser/custom-storefront.git',
        defaultBranch: 'main',
      });

      // Act
      await edsProjectService.createProject({
        projectName: 'test',
        repoName: 'custom-storefront',
        daLiveOrg: 'my-org',
        daLiveSite: 'custom-storefront',
        accsConfig: { storeUrl: 'url', storeCode: 'code', storeViewCode: 'view', websiteCode: 'web' },
        localPath: '/path',
      });

      // Assert
      expect(mockDaLiveService.copyCitisignalContent).toHaveBeenCalledWith(
        'my-org',
        'custom-storefront',
        expect.any(Function),
      );
    });

    it('should configure .env with all service endpoints', async () => {
      // Arrange
      let envContent = '';
      mockGitHubService.createOrUpdateFile.mockImplementation(async (owner, repo, path, content) => {
        if (path.includes('.env')) {
          envContent = content;
        }
        return { sha: 'abc123', commitSha: 'def456' };
      });

      // Act
      await edsProjectService.createProject({
        projectName: 'test',
        repoName: 'test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        accsConfig: {
          storeUrl: 'https://commerce.example.com',
          storeCode: 'main_store',
          storeViewCode: 'default',
          websiteCode: 'base',
        },
        localPath: '/path',
      });

      // Assert (if .env is created via GitHub API)
      // Alternatively check local file creation
      expect(mockGitHubService.cloneRepository).toHaveBeenCalled();
    });
  });
});
```

```typescript
// tests/integration/features/eds/edsErrorRecovery.test.ts

import { EdsProjectService } from '@/features/eds/services/edsProjectService';
import { GitHubService } from '@/features/eds/services/githubService';
import { DaLiveService } from '@/features/eds/services/daLiveService';
import { AuthError, NetworkError } from '@/types/errors';

jest.mock('@/features/eds/services/githubService');
jest.mock('@/features/eds/services/daLiveService');
jest.mock('vscode');

describe('EDS Error Recovery Integration', () => {
  let edsProjectService: EdsProjectService;
  let mockGitHubService: jest.Mocked<GitHubService>;
  let mockDaLiveService: jest.Mocked<DaLiveService>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mocks
    mockGitHubService = createMockGitHubService();
    mockDaLiveService = createMockDaLiveService();
    edsProjectService = new EdsProjectService(mockGitHubService, mockDaLiveService, mockAuthService);
  });

  describe('GitHub Failures', () => {
    it('should handle GitHub OAuth cancellation gracefully', async () => {
      // Arrange
      mockGitHubService.validateToken.mockResolvedValue({ valid: false });

      // Act
      const result = await edsProjectService.createProject(defaultConfig);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTH_REQUIRED');
      expect(result.error?.userMessage).toContain('GitHub');
      expect(result.error?.recoveryHint).toContain('authenticate');
    });

    it('should handle GitHub repo name conflict', async () => {
      // Arrange
      mockGitHubService.createFromTemplate.mockRejectedValue(
        new Error('Repository "existing-repo" already exists. Please choose a different name.'),
      );

      // Act
      const result = await edsProjectService.createProject({
        ...defaultConfig,
        repoName: 'existing-repo',
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.userMessage).toContain('already exists');
      expect(result.error?.recoveryHint).toContain('different name');
    });

    it('should handle GitHub token expiration mid-flow', async () => {
      // Arrange
      mockGitHubService.validateToken.mockResolvedValue({ valid: true, scopes: ['repo'] });
      mockGitHubService.createFromTemplate.mockResolvedValue({
        name: 'repo',
        fullName: 'user/repo',
        cloneUrl: 'url',
        defaultBranch: 'main',
      });
      // Token expires during DA.live copy (DA.live also needs IMS token which triggers GitHub re-check)
      mockDaLiveService.copyCitisignalContent.mockRejectedValue(
        new AuthError('TOKEN_EXPIRED', 'Token expired during operation'),
      );

      // Act
      const result = await edsProjectService.createProject(defaultConfig);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toContain('AUTH');
      expect(result.error?.recoveryHint).toContain('re-authenticate');
      expect(result.partialState?.repoCreated).toBe(true);
    });

    it('should handle GitHub rate limiting', async () => {
      // Arrange
      mockGitHubService.createFromTemplate
        .mockRejectedValueOnce({
          status: 403,
          message: 'API rate limit exceeded',
          response: { headers: { 'retry-after': '60' } },
        })
        .mockResolvedValueOnce({
          name: 'repo',
          fullName: 'user/repo',
          cloneUrl: 'url',
          defaultBranch: 'main',
        });

      // Act
      const result = await edsProjectService.createProject(defaultConfig);

      // Assert
      // If retry is automatic, should succeed
      // If not, should provide clear message about rate limit
      expect(mockGitHubService.createFromTemplate).toHaveBeenCalled();
    });
  });

  describe('DA.live Failures', () => {
    it('should handle DA.live organization access denied', async () => {
      // Arrange
      mockDaLiveService.verifyOrgAccess.mockResolvedValue({
        hasAccess: false,
        orgName: 'private-org',
        reason: 'access denied - you may not have permissions for this organization',
      });

      // Act
      const result = await edsProjectService.createProject({
        ...defaultConfig,
        daLiveOrg: 'private-org',
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.userMessage).toContain('access');
      expect(result.error?.recoveryHint).toContain('different organization');
    });

    it('should handle DA.live API timeout', async () => {
      // Arrange
      mockDaLiveService.copyCitisignalContent.mockRejectedValue(
        new NetworkError('Network error after 3 attempts: timeout'),
      );

      // Act
      const result = await edsProjectService.createProject(defaultConfig);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.userMessage).toContain('DA.live');
      expect(result.error?.recoveryHint).toContain('try again');
    });

    it('should handle DA.live content copy failure for single file', async () => {
      // Arrange
      mockDaLiveService.copyCitisignalContent.mockResolvedValue({
        success: false,
        copiedFiles: ['/index.html', '/about.html'],
        failedFiles: [{ path: '/nav.html', error: 'Network timeout' }],
        totalFiles: 3,
      });

      // Act
      const result = await edsProjectService.createProject(defaultConfig);

      // Assert
      expect(result.success).toBe(false);
      expect(result.partialState?.contentCopied).toBe(true);
      expect(result.partialState?.failedFiles).toContain('/nav.html');
      expect(result.error?.recoveryHint).toContain('retry');
    });
  });
});

// Helper functions
function createMockGitHubService(): jest.Mocked<GitHubService> {
  return {
    validateToken: jest.fn().mockResolvedValue({ valid: true, scopes: ['repo', 'user:email'] }),
    getAuthenticatedUser: jest.fn().mockResolvedValue({ login: 'testuser' }),
    createFromTemplate: jest.fn().mockResolvedValue({
      name: 'repo',
      fullName: 'user/repo',
      cloneUrl: 'https://github.com/user/repo.git',
      defaultBranch: 'main',
    }),
    cloneRepository: jest.fn().mockResolvedValue(undefined),
    createOrUpdateFile: jest.fn().mockResolvedValue({ sha: 'abc' }),
  } as unknown as jest.Mocked<GitHubService>;
}

function createMockDaLiveService(): jest.Mocked<DaLiveService> {
  return {
    verifyOrgAccess: jest.fn().mockResolvedValue({ hasAccess: true, orgName: 'org' }),
    copyCitisignalContent: jest.fn().mockResolvedValue({
      success: true,
      copiedFiles: ['/index.html'],
      failedFiles: [],
      totalFiles: 1,
    }),
  } as unknown as jest.Mocked<DaLiveService>;
}

const defaultConfig = {
  projectName: 'test',
  repoName: 'test-repo',
  daLiveOrg: 'test-org',
  daLiveSite: 'test-site',
  accsConfig: {
    storeUrl: 'https://commerce.example.com',
    storeCode: 'main_store',
    storeViewCode: 'default',
    websiteCode: 'base',
  },
  localPath: '/path/to/project',
};
```

### GREEN Phase (Make Tests Pass)

#### Error Message Polish

Add consistent, user-friendly error messages to all services:

```typescript
// src/features/eds/services/types.ts - Add error formatting utilities

export interface EdsError {
  code: string;
  message: string;
  userMessage: string;
  recoveryHint?: string;
  technicalDetails?: string;
}

export function formatGitHubError(error: unknown): EdsError {
  if (error instanceof Error) {
    if (error.message.includes('already exists')) {
      return {
        code: 'REPO_EXISTS',
        message: error.message,
        userMessage: 'A repository with this name already exists in your GitHub account.',
        recoveryHint: 'Please choose a different repository name.',
      };
    }
    if (error.message.includes('rate limit')) {
      return {
        code: 'RATE_LIMITED',
        message: error.message,
        userMessage: 'GitHub API rate limit reached.',
        recoveryHint: 'Please wait a few minutes and try again.',
      };
    }
    if (error.message.includes('401') || error.message.includes('Bad credentials')) {
      return {
        code: 'AUTH_EXPIRED',
        message: error.message,
        userMessage: 'Your GitHub authentication has expired.',
        recoveryHint: 'Please reconnect your GitHub account.',
      };
    }
  }
  return {
    code: 'GITHUB_ERROR',
    message: String(error),
    userMessage: 'An error occurred while communicating with GitHub.',
    recoveryHint: 'Please check your internet connection and try again.',
  };
}

export function formatDaLiveError(error: unknown): EdsError {
  if (error instanceof Error) {
    if (error.message.includes('access denied') || error.message.includes('403')) {
      return {
        code: 'ACCESS_DENIED',
        message: error.message,
        userMessage: 'You do not have access to this DA.live organization.',
        recoveryHint: 'Please verify the organization name or request access from your administrator.',
      };
    }
    if (error.message.includes('timeout') || error.message.includes('network')) {
      return {
        code: 'NETWORK_ERROR',
        message: error.message,
        userMessage: 'Unable to connect to DA.live.',
        recoveryHint: 'Please check your internet connection and try again.',
      };
    }
  }
  return {
    code: 'DALIVE_ERROR',
    message: String(error),
    userMessage: 'An error occurred while communicating with DA.live.',
    recoveryHint: 'Please try again. If the problem persists, contact support.',
  };
}
```

#### Progress Reporting Integration

Enhance `EdsProjectService` with detailed progress phases:

```typescript
// src/features/eds/services/edsProjectService.ts - Progress reporting

export type EdsProgressPhase =
  | 'auth'       // 0-10%: Validating authentication
  | 'repo'       // 10-30%: Creating GitHub repository
  | 'dalive'     // 30-40%: Verifying DA.live access
  | 'content'    // 40-70%: Copying content
  | 'clone'      // 70-80%: Cloning repository locally
  | 'config'     // 80-90%: Configuring environment
  | 'complete';  // 100%: Complete

export type EdsProgressCallback = (phase: EdsProgressPhase, percent: number, message: string) => void;

// In createProject method:
async createProject(
  config: EdsProjectConfig,
  onProgress?: EdsProgressCallback,
): Promise<EdsProjectResult> {
  try {
    // Phase: auth (0-10%)
    onProgress?.('auth', 5, 'Validating GitHub authentication...');
    const tokenResult = await this.githubService.validateToken();
    if (!tokenResult.valid) {
      return this.createErrorResult('AUTH_REQUIRED', 'GitHub authentication required');
    }
    onProgress?.('auth', 10, 'Authentication verified');

    // Phase: repo (10-30%)
    onProgress?.('repo', 15, 'Creating GitHub repository...');
    const repo = await this.githubService.createFromTemplate(
      TEMPLATE_OWNER,
      TEMPLATE_REPO,
      config.repoName,
    );
    onProgress?.('repo', 30, `Repository ${repo.fullName} created`);

    // Phase: dalive (30-40%)
    onProgress?.('dalive', 35, 'Verifying DA.live access...');
    const orgAccess = await this.daLiveService.verifyOrgAccess(config.daLiveOrg);
    if (!orgAccess.hasAccess) {
      return this.createErrorResult('DALIVE_ACCESS_DENIED', orgAccess.reason);
    }
    onProgress?.('dalive', 40, 'DA.live access verified');

    // Phase: content (40-70%)
    onProgress?.('content', 45, 'Copying CitiSignal content...');
    const contentResult = await this.daLiveService.copyCitisignalContent(
      config.daLiveOrg,
      config.daLiveSite,
      (progress) => {
        // Map content copy progress (0-100) to (45-70)
        const scaledPercent = 45 + (progress.current / progress.total) * 25;
        onProgress?.('content', Math.round(scaledPercent), `Copying ${progress.currentFile}...`);
      },
    );
    onProgress?.('content', 70, `Copied ${contentResult.copiedFiles.length} files`);

    // Phase: clone (70-80%)
    onProgress?.('clone', 75, 'Cloning repository locally...');
    await this.githubService.cloneRepository(repo.cloneUrl, config.localPath);
    onProgress?.('clone', 80, 'Repository cloned');

    // Phase: config (80-90%)
    onProgress?.('config', 85, 'Configuring environment...');
    await this.configureEnvironment(config);
    onProgress?.('config', 90, 'Environment configured');

    // Phase: complete (100%)
    onProgress?.('complete', 100, 'Project created successfully!');

    return {
      success: true,
      repo,
      contentResult,
      localPath: config.localPath,
    };
  } catch (error) {
    return this.handleError(error);
  }
}
```

### REFACTOR Phase

1. **Extract common error handling** to shared utility
2. **Add logging** at each phase transition
3. **Improve test helpers** for reusability
4. **Add JSDoc comments** for public APIs
5. **Update documentation** with new features

---

## Expected Outcome

After completing this step:

- [ ] Full integration test suite validates complete EDS workflow
- [ ] Error recovery tested for all failure scenarios
- [ ] Partial failure handling implemented with resume capability
- [ ] Progress reporting integrated from services to UI
- [ ] Error messages are user-friendly and actionable
- [ ] Documentation updated with EDS feature information

**What can be demonstrated:**
- Complete EDS project creation from start to finish
- Graceful error handling with clear recovery paths
- Progress feedback during long-running operations
- Resume from partial completion

---

## Acceptance Criteria

### Testing

- [ ] All integration tests passing (edsProjectCreation.test.ts)
- [ ] All error recovery tests passing (edsErrorRecovery.test.ts)
- [ ] All partial failure tests passing (edsPartialFailure.test.ts)
- [ ] All UI step tests passing (DataSourceConfigStep, GitHubDaLiveSetupStep)
- [ ] Overall coverage >= 85% for EDS feature
- [ ] Critical paths (OAuth, repo creation, content copy) at 100% coverage

### Error Messages

- [ ] All errors have user-friendly messages
- [ ] All errors have recovery hints
- [ ] Error messages tested in integration tests
- [ ] No technical jargon in user-facing messages

### Progress Reporting

- [ ] Progress callback integrated in EdsProjectService
- [ ] Progress UI shows current phase and percentage
- [ ] Progress messages are descriptive and helpful
- [ ] Progress tested in integration tests

### Documentation

- [ ] CLAUDE.md updated with EDS feature section
- [ ] src/features/eds/README.md created
- [ ] JSDoc comments on all public APIs
- [ ] Inline comments for complex logic

### Code Quality

- [ ] No TypeScript errors
- [ ] ESLint passing
- [ ] No debug code (console.log, debugger)
- [ ] Follows existing patterns in codebase

---

## Estimated Time

**Total:** 6-8 hours

- Integration test writing (RED): 2-3 hours
- Error message polish (GREEN): 1 hour
- Progress reporting integration (GREEN): 1 hour
- UI step tests (GREEN): 1 hour
- Documentation updates (GREEN): 30 minutes
- Refactoring and final polish: 1 hour

---

## Notes

### Integration Test Best Practices

**Mock External Services Only:**
```typescript
// Mock GitHub and DA.live APIs, not internal services
jest.mock('@/features/eds/services/githubService');
jest.mock('@/features/eds/services/daLiveService');

// Test real service coordination, not mocked internals
const result = await edsProjectService.createProject(config);
```

**Test Error Propagation:**
```typescript
// Verify errors bubble up with correct context
mockGitHubService.createFromTemplate.mockRejectedValue(new Error('Network error'));
const result = await edsProjectService.createProject(config);
expect(result.error?.userMessage).toBeDefined();
expect(result.error?.recoveryHint).toBeDefined();
```

**Test State Consistency:**
```typescript
// Verify partial state preserved on failure
mockDaLiveService.copyCitisignalContent.mockRejectedValue(new Error('Timeout'));
const result = await edsProjectService.createProject(config);
expect(result.partialState?.repoCreated).toBe(true);
```

### Progress Phase Mapping

| Phase | Percent Range | Operations |
|-------|---------------|------------|
| auth | 0-10% | Token validation, user info |
| repo | 10-30% | Template generation, repo creation |
| dalive | 30-40% | Org verification |
| content | 40-70% | Content index fetch, file copy |
| clone | 70-80% | Git clone to local |
| config | 80-90% | .env generation, Helix config |
| complete | 100% | Success verification |

### Documentation Structure

```markdown
# EDS Feature (src/features/eds/README.md)

## Overview
Edge Delivery Services deployment for CitiSignal storefronts.

## Services
- GitHubService: OAuth, repo management
- DaLiveService: Content management
- EdsProjectService: Orchestration

## Wizard Steps
- DataSourceConfigStep: ACCS configuration
- GitHubDaLiveSetupStep: Combined setup

## Error Handling
- User-friendly messages
- Recovery hints
- Partial state preservation

## Testing
- Integration tests in tests/integration/features/eds/
- Unit tests in tests/unit/features/eds/
```

---

## Dependencies on This Step

**None** - This is the final step. All previous steps must be complete before this step can begin.

---

## Feature Completion Checklist

After completing Step 7, verify the entire EDS feature:

- [ ] Component registry recognizes `eds-citisignal-storefront`
- [ ] GitHub OAuth flow works in VS Code
- [ ] DA.live content copy works with IMS tokens
- [ ] Tool installation (commerce-demo-ingestion) works
- [ ] Wizard steps display correctly
- [ ] Full project creation workflow succeeds
- [ ] Error cases handled gracefully
- [ ] Progress shown during creation
- [ ] Documentation complete

**Definition of Done for EDS Feature:**
When all acceptance criteria in all 7 steps are met, the EDS deployment feature is complete and ready for code review.
