/**
 * Storefront Setup Handlers — what `handleStartStorefrontSetup` decides.
 *
 * The three outcomes (complete / awaiting-github-app / error), the guards that
 * run before the phases, what the phases are actually handed, and the one thing
 * that must happen on every path out: the abort controller is dropped from
 * shared state, or the next cancel aborts a run that already finished.
 *
 * The completion payload's caveat wording is covered in the -auth suite; this
 * one covers the branches that suite never enters.
 */

import type { HandlerContext } from '@/types/handlers';

// =============================================================================
// Mocks — before the imports of the module under test
// =============================================================================

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn(),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: jest.fn(),
    getDaLiveAuthService: jest.fn(),
    resolveByomOverlayConfig: jest.fn(),
    explainAbsentOverlay: jest.fn(() => 'BYOM overlay is not configured.'),
}));

jest.mock('@/features/eds/handlers/storefrontSetup/storefrontSetupPhases', () => ({
    executeStorefrontSetupPhases: jest.fn(),
}));

jest.mock('@/features/eds/services/cleanupService');
jest.mock('@/features/eds/services/configService/configurationService');
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveTokenProvider: jest.fn(),
    createDaLiveServiceTokenProvider: jest.fn(),
}));
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations');
jest.mock('@/features/eds/services/toolManager');

// =============================================================================
// Imports (after the mocks)
// =============================================================================

import {
    classifySetupResult,
    handleStartStorefrontSetup,
    type StorefrontSetupStartPayload,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { ensureDaLiveAuth, resolveByomOverlayConfig } from '@/features/eds/handlers/edsHelpers';
import { executeStorefrontSetupPhases } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhases';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockAuthenticationService } from '../../../../helpers/authenticationServiceFake';

const mockEnsureAdobeIOAuth = ensureAdobeIOAuth as jest.MockedFunction<typeof ensureAdobeIOAuth>;
const mockEnsureDaLiveAuth = ensureDaLiveAuth as jest.MockedFunction<typeof ensureDaLiveAuth>;
const mockResolveByomOverlayConfig = resolveByomOverlayConfig as jest.MockedFunction<
    typeof resolveByomOverlayConfig
>;
const mockExecutePhases = executeStorefrontSetupPhases as jest.MockedFunction<
    typeof executeStorefrontSetupPhases
>;

// =============================================================================
// Helpers
// =============================================================================

function createContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        sendMessage: jest.fn(),
        context: { secrets: {} } as unknown as HandlerContext['context'],
        authManager: createMockAuthenticationService(),
        ...overrides,
    });
}

const EDS_CONFIG = {
    repoName: 'demo-repo',
    daLiveOrg: 'demo-org',
    daLiveSite: 'demo-site',
    githubOwner: 'demo-owner',
    templateOwner: 'tmpl-owner',
    templateRepo: 'tmpl-repo',
};

/** No mesh in the dependency list, so the Adobe I/O guard is skipped by default. */
function payload(
    overrides: Partial<StorefrontSetupStartPayload> = {}
): StorefrontSetupStartPayload {
    return {
        projectName: 'demo-project',
        dependencies: ['eds-storefront'],
        edsConfig: { ...EDS_CONFIG },
        ...overrides,
    };
}

/** Find the payload of a message the handler pushed, or undefined if it never did. */
function messagePayload(context: HandlerContext, type: string) {
    const [, sent] =
        (context.sendMessage as jest.Mock).mock.calls.find(([name]) => name === type) ?? [];
    return sent as Record<string, unknown> | undefined;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockResolveByomOverlayConfig.mockReturnValue('https://overlay.example/render-pdp');
    mockExecutePhases.mockResolvedValue({
        success: true,
        repoUrl: 'https://github.com/demo-org/demo-repo',
        repoOwner: 'demo-org',
        repoName: 'demo-repo',
    });
});

// =============================================================================
// Tests
// =============================================================================

