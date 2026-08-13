/**
 * RepoSelectionInline - GitHub App Check Integration Tests
 *
 * Context-Aware GitHub App Verification (logic lives in
 * repoSelectionInline.helpers, surfaced via RepoSelectionInline's
 * onRepoValidChange / onCodeSyncValidChange verdicts):
 * - NEW repos: Check early in RepoSelectionInline (template is pre-configured)
 * - EXISTING repos: NO check here - deferred to StorefrontSetup after fstab.yaml push
 *
 * Tests verify:
 * 1. GitHub App check is SKIPPED for existing repos at this step
 * 2. GitHub App check triggers for NEW repos AFTER creation
 * 3. canProceed logic differs by repo mode
 * 4. GitHubAppStatus interface shape
 * 5. Status display text (only for NEW repos)
 */

import {
    computeRepoValid,
    computeCodeSyncValid,
    shouldShowAppStatus,
} from '@/features/eds/ui/steps/repoSelectionInline.helpers';
import { isValidRepositoryName } from '@/core/validation/normalizers';
import type { GitHubRepoItem } from '@/types/webview';

// Define the GitHubAppStatus interface (same as in component)
interface GitHubAppStatus {
    isChecking: boolean;
    isInstalled: boolean | null; // null = not checked yet
    /** The actual code.status from the Helix admin endpoint (200, 400, 404, etc.) */
    codeStatus?: number;
    error?: string;
    installUrl?: string;
}

const repo = { id: 'r1', name: 'my-repo', fullName: 'me/my-repo' } as unknown as GitHubRepoItem;

describe('computeRepoValid (repo choice, no app gate)', () => {
    describe('new repos', () => {
        it('is valid when created and not mid-creation', () => {
            expect(
                computeRepoValid('new', { isCreated: true, isCreating: false }, undefined, false)
            ).toBe(true);
        });

        it('is invalid before creation', () => {
            expect(
                computeRepoValid('new', { isCreated: false, isCreating: false }, undefined, false)
            ).toBe(false);
        });

        it('is invalid while still creating', () => {
            expect(
                computeRepoValid('new', { isCreated: true, isCreating: true }, undefined, false)
            ).toBe(false);
        });
    });

    describe('existing repos', () => {
        it('is valid when a repo is selected and not loading', () => {
            expect(
                computeRepoValid('existing', { isCreated: false, isCreating: false }, repo, false)
            ).toBe(true);
        });

        it('is invalid when no repo is selected', () => {
            expect(
                computeRepoValid(
                    'existing',
                    { isCreated: false, isCreating: false },
                    undefined,
                    false
                )
            ).toBe(false);
        });

        it('is invalid while loading', () => {
            expect(
                computeRepoValid('existing', { isCreated: false, isCreating: false }, repo, true)
            ).toBe(false);
        });
    });
});

describe('computeCodeSyncValid (app gate)', () => {
    describe('new repos', () => {
        it('is valid when the app is installed and not mid-check', () => {
            expect(
                computeCodeSyncValid('new', { isChecking: false, isInstalled: true }, undefined)
            ).toBe(true);
        });

        it('is invalid when the app is not installed', () => {
            expect(
                computeCodeSyncValid('new', { isChecking: false, isInstalled: false }, undefined)
            ).toBe(false);
        });

        it('is invalid while still checking', () => {
            expect(
                computeCodeSyncValid('new', { isChecking: true, isInstalled: null }, undefined)
            ).toBe(false);
        });
    });

    describe('existing repos', () => {
        it('is valid once a repo is SELECTED (no app gate, but follows Repository)', () => {
            expect(
                computeCodeSyncValid('existing', { isChecking: false, isInstalled: null }, repo)
            ).toBe(true);
        });

        it('is invalid before a repo is selected (must not pass before Repository)', () => {
            expect(
                computeCodeSyncValid(
                    'existing',
                    { isChecking: false, isInstalled: null },
                    undefined
                )
            ).toBe(false);
        });
    });
});

