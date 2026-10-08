import * as path from 'path';
import { forgetPreviousSignIn, runAdobeLogin, type AdobeSignInDeps } from './adobeSignIn';
import { withOrgContext, type OrgContextTarget } from './orgContextEnv';
import type { SavedState } from './orgServicesSavedCatalog';
import { getLogger } from '@/core/logging/debugLogger';
import { StepLogger } from '@/core/logging/stepLogger';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import {
    createEntityServices,
    type EntityServices,
} from '@/features/authentication/services/adobeEntityService';
import { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import { withTiming } from '@/features/authentication/services/performanceTracker';
import { createSignInGate } from '@/features/authentication/services/signInGate';
import { TokenManager } from '@/features/authentication/services/tokenManager';
import type { AdobeOrg, AdobeProject } from '@/features/authentication/services/types';
import { clearSharedCredentialCache } from '@/features/data-installer/services/commerceCredentialBroker';
import type { Logger } from '@/types/logger';

/**
 * The Adobe session: sign-in, sign-out and "am I signed in?", plus the wiring that
 * builds the units everything else calls.
 *
 * Callers take the unit that OWNS the job: `getEntityServices()` for org, project,
 * workspace, credential and API reads and writes; `getCacheManager()` for the cached
 * org/project and validation state; `getTokenManager()` for the token;
 * `getSdkClient()` for the Console SDK. Until 2026-10-08 this class also carried
 * thirty-six pass-through methods to those units; they were removed
 * (decompose-god-file) so a parameter added to an owner no longer has to be threaded
 * through here too. The sign-in itself lives in `adobeSignIn.ts`.
 */
export class AuthenticationService {
    private logger: Logger;
    private debugLogger = getLogger();
    private stepLogger: StepLogger | null = null;
    private stepLoggerInitPromise: Promise<StepLogger> | null = null;
    private templatesPath: string;
    private cacheManager: AuthCacheManager;
    private tokenManager: TokenManager;
    private organizationValidator: OrganizationValidator;
    private sdkClient: AdobeSDKClient;
    private entities: EntityServices | null = null;
    /** What one sign-in reads and clears (see adobeSignIn). */
    private readonly signInDeps: AdobeSignInDeps;
    /** Every sign-in goes through here: one at a time (see signInGate). */
    private readonly signIn: (force: boolean) => Promise<boolean>;

    constructor(
        extensionPath: string,
        logger: Logger,
        private commandManager: CommandExecutor,
        /** Keeps the org's API list and deleted workspace names across reloads (`context.globalState`). */
        private readonly savedState?: SavedState,
    ) {
        this.logger = logger;

        // Store templates path for lazy initialization
        this.templatesPath = path.join(
            extensionPath,
            'src',
            'core',
            'logging',
            'config',
            'logging.json',
        );

        // Initialize all submodules
        this.cacheManager = new AuthCacheManager();
        this.tokenManager = new TokenManager(this.cacheManager);
        this.sdkClient = new AdobeSDKClient(logger);
        this.organizationValidator = new OrganizationValidator(
            commandManager,
            logger,
            this.cacheManager,
        );
        // Note: entityService will be initialized lazily when first needed
        // because it depends on stepLogger which requires async initialization
        this.signInDeps = {
            commandManager,
            cacheManager: this.cacheManager,
            sdkClient: this.sdkClient,
            logger,
            debugLogger: this.debugLogger,
            stepLogger: () => this.ensureStepLogger(),
        };
        this.signIn = createSignInGate({
            run: (force) => runAdobeLogin(this.signInDeps, force),
            signedInNow: () => {
                this.cacheManager.clearTokenInspectionCache();
                return this.tokenManager.isTokenValid();
            },
            adoptSignIn: () => forgetPreviousSignIn(this.signInDeps),
            logger,
        });
    }

    /**
     * Lazy initialization of StepLogger with ConfigurationLoader
     * Uses promise caching to ensure only one initialization happens
     */
    private async ensureStepLogger(): Promise<StepLogger> {
        if (this.stepLogger) {
            return this.stepLogger;
        }

        // If already initializing, wait for that promise
        if (this.stepLoggerInitPromise) {
            return this.stepLoggerInitPromise;
        }

        // Start initialization
        this.stepLoggerInitPromise = StepLogger.create(
            this.logger,
            undefined,
            this.templatesPath,
        ).then((stepLogger) => {
            this.stepLogger = stepLogger;

            // Initialize entity services now that stepLogger is ready. Unguarded:
            // this `.then` runs once per service (the init promise is never
            // reset) and nothing else assigns `entities`, so a guard here could
            // never be false.
            this.entities = createEntityServices(
                this.commandManager,
                this.sdkClient,
                this.cacheManager,
                this.logger,
                stepLogger,
                // So a CLI 401 cannot be reported as an expired session while
                // this same manager says the token has hours left — the state
                // that had a user signing in three times to no effect.
                async () => (await this.tokenManager.inspectToken()).valid,
                this.savedState,
            );

            return stepLogger;
        });

        return this.stepLoggerInitPromise;
    }

    /**
     * The entity services — reads, credentials, orgServices, projectOps, resolver,
     * selector — built once the StepLogger they log through is ready. The way in for
     * every org/project/workspace/credential job: call the service that owns it.
     */
    async getEntityServices(): Promise<EntityServices> {
        await this.ensureStepLogger();
        if (!this.entities) {
            throw new Error('Entity services failed to initialize');
        }
        return this.entities;
    }

    /**
     * Get token status including expiry time
     * Returns whether authenticated and how many minutes until/since expiry
     *
     * @returns Object with isAuthenticated and expiresInMinutes (negative if expired)
     */
    async getTokenStatus(): Promise<{ isAuthenticated: boolean; expiresInMinutes: number }> {
        const inspection = await this.tokenManager.inspectToken();
        return {
            isAuthenticated: inspection.valid,
            expiresInMinutes: inspection.expiresIn,
        };
    }

    /**
     * Token-only authentication check - verifies token existence and expiry
     * Does NOT validate org access or call getCurrentOrganization()
     * Does NOT initialize SDK - SDK will be initialized on-demand when needed
     * Typical duration: 2-3 seconds (Adobe CLI config read overhead)
     *
     * Use this for dashboard loads and non-critical paths.
     */
    async isAuthenticated(): Promise<boolean> {
        return withTiming('isAuthenticated', async () => {
            // Check cache first
            const { isAuthenticated, isExpired } = this.cacheManager.getCachedAuthStatus();
            if (!isExpired && isAuthenticated !== undefined) {
                return isAuthenticated;
            }

            try {
                const isValid = await this.tokenManager.isTokenValid();
                this.cacheManager.setCachedAuthStatus(isValid);
                return isValid;
            } catch (error) {
                this.debugLogger.error('[Auth] Quick authentication check failed', error as Error);
                this.cacheManager.setCachedAuthStatus(false, CACHE_TTL.SHORT);
                return false;
            }
        });
    }

    /**
     * Login - opens browser and waits for completion. A request while a sign-in is
     * already running joins that one (one browser tab); see signInGate.
     */
    async login(force = false): Promise<boolean> {
        return this.signIn(force);
    }

    /**
     * Logout
     */
    async logout(): Promise<void> {
        try {
            await this.commandManager.execute('aio auth logout', { encoding: 'utf8' });

            // Clear all caches after logout
            this.cacheManager.clearAll(); // Includes token inspection cache
            this.sdkClient.clear();
            // The shared Commerce credential is cached per service URL, and it was
            // fetched under THIS user's authorization — the discovery service
            // validates their IMS token and checks their email domain. Whoever
            // signs in next must not inherit it.
            clearSharedCredentialCache();

            const stepLogger = await this.ensureStepLogger();
            stepLogger.logTemplate('adobe-auth', 'success', { item: 'Logout' });
        } catch (error) {
            this.debugLogger.error('[Auth] Logout failed', error as Error);
            throw error;
        }
    }

    /**
     * Get cache manager instance
     * The cached org/project, validation state and auth-status cache live here
     */
    getCacheManager(): AuthCacheManager {
        return this.cacheManager;
    }

    /**
     * Get token manager instance
     * Used for token inspection in handlers
     */
    getTokenManager(): TokenManager {
        return this.tokenManager;
    }

    /** The Console SDK client (`ensureInitialized` before a fast SDK read). */
    getSdkClient(): AdobeSDKClient {
        return this.sdkClient;
    }

    /**
     * Test if the current user has Developer or System Admin permissions
     * These permissions are required to create and manage App Builder projects
     */
    async testDeveloperPermissions(): Promise<{ hasPermissions: boolean; error?: string }> {
        // Target the probe at the token's reachable org so a stale ambient CLI
        // selection can't make the underlying `aio app list` check a DIFFERENT
        // org. Token org = the cached org (already the token org after auth) or,
        // on a cache miss, getOrganizationsSdkOnly()[0] — SDK-only so the quick
        // check never stalls on `aio console org list`. ID-only targeting is a
        // fine fallback (buildAioConsoleEnv tolerates the missing code/name).
        const org =
            this.cacheManager.getCachedOrganization() ??
            (await (await this.getEntityServices()).reads.getOrganizationsSdkOnly())?.[0];
        if (!org?.id) {
            return this.organizationValidator.testDeveloperPermissions();
        }
        const target: OrgContextTarget = { orgId: org.id, orgCode: org.code, orgName: org.name };
        return withOrgContext(target, () => this.organizationValidator.testDeveloperPermissions());
    }

    // --- Forwarders kept on purpose --------------------------------------------
    // Each is named by a STRUCTURAL interface this whole service is handed to that
    // also needs a member of another unit: the org guard's `OrgContextAuthManager`
    // (getOrganizations + loginAndRestoreProjectContext) and `OrgLister`, and
    // `OwnershipProjectSource` (getTokenManager + getProjects). Retiring these means
    // deciding what those interfaces become — a design question, not a move
    // (2026-10-08).

    /** The orgs the token reaches (`reads.getOrganizations`). */
    async getOrganizations(): Promise<AdobeOrg[]> {
        return (await this.getEntityServices()).reads.getOrganizations();
    }

    /** Projects, optionally org-targeted (`reads.getProjects`). */
    async getProjects(options?: { orgId?: string }): Promise<AdobeProject[]> {
        return (await this.getEntityServices()).reads.getProjects(options);
    }

    /**
     * Login and restore full Adobe project context (org/project/workspace).
     *
     * Canonical helper for inline authentication flows where we need to:
     * 1. Perform browser-based login
     * 2. Restore the user's project context after successful login
     *
     * Use this when a user action requires authentication and should continue
     * automatically after sign-in (e.g., Deploy Mesh, Apply Configuration).
     *
     * @param adobeContext - The Adobe context to restore after login
     * @param force - When true, perform a FORCED sign-in (`aio auth login -f`)
     *   so the browser presents the IMS account/org chooser. Required for org
     *   switching: IMS tokens are org-bound, and a non-forced login silently
     *   reuses the browser's existing SSO session — which can loop back to the
     *   wrong org if another tab is signed into it. Defaults to false (session
     *   restore / re-auth, which should keep the current account).
     * @returns true if login and context restoration succeeded, false otherwise
     *
     * @example
     * ```typescript
     * const success = await authManager.loginAndRestoreProjectContext({
     *     organization: project.adobe?.organization,
     *     projectId: project.adobe?.projectId,
     *     workspace: project.adobe?.workspace,
     * });
     * if (success) {
     *     // Continue with authenticated operation
     * }
     * ```
     */
    async loginAndRestoreProjectContext(
        adobeContext: {
            organization?: string;
            projectId?: string;
            workspace?: string;
        },
        force = false,
    ): Promise<boolean> {
        return withTiming('loginAndRestoreProjectContext', async () => {
            const debugLogger = getLogger();

            try {
                debugLogger.debug(`[Auth] Starting login and context restoration (force=${force})`);
                const loginSuccess = await this.login(force);
                if (!loginSuccess) {
                    debugLogger.warn('[Auth] Login failed or was cancelled');
                    return false;
                }

                // Phase 4a: do NOT re-pin org/project/workspace via select* (which
                // mutates the shared `aio` global and races concurrent processes).
                // Each downstream `aio` operation targets the known context per
                // invocation via `withOrgContext` using `adobeContext`. The login
                // itself is all this method needs to perform.
                debugLogger.debug(
                    `[Auth] Login complete; context (${adobeContext.organization ?? '-'}/` +
                        `${adobeContext.projectId ?? '-'}/${adobeContext.workspace ?? '-'}) ` +
                        'will be targeted per-op via env, not pinned to the global',
                );
                return true;
            } catch (error) {
                debugLogger.error('[Auth] Login and context restoration failed', error as Error);
                return false;
            }
        });
    }
}