describe('classifySetupResult', () => {
    // Decided by the flag, never by the error text — that wording changed twice
    // in one release and matching on it would have broken silently each time.
    it('calls a successful run complete', () => {
        expect(classifySetupResult({ success: true })).toBe('complete');
    });

    it('calls a run waiting on the GitHub App awaiting-github-app, not an error', () => {
        expect(
            classifySetupResult({
                success: false,
                awaitingGitHubApp: true,
                error: 'AEM Code Sync is not installed',
            })
        ).toBe('awaiting-github-app');
    });

    it('calls anything else an error', () => {
        expect(classifySetupResult({ success: false, error: 'boom' })).toBe('error');
    });

    it('prefers success over the awaiting flag if both are somehow set', () => {
        expect(classifySetupResult({ success: true, awaitingGitHubApp: true })).toBe('complete');
    });
});

describe('handleStartStorefrontSetup — required parameters', () => {
    it('refuses a payload with no project name', async () => {
        const context = createContext();

        const result = await handleStartStorefrontSetup(
            context,
            payload({ projectName: '' }) as StorefrontSetupStartPayload
        );

        expect(result).toEqual({ success: false, error: 'Missing required parameters' });
        expect(mockExecutePhases).not.toHaveBeenCalled();
    });

    it('refuses a payload with no eds config', async () => {
        const context = createContext();

        const result = await handleStartStorefrontSetup(context, {
            projectName: 'demo-project',
        } as StorefrontSetupStartPayload);

        expect(result).toEqual({ success: false, error: 'Missing required parameters' });
        expect(mockExecutePhases).not.toHaveBeenCalled();
    });

    it('refuses a bare message with no payload at all', async () => {
        const context = createContext();

        const result = await handleStartStorefrontSetup(context);

        expect(result).toEqual({ success: false, error: 'Missing required parameters' });
    });

    it('tells the UI which parameters were missing', async () => {
        const context = createContext();

        await handleStartStorefrontSetup(context);

        expect(messagePayload(context, 'storefront-setup-error')).toEqual({
            message: 'Missing required parameters',
            error: 'Project name and EDS config are required',
        });
    });
});

describe('handleStartStorefrontSetup — the Adobe I/O guard runs only for mesh', () => {
    it('skips the Adobe sign-in check when no mesh was selected', async () => {
        // Storefront-only setups touch nothing in Adobe Console, so demanding a
        // sign-in there would block a run that does not need one.
        const context = createContext();

        const result = await handleStartStorefrontSetup(context, payload());

        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
    });

    it('runs the check when the dependency list includes the mesh', async () => {
        const context = createContext();

        await handleStartStorefrontSetup(context, payload({ dependencies: ['eds-accs-mesh'] }));

        expect(mockEnsureAdobeIOAuth).toHaveBeenCalled();
    });

    it('treats a missing dependency list as no mesh', async () => {
        const context = createContext();

        await handleStartStorefrontSetup(context, payload({ dependencies: undefined }));

        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });
});

describe('handleStartStorefrontSetup — what the phases are handed', () => {
    it('passes the resolved overlay URL and the selections, under an abort signal', async () => {
        const context = createContext();

        await handleStartStorefrontSetup(
            context,
            payload({
                selectedBlockLibraries: ['commerce'],
                customBlockLibraries: [
                    {
                        name: 'house',
                        source: { owner: 'demo-org', repo: 'blocks', branch: 'main' },
                    },
                ],
                selectedPackage: 'citisignal',
            })
        );

        expect(mockExecutePhases).toHaveBeenCalledWith(
            context,
            expect.objectContaining({
                repoName: 'demo-repo',
                daLiveOrg: 'demo-org',
                daLiveSite: 'demo-site',
                byomOverlayUrl: 'https://overlay.example/render-pdp',
            }),
            expect.any(AbortSignal),
            {
                selectedBlockLibraries: ['commerce'],
                customBlockLibraries: [
                    {
                        name: 'house',
                        source: { owner: 'demo-org', repo: 'blocks', branch: 'main' },
                    },
                ],
                packageId: 'citisignal',
            }
        );
    });

    it('explains the absence when no overlay URL resolved', async () => {
        // The reason is decided here, where the settings were already read —
        // phase 3 reads it inside the Config Service try/catch, where a config
        // read that throws surfaces as a bogus "Config Service failed".
        mockResolveByomOverlayConfig.mockReturnValue(undefined);
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(mockExecutePhases).toHaveBeenCalledWith(
            context,
            expect.objectContaining({ byomAbsentReason: 'BYOM overlay is not configured.' }),
            expect.anything(),
            expect.anything()
        );
    });

    it('carries no absent-reason when the overlay did resolve', async () => {
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        const config = mockExecutePhases.mock.calls[0]?.[1] as Record<string, unknown>;
        expect(config.byomAbsentReason).toBeUndefined();
    });
});

