/**
 * Storefront Setup Handlers — what `handleStartStorefrontSetup` decides.
 *
 * The two outcomes (complete / error), the guards that
 * run before the phases, what the phases are actually handed, and the one thing
 * that must happen on every path out: the abort controller is dropped from
 * shared state, or the next cancel aborts a run that already finished.
 *
 * The completion payload's caveat wording is covered in the -auth suite; this
 * one covers the branches that suite never enters.
 */

import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import type { HandlerContext } from '@/types/handlers';
import type { StorefrontBrokenLink } from '@/types/webviewPayloads';

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

// Answers the config it was given unless a test says otherwise, which is what the
// real one does for every payload here (none names both a package and a stack).
jest.mock('@/features/eds/handlers/storefrontSetup/storefrontSetupConfigRehydration', () => ({
    rehydratePackageDerivedConfig: jest.fn((edsConfig: unknown) => edsConfig),
}));

jest.mock('@/features/eds/services/cleanupService');
jest.mock('@/features/eds/services/configService/configurationService');
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveTokenProvider: jest.fn(),
    createDaLiveServiceTokenProvider: jest.fn(),
}));
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations');
jest.mock('@/features/eds/services/toolManager');

// =============================================================================
// Imports (after the mocks)
// =============================================================================

import {
    handleStartStorefrontSetup,
    type StorefrontSetupStartPayload,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import { ensureAdobeIOAuth } from '@/core/auth/adobeAuthGuard';
import { ensureDaLiveAuth, resolveByomOverlayConfig } from '@/features/eds/handlers/edsHelpers';
import { executeStorefrontSetupPhases } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhases';
import { rehydratePackageDerivedConfig } from '@/features/eds/handlers/storefrontSetup/storefrontSetupConfigRehydration';
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
const mockRehydrate = rehydratePackageDerivedConfig as jest.MockedFunction<
    typeof rehydratePackageDerivedConfig
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
    mockRehydrate.mockImplementation((edsConfig) => edsConfig);
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

describe('handleStartStorefrontSetup — what a refused sign-in tells the UI', () => {
    it('asks for an Adobe sign-in when a mesh run has no auth service at all', async () => {
        const context = createContext({ authManager: undefined });

        await handleStartStorefrontSetup(context, payload({ dependencies: ['eds-accs-mesh'] }));

        expect(messagePayload(context, 'storefront-setup-error')).toEqual({
            message: 'Authentication required',
            error: 'Please authenticate with Adobe before starting storefront setup',
        });
        expect(mockExecutePhases).not.toHaveBeenCalled();
    });

    it('names Adobe, not DA.live, when the Adobe sign-in did not happen', async () => {
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });
        const context = createContext();

        await handleStartStorefrontSetup(context, payload({ dependencies: ['eds-accs-mesh'] }));

        expect(messagePayload(context, 'storefront-setup-error')).toEqual({
            message: 'Authentication required',
            error: 'Adobe sign-in failed. Please try again.',
        });
    });

    it('says the DA.live session expired when the guard gave no reason of its own', async () => {
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false });
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(messagePayload(context, 'storefront-setup-error')).toEqual({
            message: 'DA.live authentication expired',
            error: 'Your DA.live session has expired.',
        });
    });

    it("passes on the DA.live guard's own reason when it has one", async () => {
        mockEnsureDaLiveAuth.mockResolvedValue({
            authenticated: false,
            error: 'DA.live refused this token for demo-org.',
        });
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(messagePayload(context, 'storefront-setup-error')).toEqual({
            message: 'DA.live authentication expired',
            error: 'DA.live refused this token for demo-org.',
        });
    });
});

