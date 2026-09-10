/**
 * Which of Phase 1's THREE repository branches a config selects.
 *
 * `executePhaseGitHubRepo` chooses between a repo the wizard already created,
 * a repo the SC picked, and creating a new one — from two booleans built out of
 * `repoMode`, `createdRepo`, `selectedRepo` and `existingRepo`. Picking the
 * wrong one is not a crash. It is a repo created that should have been reused,
 * or a repo written to that the SC asked to keep, and both look like a normal
 * successful run.
 *
 * The two existing suites both enter through the branch they are about: the pin
 * suite hands in a `createdRepo`, the appGate suite an `existingRepo`. Neither
 * asks what happens when the inputs disagree — and they do disagree in
 * practice, because `createdRepo` survives in the wizard state after the SC
 * goes back and switches to an existing repo.
 *
 * Each test here therefore states which branch ran by the ONE observable that
 * separates them: `createFromTemplate` for the new branch, the "Using existing
 * repository..." progress message for the existing branch, and "Using
 * repository..." for the pre-created one.
 */

import { executePhaseGitHubRepo } from '@/features/eds/handlers/storefrontSetup/storefrontSetupPhase1';
import type { StorefrontSetupStartPayload } from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import type {
    RepoInfo,
    SetupServices,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupTypes';
import type { HandlerContext } from '@/types/handlers';

jest.mock('@/features/eds/services/patches/lkgPinHelper', () => ({
    pinRepoToLkg: jest.fn().mockResolvedValue(true),
}));
import { pinRepoToLkg } from '@/features/eds/services/patches/lkgPinHelper';

jest.mock('@/features/eds/services/appInstallationResolver', () => ({
    ...jest.requireActual('@/features/eds/services/appInstallationResolver'),
    resolveAppInstallation: jest.fn(),
}));
import { resolveAppInstallation } from '@/features/eds/services/appInstallationResolver';
import { makeContext, TEMPLATE } from './storefrontSetupPhase1.testUtils';

const mockPin = pinRepoToLkg as jest.Mock;
const mockResolve = resolveAppInstallation as jest.Mock;

const CREATED_REPO = {
    owner: 'skukla',
    name: 'made-by-the-wizard',
    url: 'https://github.com/skukla/made-by-the-wizard',
};

const PATCH_FIELDS = {
    codePatches: ['product-link-sku-encoding'],
    codePatchSource: {
        owner: 'skukla',
        repo: 'eds-demo-patches',
        path: 'b2b',
        lkgFile: 'b2b/last-known-good',
    },
};

function makeServices() {
    return {
        githubFileOps: {},
        githubRepoOps: {
            createFromTemplate: jest.fn().mockResolvedValue({
                htmlUrl: 'https://github.com/skukla/brand-new',
                fullName: 'skukla/brand-new',
            }),
            waitForContent: jest.fn().mockResolvedValue(undefined),
            resetToTemplate: jest.fn().mockResolvedValue(undefined),
        },
        githubAppService: {
            getInstallUrl: jest.fn().mockReturnValue('https://github.com/apps/aem-code-sync'),
        },
    } as unknown as SetupServices;
}

const config = (fields: Record<string, unknown>) =>
    fields as unknown as StorefrontSetupStartPayload['edsConfig'];

/** Every progress message the run emitted, in order. */
const messages = (context: HandlerContext): string[] =>
    (context.sendMessage as jest.Mock).mock.calls
        .filter(([type]) => type === 'storefront-setup-progress')
        .map(([, payload]) => (payload as { message: string }).message);

interface RunResult {
    context: HandlerContext;
    services: SetupServices;
    repoInfo: RepoInfo;
}

async function run(
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    signal: AbortSignal = new AbortController().signal,
): Promise<RunResult> {
    const context = makeContext();
    const services = makeServices();
    const repoInfo: RepoInfo = { repoOwner: '', repoName: '', repoUrl: '' };
    await executePhaseGitHubRepo(
        context,
        edsConfig,
        services,
        repoInfo,
        signal,
        TEMPLATE.owner,
        TEMPLATE.repo,
        undefined,
    );
    return { context, services, repoInfo };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockPin.mockResolvedValue(true);
    mockResolve.mockResolvedValue({ kind: 'installed', codeStatus: 200 });
});

describe('executePhaseGitHubRepo — cancellation', () => {
    it('refuses to start on an already-aborted signal', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
            run(config({ repoMode: 'new', createdRepo: CREATED_REPO }), controller.signal),
        ).rejects.toThrow('Operation cancelled');
    });
});