describe('handleStartStorefrontSetup — the three outcomes', () => {
    it('pauses without an error when the GitHub App still has to be installed', async () => {
        // The install dialog is already up and the resume path takes over.
        // Emitting an error here tears the dialog down and leaves the SC with
        // nothing to act on — the bug that made this a third outcome.
        mockExecutePhases.mockResolvedValue({
            success: false,
            awaitingGitHubApp: true,
            error: 'AEM Code Sync is not installed',
        });
        const context = createContext();

        const result = await handleStartStorefrontSetup(context, payload());

        expect(result).toEqual({ success: false, error: 'AEM Code Sync is not installed' });
        expect(messagePayload(context, 'storefront-setup-error')).toBeUndefined();
        expect(messagePayload(context, 'storefront-setup-complete')).toBeUndefined();
    });

    it('reports a failed run with the phase error', async () => {
        mockExecutePhases.mockResolvedValue({ success: false, error: 'fstab.yaml never synced' });
        const context = createContext();

        const result = await handleStartStorefrontSetup(context, payload());

        expect(result).toEqual({ success: false, error: 'fstab.yaml never synced' });
        expect(messagePayload(context, 'storefront-setup-error')).toEqual({
            message: 'Storefront setup failed',
            error: 'fstab.yaml never synced',
        });
    });

    it('reports a failed run that gave no reason', async () => {
        mockExecutePhases.mockResolvedValue({ success: false });
        const context = createContext();

        const result = await handleStartStorefrontSetup(context, payload());

        expect(result).toEqual({ success: false, error: 'Unknown error' });
    });

    it('reports a thrown phase failure the same way', async () => {
        mockExecutePhases.mockRejectedValue(new Error('DA.live copy exploded'));
        const context = createContext();

        const result = await handleStartStorefrontSetup(context, payload());

        expect(result).toEqual({ success: false, error: 'DA.live copy exploded' });
        expect(messagePayload(context, 'storefront-setup-error')).toEqual({
            message: 'Storefront setup failed',
            error: 'DA.live copy exploded',
        });
    });

    it('hands the completed storefront back with its repo and its da.live site', async () => {
        const context = createContext();

        const result = await handleStartStorefrontSetup(context, payload());

        expect(result.success).toBe(true);
        expect(messagePayload(context, 'storefront-setup-complete')).toEqual({
            message: 'Storefront setup completed successfully!',
            githubRepo: 'https://github.com/demo-org/demo-repo',
            daLiveSite: 'https://da.live/demo-org/demo-site',
            repoOwner: 'demo-org',
            repoName: 'demo-repo',
        });
    });
});

describe('handleStartStorefrontSetup — the abort controller never outlives the run', () => {
    // A controller left in shared state means the NEXT cancel aborts a run that
    // already finished, and the cleanup it triggers deletes a live storefront.
    it('is dropped after a completed run', async () => {
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(context.sharedState.storefrontSetupAbortController).toBeUndefined();
    });

    it('is dropped after a failed run', async () => {
        mockExecutePhases.mockRejectedValue(new Error('boom'));
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(context.sharedState.storefrontSetupAbortController).toBeUndefined();
    });

    it('is dropped when the run pauses for the GitHub App', async () => {
        mockExecutePhases.mockResolvedValue({
            success: false,
            awaitingGitHubApp: true,
            error: 'AEM Code Sync is not installed',
        });
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(context.sharedState.storefrontSetupAbortController).toBeUndefined();
    });

    it('is in place while the phases run', async () => {
        // The cancel handler reads it from exactly here.
        let seen: unknown;
        mockExecutePhases.mockImplementation(async (ctx) => {
            seen = (ctx as HandlerContext).sharedState.storefrontSetupAbortController;
            return { success: true, repoUrl: 'https://github.com/demo-org/demo-repo' };
        });
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(seen).toBeInstanceOf(AbortController);
    });
});
