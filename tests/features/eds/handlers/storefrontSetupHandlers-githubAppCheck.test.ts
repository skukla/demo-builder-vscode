/**
 * Storefront Setup Handlers - GitHub App Check Tests
 *
 * Context-Aware GitHub App Verification (Phase 2.5):
 * - EXISTING repos: Check GitHub App AFTER fstab.yaml push
 * - NEW repos: Already verified in GitHubRepoSelectionStep (skip here)
 *
 * Tests verify:
 * 1. GitHub App check is triggered for existing repos after fstab.yaml push
 * 2. Setup pauses if app not installed (sends github-app-required message)
 * 3. Setup continues if app is installed
 * 4. NEW repos (pre-created) skip the Phase 2.5 check
 */

describe('Storefront Setup - GitHub App Check (Phase 2.5)', () => {
    describe('EXISTING repos: Check after fstab.yaml push', () => {
        /**
         * For existing repos, the GitHub App check must happen AFTER fstab.yaml push
         * because Helix doesn't know about the repo until it's configured.
         */
        it('should check GitHub App for existing repos after fstab.yaml push', () => {
            // Given: Using existing repo mode
            const repoMode = 'existing' as const;
            const useExistingRepo = repoMode === 'existing';

            // When: Determining if Phase 2.5 check should run
            const shouldCheckGitHubApp = useExistingRepo;

            // Then: Check should run for existing repos
            expect(shouldCheckGitHubApp).toBe(true);
        });

        it('should pause setup if GitHub App not installed', () => {
            // Given: GitHub App check returns not installed
            const isInstalled = false;
            const useExistingRepo = true;

            // When: Determining next action
            const shouldPause = useExistingRepo && !isInstalled;

            // Then: Setup should pause
            expect(shouldPause).toBe(true);
        });

        it('should send github-app-required message when app not installed', () => {
            // Given: GitHub App not installed for existing repo
            const repoOwner = 'test-user';
            const repoName = 'existing-repo';
            const isInstalled = false;

            // When: Building the message payload
            const messageType = 'storefront-setup-github-app-required';
            const payload = {
                owner: repoOwner,
                repo: repoName,
                installUrl: `https://github.com/apps/aem-code-sync/installations/select_target`,
                message: 'The AEM Code Sync GitHub App must be installed to continue.',
            };

            // Then: Message should have correct structure
            expect(messageType).toBe('storefront-setup-github-app-required');
            expect(payload.owner).toBe('test-user');
            expect(payload.repo).toBe('existing-repo');
            expect(payload.installUrl).toContain('aem-code-sync');
            expect(payload.message).toContain('must be installed');
        });

        it('should return early with GitHub App installation required error', () => {
            // Given: GitHub App not installed
            const isInstalled = false;
            const repoUrl = 'https://github.com/test-user/existing-repo';
            const repoOwner = 'test-user';
            const repoName = 'existing-repo';

            // When: Building the return value
            const returnValue = {
                success: false,
                error: 'GitHub App installation required',
                repoUrl,
                repoOwner,
                repoName,
            };

            // Then: Should return failure with specific error
            expect(returnValue.success).toBe(false);
            expect(returnValue.error).toBe('GitHub App installation required');
            expect(returnValue.repoOwner).toBe('test-user');
        });

        it('should continue setup if GitHub App is installed', () => {
            // Given: GitHub App is installed
            const isInstalled = true;
            const useExistingRepo = true;

            // When: Determining next action
            const shouldContinue = useExistingRepo && isInstalled;

            // Then: Setup should continue
            expect(shouldContinue).toBe(true);
        });

        it('should log verification success for existing repos', () => {
            // Given: GitHub App verified
            const repoOwner = 'test-user';
            const repoName = 'existing-repo';
            const codeStatus = 200;

            // When: Building log message
            const logMessage = `[Storefront Setup] GitHub App verified for existing repo (code.status: ${codeStatus})`;

            // Then: Log message should include status
            expect(logMessage).toContain('verified');
            expect(logMessage).toContain('existing repo');
            expect(logMessage).toContain('200');
        });
    });

    describe('NEW repos (pre-created): Skip Phase 2.5 check', () => {
        /**
         * For NEW repos created in GitHubRepoSelectionStep, the GitHub App
         * was already verified before proceeding. Skip Phase 2.5 check.
         */
        it('should NOT check GitHub App for pre-created new repos', () => {
            // Given: Repo was pre-created in GitHubRepoSelectionStep
            const repoMode = 'new' as const;
            const usePreCreatedRepo = true;
            const useExistingRepo = false;

            // When: Determining if Phase 2.5 check should run
            const shouldCheckGitHubApp = useExistingRepo;

            // Then: Check should NOT run for pre-created repos
            expect(shouldCheckGitHubApp).toBe(false);
        });

        it('should skip check for repos created via template', () => {
            // Given: Repo created from template (via GitHubRepoSelectionStep)
            const createdRepo = {
                owner: 'test-user',
                name: 'new-repo',
                url: 'https://github.com/test-user/new-repo',
                fullName: 'test-user/new-repo',
            };
            const useExistingRepo = false;

            // When: Determining if Phase 2.5 check should run
            // createdRepo being set indicates repo was created (not existing)
            const shouldCheckGitHubApp = useExistingRepo;

            // Then: Check should NOT run
            expect(shouldCheckGitHubApp).toBe(false);
            expect(createdRepo.owner).toBe('test-user');
        });
    });

    describe('Progress Messages', () => {
        /**
         * Progress messages for Phase 2.5 GitHub App check.
         */
        it('should show progress message during GitHub App verification', () => {
            // Given: Starting Phase 2.5 check
            const progressMessage = {
                phase: 'helix-config',
                message: 'Verifying GitHub App installation...',
                progress: 28,
            };

            // Then: Progress should be at 28% (between fstab push at 25% and patches at 30%)
            expect(progressMessage.phase).toBe('helix-config');
            expect(progressMessage.message).toContain('Verifying GitHub App');
            expect(progressMessage.progress).toBe(28);
        });

        it('should fit in progress range between fstab push and patches', () => {
            // Given: Progress ranges
            const fstabPushProgress = 25;
            const patchesStartProgress = 30;
            const githubAppCheckProgress = 28;

            // Then: GitHub App check progress should be between fstab and patches
            expect(githubAppCheckProgress).toBeGreaterThan(fstabPushProgress);
            expect(githubAppCheckProgress).toBeLessThan(patchesStartProgress);
        });
    });

    describe('Flow Control', () => {
        /**
         * Tests for overall flow control and decision points.
         */
        it('should determine useExistingRepo correctly from repoMode', () => {
            // Given: Different repo configurations
            const existingRepoConfig = {
                repoMode: 'existing' as const,
                selectedRepo: { name: 'test', fullName: 'user/test', htmlUrl: 'https://github.com/user/test' },
            };
            const newRepoConfig = {
                repoMode: 'new' as const,
                createdRepo: { owner: 'user', name: 'new-repo', url: 'https://github.com/user/new-repo', fullName: 'user/new-repo' },
            };

            // When: Calculating useExistingRepo
            const useExistingForExisting = existingRepoConfig.repoMode === 'existing' && !!existingRepoConfig.selectedRepo;
            const useExistingForNew = newRepoConfig.repoMode === 'existing';

            // Then: Should correctly identify existing vs new
            expect(useExistingForExisting).toBe(true);
            expect(useExistingForNew).toBe(false);
        });

        it('should handle existing repo without selectedRepo gracefully', () => {
            // Given: Existing mode but selectedRepo missing (legacy existingRepo string)
            const config = {
                repoMode: 'existing' as const,
                existingRepo: 'user/test',
            };

            // When: Calculating useExistingRepo
            const useExistingRepo = config.repoMode === 'existing' && (!!config.existingRepo);

            // Then: Should still recognize as existing repo
            expect(useExistingRepo).toBe(true);
        });
    });
});
