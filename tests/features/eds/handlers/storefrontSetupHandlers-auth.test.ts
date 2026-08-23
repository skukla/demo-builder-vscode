/**
 * Storefront Setup Handlers - Pre-flight Auth Tests
 *
 * Tests for pre-flight authentication checks in handleStartStorefrontSetup:
 * - No authManager -> error returned (existing behavior preserved)
 * - Expired Adobe I/O -> sign-in prompt -> successful re-auth -> proceeds
 * - Expired Adobe I/O -> user cancels -> error returned with 'cancelled' message
 * - Expired Adobe I/O -> sign-in fails -> error returned
 * - Expired DA.live -> sign-in prompt -> successful re-auth -> proceeds
 * - Expired DA.live -> user cancels -> error returned
 * - Expired DA.live -> sign-in fails -> error returned
 * - Both tokens valid -> proceeds normally (regression)
 *
 * Step 5a: Add pre-flight auth checks using shared guards.
 */

import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks - defined before imports
// =============================================================================

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn(),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    // The message is a pure constant — take the REAL one so the assertion cannot
    // pass against a stub whose text has drifted from what users see.
    BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE: jest.requireActual(
        '@/features/eds/handlers/edsHelpers'
    ).BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE,
    ensureDaLiveAuth: jest.fn(),
    configureDaLivePermissions: jest.fn(),
    getDaLiveAuthService: jest
        .fn()
        .mockReturnValue({ getAccessToken: jest.fn().mockResolvedValue('mock-token') }),
    resolveByomOverlayConfig: jest.fn(
        (fromConfigUrl: string | undefined, org: string, site: string) =>
            fromConfigUrl ? `${fromConfigUrl}?org=${org}&site=${site}&key=test-secret` : undefined
    ),
    // Reads `demoBuilder.byom.enabled`, and this suite mocks `vscode` without a
    // `workspace`. Stubbed rather than real: the handler only forwards the string,
    // and which of the two absent-overlay sentences comes back is covered where
    // the real function lives.
    explainAbsentOverlay: jest.fn(() => 'BYOM overlay is not configured.'),
}));

jest.mock('@/features/eds/handlers/storefrontSetupPhases', () => ({
    executeStorefrontSetupPhases: jest.fn(),
}));

jest.mock(
    'vscode',
    () => ({
        window: {
            showWarningMessage: jest.fn(),
            showInformationMessage: jest.fn(),
            showErrorMessage: jest.fn(),
        },
    }),
    { virtual: true }
);

// Mock remaining imports
jest.mock('@/features/eds/services/cleanupService');
jest.mock('@/features/eds/services/configurationService');
jest.mock('@/features/eds/services/daLiveAuthService');
jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    createDaLiveTokenProvider: jest.fn(),
}));
jest.mock('@/features/eds/services/daLiveOrgOperations');
jest.mock('@/features/eds/services/githubRepoOperations');
jest.mock('@/features/eds/services/githubTokenService');
jest.mock('@/features/eds/services/toolManager');

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
    handleStartStorefrontSetup,
    type StorefrontSetupStartPayload,
} from '@/features/eds/handlers/storefrontSetupHandlers';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import {
    BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE,
    ensureDaLiveAuth,
} from '@/features/eds/handlers/edsHelpers';
import { executeStorefrontSetupPhases } from '@/features/eds/handlers/storefrontSetupPhases';

// Get mock references
const mockEnsureAdobeIOAuth = ensureAdobeIOAuth as jest.MockedFunction<typeof ensureAdobeIOAuth>;
const mockEnsureDaLiveAuth = ensureDaLiveAuth as jest.MockedFunction<typeof ensureDaLiveAuth>;
const mockExecuteStorefrontSetupPhases = executeStorefrontSetupPhases as jest.MockedFunction<
    typeof executeStorefrontSetupPhases
>;

// =============================================================================
// Helpers
// =============================================================================

function createMockContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
    return {
        panel: {
            webview: { postMessage: jest.fn() },
        } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            trace: jest.fn(),
        } as unknown as HandlerContext['logger'],
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: {
            secrets: {},
            globalState: { get: jest.fn(), update: jest.fn() },
        } as unknown as HandlerContext['context'],
        sharedState: {},
        authManager: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn(),
        },
        ...overrides,
    } as unknown as HandlerContext;
}

function createValidPayload(): StorefrontSetupStartPayload {
    return {
        projectName: 'test-project',
        // Include mesh dependency so Adobe I/O auth pre-flight runs
        dependencies: ['eds-accs-mesh'],
        edsConfig: {
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            githubOwner: 'test-owner',
            templateOwner: 'tmpl-owner',
            templateRepo: 'tmpl-repo',
        },
    };
}

// =============================================================================
// Tests
// =============================================================================

describe('handleStartStorefrontSetup - Pre-flight Auth Checks', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // No authManager (existing behavior preserved)
    // =========================================================================

    it('should return error when authManager is not available', async () => {
        // Given: No authManager on context
        const context = createMockContext({ authManager: undefined });

        // When
        const result = await handleStartStorefrontSetup(context, createValidPayload());

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toContain('AuthenticationService not available');

        // And: Should send error message to webview
        expect(context.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-error',
            expect.objectContaining({
                message: 'Authentication required',
            })
        );
    });

    // =========================================================================
    // Adobe I/O Auth - Pre-flight
    // =========================================================================

    it('should proceed when Adobe I/O auth is valid', async () => {
        // Given: Both auths pass
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        mockExecuteStorefrontSetupPhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/test/repo',
            repoOwner: 'test',
            repoName: 'repo',
        });

        const context = createMockContext();

        // When
        const result = await handleStartStorefrontSetup(context, createValidPayload());

        // Then: Should call ensureAdobeIOAuth
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                authManager: context.authManager,
                logger: context.logger,
                logPrefix: '[Storefront Setup]',
                warningMessage: 'Adobe sign-in required for storefront setup.',
            })
        );

        // And: Should proceed to executeStorefrontSetupPhases
        expect(mockExecuteStorefrontSetupPhases).toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    it('should return error when Adobe I/O sign-in is cancelled', async () => {
        // Given: Adobe I/O auth cancelled
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });
        const context = createMockContext();

        // When
        const result = await handleStartStorefrontSetup(context, createValidPayload());

        // Then: Should return auth error
        expect(result.success).toBe(false);
        expect(result.error).toContain('Adobe authentication required');

        // And: Should send error message with cancelled indication
        expect(context.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-error',
            expect.objectContaining({
                error: expect.stringContaining('cancelled'),
            })
        );

        // And: Should NOT proceed to pipeline
        expect(mockExecuteStorefrontSetupPhases).not.toHaveBeenCalled();
    });

    it('should return error when Adobe I/O sign-in fails', async () => {
        // Given: Adobe I/O auth fails
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });
        const context = createMockContext();

        // When
        const result = await handleStartStorefrontSetup(context, createValidPayload());

        // Then: Should return auth error
        expect(result.success).toBe(false);

        // And: Should send error message without cancelled indication
        expect(context.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-error',
            expect.objectContaining({
                error: expect.stringContaining('failed'),
            })
        );
    });

    // =========================================================================
    // DA.live Auth - Pre-flight
    // =========================================================================

    it('should proceed when DA.live auth is valid', async () => {
        // Given: Both auths pass
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        mockExecuteStorefrontSetupPhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/test/repo',
            repoOwner: 'test',
            repoName: 'repo',
        });
        const context = createMockContext();

        // When
        const result = await handleStartStorefrontSetup(context, createValidPayload());

        // Then: ensureDaLiveAuth should have been called WITH the target org,
        // so the guard's server probe can catch a locally-valid-but-refused
        // token before the pipeline starts (the 2026-08-16 evidence run).
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith(
            context,
            '[Storefront Setup]',
            'test-org'
        );

        // And: Should proceed
        expect(result.success).toBe(true);
    });

    it('should return error when DA.live sign-in is cancelled', async () => {
        // Given: Adobe I/O passes, DA.live cancelled
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, cancelled: true });
        const context = createMockContext();

        // When
        const result = await handleStartStorefrontSetup(context, createValidPayload());

        // Then: Should return error
        expect(result.success).toBe(false);
        expect(result.error).toContain('DA.live authentication required');

        // And: Should send error message
        expect(context.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-error',
            expect.objectContaining({
                error: expect.stringContaining('cancelled'),
            })
        );

        // And: Should NOT proceed
        expect(mockExecuteStorefrontSetupPhases).not.toHaveBeenCalled();
    });

    it('should return error when DA.live sign-in fails', async () => {
        // Given: Adobe I/O passes, DA.live fails
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        mockEnsureDaLiveAuth.mockResolvedValue({
            authenticated: false,
            error: 'Token validation failed',
        });
        const context = createMockContext();

        // When
        const result = await handleStartStorefrontSetup(context, createValidPayload());

        // Then: Should return error
        expect(result.success).toBe(false);

        // And: Should include error detail
        expect(context.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-error',
            expect.objectContaining({
                error: expect.stringContaining('Token validation failed'),
            })
        );
    });

    // =========================================================================
    // Both tokens valid (regression test)
    // =========================================================================

    it('should proceed normally when both tokens are valid', async () => {
        // Given: Both auths pass
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
        mockExecuteStorefrontSetupPhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/test/repo',
            repoOwner: 'test',
            repoName: 'repo',
        });
        const context = createMockContext();

        // When
        const result = await handleStartStorefrontSetup(context, createValidPayload());

        // Then: Both guards should have been called
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalled();
        expect(mockEnsureDaLiveAuth).toHaveBeenCalled();

        // And: Pipeline should execute
        expect(mockExecuteStorefrontSetupPhases).toHaveBeenCalled();
        expect(result.success).toBe(true);

        // And: Completion message should be sent
        expect(context.sendMessage).toHaveBeenCalledWith(
            'storefront-setup-complete',
            expect.objectContaining({
                githubRepo: 'https://github.com/test/repo',
            })
        );
    });
});

