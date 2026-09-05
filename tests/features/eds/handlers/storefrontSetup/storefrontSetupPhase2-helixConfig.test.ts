/**
 * executePhaseHelixConfig — the phase's own spine.
 *
 * Phase 2 turns a freshly created repo into an EDS storefront: it points
 * fstab.yaml at the DA.live content source, vendors the smart-404 handler and
 * Quick Edit, and reports where it has got to. Two of those are non-fatal on
 * purpose and one of them used to be non-fatal AND SILENT — a skipped smart-404
 * install reached the debug log and nowhere else while the run reported
 * Complete. The caveat channel is what fixed that, so it is asserted here off
 * `repoInfo` rather than off a spy.
 */

import {
    EDS_CONFIG,
    executePhaseHelixConfig,
    fstabGenerator,
    makeFileOps,
    makePhaseContext,
    makeRepoInfo,
    pdp404Publisher,
    progressPushes,
    quickEditPublisher,
    resetPhase2Mocks,
    servicesWith,
} from './storefrontSetupPhase2.testUtils';

beforeEach(() => {
    resetPhase2Mocks();
});

const OVERLAY_CONFIG = { ...EDS_CONFIG, byomOverlayUrl: 'https://overlay.example.test/render-pdp' };

function runPhase(
    overrides: {
        edsConfig?: typeof EDS_CONFIG;
        fileOps?: ReturnType<typeof makeFileOps>;
        repoInfo?: ReturnType<typeof makeRepoInfo>;
        signal?: AbortSignal;
        options?: Parameters<typeof executePhaseHelixConfig>[5];
    } = {},
) {
    const fileOps = overrides.fileOps ?? makeFileOps();
    const repoInfo = overrides.repoInfo ?? makeRepoInfo();
    const { context, sendMessage } = makePhaseContext();
    const promise = executePhaseHelixConfig(
        context,
        overrides.edsConfig ?? EDS_CONFIG,
        servicesWith(fileOps),
        repoInfo,
        overrides.signal ?? new AbortController().signal,
        overrides.options,
    );
    return { promise, fileOps, repoInfo, context, sendMessage };
}

describe('executePhaseHelixConfig — cancellation', () => {
    it('throws before it writes anything when the run was already cancelled', async () => {
        const controller = new AbortController();
        controller.abort();
        const { promise, fileOps, sendMessage } = runPhase({ signal: controller.signal });

        await expect(promise).rejects.toThrow('Operation cancelled');
        expect(fileOps.createOrUpdateFile).not.toHaveBeenCalled();
        expect(progressPushes(sendMessage)).toEqual([]);
    });
});

describe('executePhaseHelixConfig — fstab.yaml', () => {
    it('generates it from the DA.live target and pushes it to the default branch', async () => {
        const { promise, fileOps } = runPhase();
        await promise;

        expect(fstabGenerator.generateFstabContent).toHaveBeenCalledWith({
            daLiveOrg: 'acme',
            daLiveSite: 'shop',
        });
        expect(fileOps.getFileContent).toHaveBeenCalledWith('me', 'shop', 'fstab.yaml');
        expect(fileOps.createOrUpdateFile).toHaveBeenCalledWith(
            'me',
            'shop',
            'fstab.yaml',
            'mock-fstab',
            'chore: configure fstab.yaml for DA.live content source',
            undefined,
        );
    });

    it('updates the existing file in place when the repo already has one', async () => {
        const fileOps = makeFileOps({
            getFileContent: jest.fn().mockResolvedValue({ sha: 'existing-sha', content: 'old' }),
        });
        const { promise } = runPhase({ fileOps });
        await promise;

        expect(fileOps.createOrUpdateFile).toHaveBeenCalledWith(
            'me',
            'shop',
            'fstab.yaml',
            'mock-fstab',
            'chore: configure fstab.yaml for DA.live content source',
            'existing-sha',
        );
    });
});

describe('executePhaseHelixConfig — the smart-404 handler', () => {
    it('installs it against the configured overlay and the DA.live target', async () => {
        pdp404Publisher.installSmart404Handler.mockResolvedValue({ installed: true });
        const { promise, fileOps, repoInfo } = runPhase({ edsConfig: OVERLAY_CONFIG });
        await promise;

        expect(pdp404Publisher.installSmart404Handler).toHaveBeenCalledWith(
            fileOps,
            'me',
            'shop',
            'https://overlay.example.test/render-pdp',
            expect.anything(),
            'acme',
            'shop',
        );
        expect(repoInfo.pdpCaveats).toBeUndefined();
    });

    it('records a user-facing caveat when an overlay was configured and it was skipped', async () => {
        pdp404Publisher.installSmart404Handler.mockResolvedValue({
            installed: false,
            reason: 'no delayed.js',
        });
        const { promise, repoInfo } = runPhase({ edsConfig: OVERLAY_CONFIG });
        await promise;

        expect(repoInfo.pdpCaveats).toEqual([
            'Product detail pages may not recover on first visit: the smart-404 handler ' +
                'was not installed (no delayed.js). Reset the storefront to reinstall it.',
        ]);
    });

    it('stays quiet when no overlay was configured — phase 3 raises that one', async () => {
        pdp404Publisher.installSmart404Handler.mockResolvedValue({
            installed: false,
            reason: 'BYOM disabled',
        });
        const { promise, repoInfo } = runPhase();
        await promise;

        expect(repoInfo.pdpCaveats).toBeUndefined();
    });
});

describe('executePhaseHelixConfig — Quick Edit', () => {
    it('wires it into the repo it just configured', async () => {
        const { promise, fileOps } = runPhase();
        await promise;

        expect(quickEditPublisher.installQuickEdit).toHaveBeenCalledWith(
            fileOps,
            'me',
            'shop',
            expect.anything(),
        );
    });
});

describe('executePhaseHelixConfig — progress', () => {
    it('reports the phase from connecting the content source to configured', async () => {
        const { promise, sendMessage } = runPhase();
        await promise;

        expect(progressPushes(sendMessage)).toEqual([
            {
                phase: 'storefront-code',
                message: 'Configuring Edge Delivery Services...',
                subMessage: 'acme/shop',
                progress: 20,
            },
            {
                phase: 'storefront-code',
                message: 'Connecting content source...',
                subMessage: 'fstab.yaml → acme/shop',
                progress: 25,
            },
            {
                phase: 'storefront-code',
                message: 'Preparing inspector tagging...',
                progress: 27,
            },
            {
                phase: 'storefront-code',
                message: 'Edge Delivery Services configured',
                progress: 35,
            },
        ]);
    });
});