describe('executePhaseGitHubRepo — which branch runs', () => {
    it('creates a new repo when the mode is new and nothing was pre-created', async () => {
        const { services } = await run(config({ repoMode: 'new' }));

        expect(services.githubRepoOps.createFromTemplate).toHaveBeenCalled();
    });

    it('creates a new repo even when an existingRepo is left over in the config', async () => {
        // Going back in the wizard and switching to "create new" leaves the old
        // `existingRepo` behind. `repoMode` is what the SC last chose, so it
        // decides — a stale field must not reroute the run into a repo they are
        // no longer targeting.
        const { services, context } = await run(
            config({ repoMode: 'new', existingRepo: 'acme/old-choice' }),
        );

        expect(services.githubRepoOps.createFromTemplate).toHaveBeenCalled();
        expect(messages(context)).not.toContain('Using existing repository...');
    });

    it('creates a new repo when the mode is existing but no repo was named', async () => {
        // Nothing to reuse, so the existing branch cannot run — it would write
        // progress messages for an empty owner/name.
        const { services } = await run(config({ repoMode: 'existing' }));

        expect(services.githubRepoOps.createFromTemplate).toHaveBeenCalled();
    });

    it('uses the pre-created repo when the mode is new and one exists', async () => {
        const { context, repoInfo } = await run(
            config({ repoMode: 'new', createdRepo: CREATED_REPO }),
        );

        expect(messages(context)).toContain('Using repository...');
        expect(repoInfo).toEqual({
            repoOwner: 'skukla',
            repoName: 'made-by-the-wizard',
            repoUrl: 'https://github.com/skukla/made-by-the-wizard',
        });
    });

    it('uses the SELECTED repo when the mode is existing, even with a createdRepo left over', async () => {
        // The wizard's "Create Repository" button may have run before the SC
        // went back and picked an existing repo instead. `repoMode` decides;
        // the leftover must not silently retarget the whole setup.
        const { context, services } = await run(
            config({
                repoMode: 'existing',
                existingRepo: 'acme/storefront-demo',
                createdRepo: CREATED_REPO,
            }),
        );

        expect(messages(context)).toContain('Using existing repository...');
        expect(messages(context)).not.toContain('Using repository...');
        expect(services.githubRepoOps.createFromTemplate).not.toHaveBeenCalled();
    });
});

/**
 * The pre-created branch's progress sequence and its ADR-006 Step 4b pin.
 *
 * The messages are the wizard's only account of a phase that can take a minute,
 * and the pin between them is the step whose absence shipped a half-patched b2b
 * storefront.
 */
describe('executePhaseGitHubRepo — the pre-created branch', () => {
    it('reports using, pinning and ready, in that order', async () => {
        const { context } = await run(
            config({ repoMode: 'new', createdRepo: CREATED_REPO, ...PATCH_FIELDS }),
        );

        expect(messages(context)).toEqual([
            'Using repository...',
            'Pinning to verified canonical state...',
            'Repository ready',
        ]);
    });

    it('carries the repo coordinates on the first and last message', async () => {
        const { context } = await run(
            config({ repoMode: 'new', createdRepo: CREATED_REPO, ...PATCH_FIELDS }),
        );

        const sent = (context.sendMessage as jest.Mock).mock.calls.map(([, p]) => p);
        expect(sent[0]).toEqual({
            phase: 'repository',
            message: 'Using repository...',
            subMessage: 'skukla/made-by-the-wizard',
            progress: 10,
            repoOwner: 'skukla',
            repoName: 'made-by-the-wizard',
            repoUrl: 'https://github.com/skukla/made-by-the-wizard',
        });
        expect(sent[1]).toEqual({
            phase: 'repository',
            message: 'Pinning to verified canonical state...',
            subMessage: 'skukla/made-by-the-wizard',
            progress: 12,
        });
        expect(sent[2]).toMatchObject({
            phase: 'repository',
            message: 'Repository ready',
            progress: 15,
            repoOwner: 'skukla',
            repoName: 'made-by-the-wizard',
        });
    });
});

/**
 * `pinIfThinLayer` runs on three of Phase 1's paths, and skips on two
 * conditions. Both skips are quiet by design, so both need pinning: the
 * codePatches half of the guard was added because a missing patch LIST would
 * otherwise reach `pinRepoToLkg` as undefined.
 */
describe('pinIfThinLayer — when it declines to run', () => {
    it('skips when the storefront names a patch source but no patches', async () => {
        const { codePatches: _unused, ...sourceOnly } = PATCH_FIELDS;

        await run(config({ repoMode: 'new', createdRepo: CREATED_REPO, ...sourceOnly }));

        expect(mockPin).not.toHaveBeenCalled();
    });

    it('skips when the repo coordinates are not both populated', async () => {
        // Defensive: every path above this populates both. Reaching pinRepoToLkg
        // with a blank owner would target the authenticated user's namespace.
        await run(
            config({
                repoMode: 'new',
                createdRepo: { owner: '', name: 'nameless', url: '' },
                ...PATCH_FIELDS,
            }),
        );

        expect(mockPin).not.toHaveBeenCalled();
    });
});