/**
 * Reported by a colleague 2026-07-28. The Configuration Service
 * refused the site write with 403 four times over two minutes, so the BYOM overlay
 * never registered and the storefront cannot serve product detail pages. The
 * pipeline then logged:
 *
 *   [error] BYOM ... Product detail pages will not load
 *   [info]  Storefront Setup Complete: https://github.com/acme-corp/storefront-demo
 *
 * Four minutes of writes — repo reset, 3336 files, blocks, content, publish — for a
 * storefront that cannot do the one thing the overlay exists for, announced as
 * Complete. The only warning was a dismissible toast 70 seconds earlier.
 *
 * The 403 itself is not fixable here: registration requires the AEM Code Sync admin
 * role, which the Configuration Service grants to whoever INSTALLS the GitHub App
 * (see ConfigurationService.registerSite). What IS fixable is telling the truth
 * about the outcome.
 */
describe('a storefront whose BYOM overlay did not register is not "complete"', () => {
    beforeEach(() => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    });

    it('does not announce plain success when the overlay failed', async () => {
        mockExecuteStorefrontSetupPhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/test/repo',
            repoOwner: 'test',
            repoName: 'repo',
            pdpCaveats: [BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE],
        });
        const context = createMockContext();

        await handleStartStorefrontSetup(context, createValidPayload());

        const [, payload] =
            (context.sendMessage as jest.Mock).mock.calls.find(
                ([type]) => type === 'storefront-setup-complete'
            ) ?? [];
        expect(payload?.message).not.toMatch(/completed successfully/i);
    });

    it('names the consequence and the remedy', async () => {
        mockExecuteStorefrontSetupPhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/test/repo',
            repoOwner: 'test',
            repoName: 'repo',
            pdpCaveats: [BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE],
        });
        const context = createMockContext();

        await handleStartStorefrontSetup(context, createValidPayload());

        const [, payload] =
            (context.sendMessage as jest.Mock).mock.calls.find(
                ([type]) => type === 'storefront-setup-complete'
            ) ?? [];
        // The consequence a user can check, and the action that fixes it — not a
        // bare "something went wrong". `warnings` (plural) since 2026-08-10: three
        // distinct causes can now make PDPs fail and a run can hit more than one.
        expect(payload?.message).toMatch(/product/i);
        expect(payload?.warnings).toEqual([BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE]);
    });

    it('still hands back the repo so the storefront stays usable', async () => {
        // Everything EXCEPT PDPs works. Withholding the repo URL would be a worse
        // lie in the other direction.
        mockExecuteStorefrontSetupPhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/test/repo',
            repoOwner: 'test',
            repoName: 'repo',
            pdpCaveats: [BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE],
        });
        const context = createMockContext();

        const result = await handleStartStorefrontSetup(context, createValidPayload());

        expect(result.success).toBe(true);
        const [, payload] =
            (context.sendMessage as jest.Mock).mock.calls.find(
                ([type]) => type === 'storefront-setup-complete'
            ) ?? [];
        expect(payload?.githubRepo).toBe('https://github.com/test/repo');
    });

    it('leaves the normal completion message alone', async () => {
        mockExecuteStorefrontSetupPhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/test/repo',
            repoOwner: 'test',
            repoName: 'repo',
        });
        const context = createMockContext();

        await handleStartStorefrontSetup(context, createValidPayload());

        const [, payload] =
            (context.sendMessage as jest.Mock).mock.calls.find(
                ([type]) => type === 'storefront-setup-complete'
            ) ?? [];
        expect(payload?.message).toMatch(/completed successfully/i);
        expect(payload?.warning).toBeFalsy();
    });
});