describe('RepoSelectionInline - GitHub App Check', () => {
    describe('Context-Aware Check Trigger Logic', () => {
        /**
         * Context-aware GitHub App checking:
         * - NEW repos: Check AFTER repo is created (template is pre-configured, Helix knows it)
         * - EXISTING repos: NO check here - Helix doesn't know about repo until fstab.yaml is pushed
         */
        it('should NOT trigger check for existing repo selection (deferred to StorefrontSetup)', () => {
            // Given: User selects an existing repository
            const repoMode = 'existing' as const;
            const _selectedRepo = { name: 'test-repo', fullName: 'test-user/test-repo' };

            // When: Evaluating check conditions at GitHubRepoSelectionStep
            // EXISTING repos: Check deferred to StorefrontSetup (after fstab.yaml push)
            const shouldCheckAtThisStep = repoMode !== 'existing';

            // Then: Check should NOT be triggered at this step
            expect(shouldCheckAtThisStep).toBe(false);
        });

        it('should trigger check for NEW repos AFTER creation', () => {
            // Given: User creates a new repository
            const repoMode = 'new' as const;
            const repoCreationState = { isCreated: true, isCreating: false };
            const createdRepo = {
                owner: 'test-user',
                name: 'new-repo',
                fullName: 'test-user/new-repo',
            };

            // When: Evaluating check conditions
            const shouldCheckAtThisStep =
                repoMode === 'new' && repoCreationState.isCreated && !!createdRepo;

            // Then: Check should be triggered for new repos after creation
            expect(shouldCheckAtThisStep).toBe(true);
        });

        it('should NOT trigger check for NEW repos BEFORE creation', () => {
            // Given: User is entering a repo name but hasn't clicked Create yet
            const repoMode = 'new' as const;
            const repoCreationState = { isCreated: false, isCreating: false };
            const createdRepo = undefined;

            // When: Evaluating check conditions
            const shouldCheckAtThisStep =
                repoMode === 'new' && repoCreationState.isCreated && !!createdRepo;

            // Then: Check should NOT be triggered until repo is created
            expect(shouldCheckAtThisStep).toBe(false);
        });

        it('should NOT trigger check when no GitHub user', () => {
            // Given: No GitHub user authenticated
            const _repoMode = 'existing' as const;
            const _selectedRepo = { name: 'test-repo', fullName: 'test-user/test-repo' };
            // `let` without an initializer: a const initialized to undefined is
            // NARROWED to undefined, and ?.login on that checks against never.
            let githubUser: { login: string } | undefined;

            // When: Evaluating check conditions
            const owner = githubUser?.login;
            const shouldCheck = !!owner;

            // Then: Check should NOT be triggered
            expect(shouldCheck).toBe(false);
        });
    });

    describe('canProceed Logic (Mode-Dependent)', () => {
        /**
         * canProceed logic differs by repo mode:
         * - NEW repos: require repo created AND app verified
         * - EXISTING repos: only require repo selection (app check deferred)
         */
        describe('EXISTING repos: Only require selection', () => {
            it('should allow proceeding when repo is selected (no app check required)', () => {
                // Given: User selected an existing repo
                const _repoMode = 'existing' as const;
                const selectedRepo = { name: 'test-repo', fullName: 'test-user/test-repo' };
                const isLoading = false;

                // When: Calculating canProceed for existing repos
                // App check is deferred to StorefrontSetup - NOT required here
                const isExistingValid = !!selectedRepo;
                const canProceed = isExistingValid && !isLoading;

                // Then: canProceed should be true (no app verification needed)
                expect(canProceed).toBe(true);
            });

            it('should NOT allow proceeding when no repo selected', () => {
                // Given: No repo selected
                const _repoMode = 'existing' as const;
                const selectedRepo = undefined;
                const isLoading = false;

                // When: Calculating canProceed
                const isExistingValid = !!selectedRepo;
                const canProceed = isExistingValid && !isLoading;

                // Then: canProceed should be false
                expect(canProceed).toBe(false);
            });

            it('should NOT allow proceeding while repos are loading', () => {
                // Given: Repos are being loaded
                const _repoMode = 'existing' as const;
                const selectedRepo = { name: 'test-repo', fullName: 'test-user/test-repo' };
                const isLoading = true;

                // When: Calculating canProceed
                const isExistingValid = !!selectedRepo;
                const canProceed = isExistingValid && !isLoading;

                // Then: canProceed should be false (still loading)
                expect(canProceed).toBe(false);
            });
        });

        describe('NEW repos: Require creation AND app verification', () => {
            it('should NOT allow proceeding when GitHub App is not installed', () => {
                // Given: GitHub App check returns isInstalled: false
                const _repoMode = 'new' as const;
                const repoCreationState = { isCreated: true, isCreating: false };
                const githubAppStatus: GitHubAppStatus = {
                    isChecking: false,
                    isInstalled: false,
                };

                // When: Calculating canProceed for new repos
                const isRepoCreated = repoCreationState.isCreated;
                const appVerified = githubAppStatus.isInstalled === true;
                const canProceed = isRepoCreated && appVerified;

                // Then: canProceed should be false
                expect(canProceed).toBe(false);
            });

            it('should allow proceeding when repo created AND app verified', () => {
                // Given: Repo created and GitHub App is installed
                const _repoMode = 'new' as const;
                const repoCreationState = { isCreated: true, isCreating: false };
                const githubAppStatus: GitHubAppStatus = {
                    isChecking: false,
                    isInstalled: true,
                };

                // When: Calculating canProceed for new repos
                const isRepoCreated = repoCreationState.isCreated;
                const appVerified = githubAppStatus.isInstalled === true;
                const isCreatingRepo = repoCreationState.isCreating;
                const isCheckingApp = githubAppStatus.isChecking;
                const canProceed =
                    isRepoCreated && appVerified && !isCheckingApp && !isCreatingRepo;

                // Then: canProceed should be true
                expect(canProceed).toBe(true);
            });

            it('should NOT allow proceeding while GitHub App check is in progress', () => {
                // Given: GitHub App check is in progress
                const _repoMode = 'new' as const;
                const repoCreationState = { isCreated: true, isCreating: false };
                const githubAppStatus: GitHubAppStatus = {
                    isChecking: true,
                    isInstalled: null, // null = not checked yet
                };

                // When: Calculating canProceed
                const isRepoCreated = repoCreationState.isCreated;
                const appVerified = githubAppStatus.isInstalled === true;
                const isCheckingApp = githubAppStatus.isChecking;
                const canProceed = isRepoCreated && appVerified && !isCheckingApp;

                // Then: canProceed should be false
                expect(canProceed).toBe(false);
            });

            it('should NOT allow proceeding when repo not yet created', () => {
                // Given: Repo not created yet
                const _repoMode = 'new' as const;
                const repoCreationState = { isCreated: false, isCreating: false };
                const githubAppStatus: GitHubAppStatus = {
                    isChecking: false,
                    isInstalled: true,
                };

                // When: Calculating canProceed
                const isRepoCreated = repoCreationState.isCreated;
                const appVerified = githubAppStatus.isInstalled === true;
                const canProceed = isRepoCreated && appVerified;

                // Then: canProceed should be false
                expect(canProceed).toBe(false);
            });
        });
    });

    describe('Install Modal Visibility (NEW repos only)', () => {
        /**
         * Modal visibility logic for NEW repos only.
         * EXISTING repos: No modal at this step - check deferred to StorefrontSetup.
         */
        it('should show install modal for NEW repos when app not installed', () => {
            // Given: New repo created but app not installed
            const repoMode = 'new' as const;
            const repoCreationState = { isCreated: true, isCreating: false };
            const createdRepo = {
                owner: 'test-user',
                name: 'new-repo',
                fullName: 'test-user/new-repo',
            };
            const githubAppStatus: GitHubAppStatus = {
                isChecking: false,
                isInstalled: false,
                installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
            };
            const isModalDismissed = false;

            // When: Determining if modal should show
            const isNewWithCreatedRepo =
                repoMode === 'new' && repoCreationState.isCreated && !!createdRepo;
            const shouldShowModal =
                isNewWithCreatedRepo && githubAppStatus.isInstalled === false && !isModalDismissed;

            // Then: Should show install modal
            expect(shouldShowModal).toBe(true);
        });

        it('should NOT show modal for EXISTING repos (check deferred to StorefrontSetup)', () => {
            // Given: User selects an existing repo
            const repoMode = 'existing' as const;
            const _selectedRepo = { name: 'test-repo', fullName: 'test-user/test-repo' };
            const _githubAppStatus: GitHubAppStatus = {
                isChecking: false,
                isInstalled: null, // Not checked - check deferred
            };

            // When: Determining if modal should show
            // For existing repos, the modal logic returns early (no modal)
            const isNewWithCreatedRepo = repoMode === 'new'; // false for existing
            const shouldShowModal = isNewWithCreatedRepo;

            // Then: Should NOT show modal
            expect(shouldShowModal).toBe(false);
        });

        it('should NOT show modal when app is installed', () => {
            // Given: New repo with app installed
            const repoMode = 'new' as const;
            const repoCreationState = { isCreated: true, isCreating: false };
            const createdRepo = {
                owner: 'test-user',
                name: 'new-repo',
                fullName: 'test-user/new-repo',
            };
            const githubAppStatus: GitHubAppStatus = {
                isChecking: false,
                isInstalled: true,
            };

            // When: Determining what to show
            const isNewWithCreatedRepo =
                repoMode === 'new' && repoCreationState.isCreated && !!createdRepo;
            const shouldShowModal = isNewWithCreatedRepo && githubAppStatus.isInstalled === false;

            // Then: Should NOT show modal
            expect(shouldShowModal).toBe(false);
        });

        it('should NOT show modal when user dismissed it', () => {
            // Given: User dismissed the modal
            const repoMode = 'new' as const;
            const repoCreationState = { isCreated: true, isCreating: false };
            const createdRepo = {
                owner: 'test-user',
                name: 'new-repo',
                fullName: 'test-user/new-repo',
            };
            const githubAppStatus: GitHubAppStatus = {
                isChecking: false,
                isInstalled: false,
            };
            const isModalDismissed = true;

            // When: Determining if modal should show
            const isNewWithCreatedRepo =
                repoMode === 'new' && repoCreationState.isCreated && !!createdRepo;
            const shouldShowModal =
                isNewWithCreatedRepo && githubAppStatus.isInstalled === false && !isModalDismissed;

            // Then: Should NOT show modal (user dismissed)
            expect(shouldShowModal).toBe(false);
        });
    });

    describe('Requirement 4: GitHubAppStatus state type', () => {
        it('should have correct shape for GitHubAppStatus interface', () => {
            // Verify a valid status object matches the interface
            const validStatus: GitHubAppStatus = {
                isChecking: false,
                isInstalled: true,
            };

            expect(validStatus.isChecking).toBe(false);
            expect(validStatus.isInstalled).toBe(true);
            expect(validStatus.error).toBeUndefined();
        });

        it('should support null isInstalled value for initial state', () => {
            const initialStatus: GitHubAppStatus = {
                isChecking: false,
                isInstalled: null,
            };

            expect(initialStatus.isInstalled).toBeNull();
        });

        it('should support error and installUrl optional fields', () => {
            const errorStatus: GitHubAppStatus = {
                isChecking: false,
                isInstalled: false,
                error: 'Network error',
                installUrl: 'https://github.com/apps/aem-code-sync/installations/new',
            };

            expect(errorStatus.error).toBe('Network error');
            expect(errorStatus.installUrl).toBe(
                'https://github.com/apps/aem-code-sync/installations/new'
            );
        });
    });

    describe('Configuration Summary Status Display (NEW repos only)', () => {
        /**
         * Status display tests - only applies to NEW repos.
         * EXISTING repos: No status display at this step.
         */

        // Helper function matching component implementation
        const getGitHubAppStatusText = (status: GitHubAppStatus): string => {
            if (status.isInstalled === null) return 'Not checked';
            if (status.isInstalled) return 'Verified';
            // Distinguish HTTP 404 (repo not indexed) from code.status 404 (app not installed)
            return status.codeStatus === undefined ? 'Registering...' : 'Not installed';
        };

        const getGitHubAppStatusIndicator = (
            status: GitHubAppStatus
        ): 'completed' | 'empty' | 'pending' | 'error' => {
            if (status.isChecking) return 'pending';
            if (status.isInstalled === true) return 'completed';
            // HTTP 404 (codeStatus undefined) = repo being registered by Helix, show pending
            // code.status 404 (codeStatus defined) = app not installed, show error
            if (status.isInstalled === false && status.codeStatus === undefined) return 'pending';
            if (status.isInstalled === false) return 'error';
            return 'empty'; // Only for null (not checked yet)
        };

        it('should only show status for NEW repos after creation', () => {
            // Given: Different repo modes
            const existingRepoMode = 'existing' as const;
            const newRepoMode = 'new' as const;
            const repoCreationState = { isCreated: true, isCreating: false };

            // When: Determining if status should show
            const showStatusForExisting = existingRepoMode === 'new' && repoCreationState.isCreated;
            const showStatusForNew = newRepoMode === 'new' && repoCreationState.isCreated;

            // Then: Only show for new repos after creation
            expect(showStatusForExisting).toBe(false);
            expect(showStatusForNew).toBe(true);
        });

        it('should display "Verified" status when GitHub App is installed', () => {
            const status: GitHubAppStatus = {
                isChecking: false,
                isInstalled: true,
            };

            expect(getGitHubAppStatusText(status)).toBe('Verified');
            expect(getGitHubAppStatusIndicator(status)).toBe('completed');
        });

        it('should display "Registering..." when HTTP 404 (repo not indexed)', () => {
            // HTTP 404 = Helix doesn't know about repo yet
            const status: GitHubAppStatus = {
                isChecking: false,
                isInstalled: false,
                codeStatus: undefined, // HTTP 404 = codeStatus undefined
            };

            expect(getGitHubAppStatusText(status)).toBe('Registering...');
            expect(getGitHubAppStatusIndicator(status)).toBe('pending');
        });

        it('should display "Not installed" when code.status 404 (app missing)', () => {
            // code.status 404 in response body = app not installed
            const status: GitHubAppStatus = {
                isChecking: false,
                isInstalled: false,
                codeStatus: 404, // code.status in response body
            };

            expect(getGitHubAppStatusText(status)).toBe('Not installed');
            expect(getGitHubAppStatusIndicator(status)).toBe('error');
        });

        it('should display "Not checked" for initial state', () => {
            const status: GitHubAppStatus = {
                isChecking: false,
                isInstalled: null,
            };

            expect(getGitHubAppStatusText(status)).toBe('Not checked');
            expect(getGitHubAppStatusIndicator(status)).toBe('empty');
        });
    });

    describe('Utility: Repository name validation', () => {
        // These tests use the existing isValidRepositoryName helper
        it('should validate correct repository names', () => {
            expect(isValidRepositoryName('test-repo')).toBe(true);
            expect(isValidRepositoryName('my-project-123')).toBe(true);
            expect(isValidRepositoryName('eds-storefront')).toBe(true);
        });

        it('should reject invalid repository names', () => {
            expect(isValidRepositoryName('')).toBe(false);
            expect(isValidRepositoryName('repo with spaces')).toBe(false);
            expect(isValidRepositoryName('.hidden-repo')).toBe(false);
        });
    });
});

