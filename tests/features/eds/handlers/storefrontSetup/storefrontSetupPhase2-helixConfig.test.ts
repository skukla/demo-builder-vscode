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
        expect(progressPushes(sendMessage)).toStrictEqual([]);
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
    it('installs it into 404.html against the configured overlay and the DA.live target', async () => {
        const notFound = '<html><head><script nonce="aem">window.isErrorPage = true;</script></head><body><main></main></body></html>';
        const head = '<script nonce="aem" src="/scripts/aem.js" type="module"></script>\n';
        const files: Record<string, string> = { '404.html': notFound, 'head.html': head };
        const pageOps = makeFileOps({
            getFileContent: jest.fn(async (_o: string, _r: string, path: string, _ref?: string) =>
                (files[path] === undefined ? null : { content: files[path], sha: `${path}-sha`, path, encoding: 'utf-8' })),
        });
        const { promise, fileOps, repoInfo } = runPhase({ edsConfig: OVERLAY_CONFIG, fileOps: pageOps });
        await promise;

        expect(fileOps.createOrUpdateFile).toHaveBeenCalledWith(
            'me', 'shop', '404.html',
            expect.stringContaining('https://overlay.example.test/prepublish-pdp?org=acme&site=shop&path='),
            expect.any(String), '404.html-sha',
        );
        expect(repoInfo.pdpCaveats).toBeUndefined();
    });

    it('loads the Demo Inspector from head.html: creation has just installed it', async () => {
        const head = '<script nonce="aem" src="/scripts/aem.js" type="module"></script>\n';
        const pageOps = makeFileOps({
            getFileContent: jest.fn(async (_o: string, _r: string, path: string, _ref?: string) =>
                (path === 'head.html' ? { content: head, sha: 'head-sha', path, encoding: 'utf-8' } : null)),
        });
        const { promise, fileOps } = runPhase({ fileOps: pageOps });
        await promise;

        expect(fileOps.createOrUpdateFile).toHaveBeenCalledWith(
            'me', 'shop', 'head.html', expect.stringContaining('Demo Inspector loader (Demo Builder)'),
            expect.any(String), 'head-sha',
        );
    });

    it('records a user-facing caveat when an overlay was configured and it was skipped', async () => {
        const { promise, repoInfo } = runPhase({ edsConfig: OVERLAY_CONFIG });
        await promise;

        expect(repoInfo.pdpCaveats).toEqual([
            'Product detail pages may not recover on first visit: the smart-404 handler ' +
                'was not installed (404.html missing). Reset the storefront to reinstall it.',
        ]);
    });

    it('stays quiet when no overlay was configured — phase 3 raises that one', async () => {
        const { promise, repoInfo } = runPhase();
        await promise;

        expect(repoInfo.pdpCaveats).toBeUndefined();
    });
});

// Creation stamps the project with it ("Needs reset", storefrontChanges.ts): setup has no project.
describe('executePhaseHelixConfig — whether the build step finished', () => {
    it('hands creation a finished build when the storefront needed no fix', async () => {
        const { promise, repoInfo } = runPhase();
        await promise;

        expect(repoInfo.storefrontBuildComplete).toBe(true);
    });

    it("hands creation an unfinished build when the build step's own read fails", async () => {
        const fileOps = makeFileOps();
        const read = fileOps.getFileContent.getMockImplementation();
        // Only the build step's read of head.html: fstab and the rest read as before.
        fileOps.getFileContent.mockImplementation(async (...args: Parameters<typeof fileOps.getFileContent>) => {
            if (args[2] === 'head.html') throw new Error('rate limited');
            return read ? read(...args) : null;
        });
        const { promise, repoInfo } = runPhase({ fileOps });
        await promise;

        expect(repoInfo.storefrontBuildComplete).toBe(false);
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
                message: 'Configuring Edge Delivery Services',
                progress: 20,
            },
            {
                // Line 2 under 'Setting up the code': where the content comes from.
                phase: 'storefront-code',
                message: 'Connecting the content source: acme/shop',
                progress: 25,
            },
            {
                phase: 'storefront-code',
                message: 'Preparing inspector tagging',
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