/**
 * Setup has THREE outcomes, not two.
 *
 * Until 2026-08-10 the overlay check was gated on the URL being truthy
 * (`if (edsConfig.byomOverlayUrl && !registered)`), so turning BYOM off — or
 * supplying a URL that failed validation — skipped the check entirely and the
 * run ended on "Storefront setup completed successfully!" for a storefront that
 * can never serve a product detail page.
 */
describe('completion reports caveats, and only when there are caveats', () => {
    const phaseResult = (pdpCaveats?: string[]) => ({
        success: true as const,
        repoUrl: 'https://github.com/test/repo',
        repoOwner: 'test',
        repoName: 'repo',
        ...(pdpCaveats ? { pdpCaveats } : {}),
    });

    const completionPayload = async (pdpCaveats?: string[]) => {
        mockExecuteStorefrontSetupPhases.mockResolvedValue(phaseResult(pdpCaveats));
        const context = createMockContext();
        await handleStartStorefrontSetup(context, createValidPayload());
        const [, payload] =
            (context.sendMessage as jest.Mock).mock.calls.find(
                ([type]) => type === 'storefront-setup-complete'
            ) ?? [];
        return payload as { message?: string; warnings?: string[] } | undefined;
    };

    it('reports plain success when nothing went wrong', async () => {
        // The control. Without it, "always warns" would pass every case below.
        const payload = await completionPayload();

        expect(payload?.message).toMatch(/completed successfully/i);
        expect(payload?.warnings).toBeUndefined();
    });

    it('does not report plain success when no overlay was configured at all', async () => {
        // The case that was entirely silent: nothing to register, so the old
        // truthiness gate never fired.
        const payload = await completionPayload(['BYOM overlay registration is turned off.']);

        expect(payload?.message).not.toMatch(/completed successfully/i);
        expect(payload?.warnings).toEqual(['BYOM overlay registration is turned off.']);
    });

    it('carries every caveat, not just the first', async () => {
        // One run can hit more than one cause — a skipped smart-404 install AND a
        // failed overlay registration. A single `warning` string dropped the rest.
        const both = [BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE, 'Smart-404 handler not installed.'];

        const payload = await completionPayload(both);

        expect(payload?.warnings).toEqual(both);
    });

    it('treats an empty caveat list as success', async () => {
        // `[]` must not read as "there were problems" — the phases initialise the
        // array lazily and an empty one means nothing was recorded.
        const payload = await completionPayload([]);

        expect(payload?.message).toMatch(/completed successfully/i);
        expect(payload?.warnings).toBeUndefined();
    });
});