/**
 * Restoring the selection-time Code Sync check for EXISTING repos (2026-08-06).
 *
 * The new-repo path has always gated Continue on the App being installed. The
 * existing-repo path returned `!!selectedRepo` and gated on nothing, so the only
 * check was mid-pipeline — at storefrontSetupPhase2, AFTER the fstab push, block
 * collection, smart-404 and quick-edit had already written to the user's repo.
 *
 * That deferral (3b178875) was a workaround for a classifier that read "Helix
 * doesn't know this repo" as "App not installed". The classifier was fixed in
 * 89ef6fba (shipped beta.122); the deferral outlived its reason.
 *
 * The rule blocks only on a DEFINITIVE answer. AEM cannot distinguish
 * repo-does-not-exist from not-a-Helix-site from App-not-installed — all three
 * return the same 404 — so blocking on "we could not tell" would strand exactly the
 * users whose credential AEM refuses, which is the bug class that started this.
 */
describe('computeCodeSyncValid — existing repos (2026-08-06)', () => {
    const repo = { fullName: 'o/r' } as never;

    it('blocks when Helix definitively reports the App missing', () => {
        expect(
            computeCodeSyncValid(
                'existing',
                { isChecking: false, isInstalled: false, codeStatus: 404 },
                repo
            )
        ).toBe(false);
    });

    it('allows once the App is verified', () => {
        expect(
            computeCodeSyncValid(
                'existing',
                { isChecking: false, isInstalled: true, codeStatus: 200 },
                repo
            )
        ).toBe(true);
    });

    it('blocks while the check is still running', () => {
        expect(
            computeCodeSyncValid('existing', { isChecking: true, isInstalled: null }, repo)
        ).toBe(false);
    });

    it('ALLOWS an undetermined answer rather than stranding the user', () => {
        // No codeStatus = Helix refused the credential or does not know the site.
        // Not the same as "App missing", and no install fixes it.
        expect(
            computeCodeSyncValid('existing', { isChecking: false, isInstalled: false }, repo)
        ).toBe(true);
    });

    it('still requires a repo to be selected at all', () => {
        expect(
            computeCodeSyncValid('existing', { isChecking: false, isInstalled: true }, undefined)
        ).toBe(false);
    });

    it('leaves the new-repo rule untouched', () => {
        expect(
            computeCodeSyncValid('new', { isChecking: false, isInstalled: true }, undefined)
        ).toBe(true);
        expect(
            computeCodeSyncValid('new', { isChecking: false, isInstalled: false }, undefined)
        ).toBe(false);
    });
});

describe('shouldShowAppStatus (the row that explains a block)', () => {
    it('shows for an existing repo as soon as one is selected', () => {
        expect(shouldShowAppStatus('existing', false, true)).toBe(true);
    });

    it('hides for existing until a repo is picked — there is nothing to report yet', () => {
        expect(shouldShowAppStatus('existing', false, false)).toBe(false);
    });

    it('shows for a new repo only once it has been created', () => {
        expect(shouldShowAppStatus('new', true, false)).toBe(true);
        expect(shouldShowAppStatus('new', false, true)).toBe(false);
    });
});