describe('handleStartStorefrontSetup — package settings are restored before any phase reads them', () => {
    it('looks the settings up by the package, the stack and the added demo', async () => {
        const demo = { kind: 'demo', version: 1, name: 'Isle5 by Jen', source: { owner: 'jen', repo: 'isle5-demo' }, storefrontKind: 'eds' } as const;
        const context = createContext();

        await handleStartStorefrontSetup(
            context,
            payload({ selectedPackage: 'citisignal', selectedStack: 'eds-accs', demo }),
        );

        expect(mockRehydrate).toHaveBeenCalledWith(
            EDS_CONFIG,
            { selectedPackage: 'citisignal', selectedStack: 'eds-accs', demo },
            context.logger,
        );
    });

    it('hands the phases the restored config, not the one the wizard sent', async () => {
        // Edit mode sends a config with no package-derived settings; the phases
        // must read the restored one or every patch is skipped without a word.
        mockRehydrate.mockImplementation((edsConfig) => ({
            ...edsConfig,
            daLiveSite: 'restored-site',
        }));
        mockResolveByomOverlayConfig.mockReturnValue(undefined);
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(mockResolveByomOverlayConfig).toHaveBeenCalledWith(
            undefined,
            'demo-org',
            'restored-site',
        );
        expect(mockExecutePhases).toHaveBeenCalledWith(
            context,
            expect.objectContaining({ daLiveSite: 'restored-site' }),
            expect.anything(),
            expect.anything(),
        );
        expect(messagePayload(context, 'storefront-setup-complete')).toMatchObject({
            daLiveSite: 'https://da.live/demo-org/restored-site',
        });
    });
});

describe("handleStartStorefrontSetup — applying an added demo's fixes is opt-in", () => {
    /** The config the phases were handed on the first call. */
    function phaseConfig(): Record<string, unknown> {
        return mockExecutePhases.mock.calls[0]?.[1] as Record<string, unknown>;
    }

    it('tells the phases to apply the fixes when the SC asked for them', async () => {
        await handleStartStorefrontSetup(createContext(), payload({ applyDemoFixes: true }));

        expect(phaseConfig().applyDemoFixes).toBe(true);
    });

    it('says nothing about fixes when the SC declined them', async () => {
        await handleStartStorefrontSetup(createContext(), payload({ applyDemoFixes: false }));

        expect(phaseConfig()).not.toHaveProperty('applyDemoFixes');
    });

    it('says nothing about fixes when the payload never mentioned them', async () => {
        await handleStartStorefrontSetup(createContext(), payload());

        expect(phaseConfig()).not.toHaveProperty('applyDemoFixes');
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

describe('handleStartStorefrontSetup — the two outcomes', () => {
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

    it("copies an added demo's row onto the config the phases read", async () => {
        const demo = { kind: 'demo', version: 1, name: 'Isle5 by Jen', source: { owner: 'jen', repo: 'isle5-demo' }, storefrontKind: 'eds' } as const;
        await handleStartStorefrontSetup(createContext(), payload({ demo }));
        expect(mockExecutePhases).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ demo }),
            expect.anything(),
            expect.anything(),
        );
    });

    it("says what may not work on an added demo, under its own headline, not the PDP one", async () => {
        mockExecutePhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/demo-org/demo-repo',
            repoOwner: 'demo-org',
            repoName: 'demo-repo',
            demoCaveats: ['Product links on this storefront use a different address format.'],
        });
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(messagePayload(context, 'storefront-setup-complete')).toEqual(
            expect.objectContaining({
                message: 'Storefront created. A few things to know about this demo.',
                warnings: ['Product links on this storefront use a different address format.'],
            }),
        );
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

    it('hands back the broken links the run found, for the Storefront Report', async () => {
        const brokenLinks: StorefrontBrokenLink[] = [{ link: '/fr', pages: ['/footer'] }];
        mockExecutePhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/demo-org/demo-repo',
            brokenLinks,
        });
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(messagePayload(context, 'storefront-setup-complete')?.brokenLinks).toStrictEqual(
            brokenLinks,
        );
    });

    it('leaves broken links off the message when the run found none', async () => {
        mockExecutePhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/demo-org/demo-repo',
            brokenLinks: [],
        });
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(messagePayload(context, 'storefront-setup-complete')).not.toHaveProperty(
            'brokenLinks',
        );
    });

    it('hands back the block libraries it installed, for creation to record on the new project', async () => {
        const installed: InstalledBlockLibrary[] = [
            {
                name: 'Isle5 Blocks',
                source: { owner: 'adobe', repo: 'isle5', branch: 'main' },
                commitSha: 'abc123',
                blockIds: ['hero'],
                installedAt: '2026-10-09T00:00:00.000Z',
            },
        ];
        mockExecutePhases.mockResolvedValue({
            success: true,
            repoUrl: 'https://github.com/demo-org/demo-repo',
            repoOwner: 'demo-org',
            repoName: 'demo-repo',
            installedBlockLibraries: installed,
        });
        const context = createContext();

        await handleStartStorefrontSetup(context, payload());

        expect(messagePayload(context, 'storefront-setup-complete')).toMatchObject({
            installedBlockLibraries: installed,
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
