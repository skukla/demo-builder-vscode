/**
 * Every place Phase 1 turns a `owner/repo` STRING into two fields.
 *
 * It does this three times — from `selectedRepo.fullName`, from the typed
 * `existingRepo`, and from whatever `createFromTemplate` reports back — and each
 * one refuses anything that is not exactly two non-empty segments. That refusal
 * is the only thing standing between a malformed name and the rest of the
 * pipeline: an empty owner does not fail, it targets the authenticated user's
 * namespace, and an empty name reaches the GitHub API as a request for the
 * whole account.
 *
 * The four rejected shapes are one test each, because the guard is a chain of
 * three conditions and a single "no slash" case satisfies all of them at once —
 * which is why the chain was entirely unconstrained while looking covered.
 *
 * The new-repo branch is here too: nothing exercised it end to end, so the two
 * defaults it passes to `createFromTemplate` (private-unless-asked, and "create
 * under the authenticated user" when no namespace was picked) were both
 * unpinned.
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

const mockResolve = resolveAppInstallation as jest.Mock;
const mockPin = pinRepoToLkg as jest.Mock;

/** The shapes that are not `owner/repo`, and must all be refused. */
const MALFORMED = [
    ['no separator at all', 'no-slash'],
    ['three segments', 'acme/store/extra'],
    ['an empty owner', '/store'],
    ['an empty name', 'acme/'],
] as const;

function makeServices(createdFullName = 'skukla/brand-new') {
    return {
        githubFileOps: {},
        githubRepoOps: {
            createFromTemplate: jest.fn().mockResolvedValue({
                htmlUrl: `https://github.com/${createdFullName}`,
                fullName: createdFullName,
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

async function run(
    edsConfig: StorefrontSetupStartPayload['edsConfig'],
    services: SetupServices = makeServices(),
    repoInfo: RepoInfo = { repoOwner: '', repoName: '', repoUrl: '' },
): Promise<{ context: HandlerContext; services: SetupServices; repoInfo: RepoInfo }> {
    const context = makeContext();
    await executePhaseGitHubRepo(
        context,
        edsConfig,
        services,
        repoInfo,
        new AbortController().signal,
        TEMPLATE.owner,
        TEMPLATE.repo,
        undefined,
    );
    return { context, services, repoInfo };
}

const sentPayloads = (context: HandlerContext) =>
    (context.sendMessage as jest.Mock).mock.calls
        .filter(([type]) => type === 'storefront-setup-progress')
        .map(([, payload]) => payload);

beforeEach(() => {
    jest.clearAllMocks();
    mockResolve.mockResolvedValue({ kind: 'installed', codeStatus: 200 });
    mockPin.mockResolvedValue(true);
});

describe('the repo the SC PICKED (selectedRepo.fullName)', () => {
    const pick = (fullName: string) =>
        config({
            repoMode: 'existing',
            selectedRepo: { fullName, htmlUrl: `https://github.com/${fullName}` },
        });

    it('splits a well-formed name into owner and repo', async () => {
        const { repoInfo } = await run(pick('acme-corp/storefront-demo'));

        expect(repoInfo).toEqual({
            repoOwner: 'acme-corp',
            repoName: 'storefront-demo',
            repoUrl: 'https://github.com/acme-corp/storefront-demo',
        });
    });

    it.each(MALFORMED)('refuses %s', async (_label, fullName) => {
        await expect(run(pick(fullName))).rejects.toThrow(
            'Selected repo fullName must be in owner/repo format',
        );
    });

    it('takes precedence over a typed existingRepo', async () => {
        const { repoInfo } = await run(
            config({
                repoMode: 'existing',
                selectedRepo: { fullName: 'acme/picked', htmlUrl: 'https://github.com/acme/picked' },
                existingRepo: 'other/typed',
            }),
        );

        expect(repoInfo.repoName).toBe('picked');
    });
});

describe('the repo the SC TYPED (existingRepo)', () => {
    const typed = (existingRepo: string) => config({ repoMode: 'existing', existingRepo });

    it('splits a well-formed name and builds its URL', async () => {
        const { repoInfo } = await run(typed('acme-corp/storefront-demo'));

        expect(repoInfo).toEqual({
            repoOwner: 'acme-corp',
            repoName: 'storefront-demo',
            repoUrl: 'https://github.com/acme-corp/storefront-demo',
        });
    });

    it.each(MALFORMED)('refuses %s', async (_label, existingRepo) => {
        await expect(run(typed(existingRepo))).rejects.toThrow(
            'Existing repo must be in owner/repo format',
        );
    });

    it('reaches the final ready message once the App gate passes', async () => {
        // The gate returns null when the App is installed, and a null result
        // must NOT be treated as a reason to stop — the phase still has to
        // report the repository ready.
        const { context } = await run(typed('acme-corp/storefront-demo'));

        expect(sentPayloads(context).at(-1)).toMatchObject({
            message: 'Repository ready',
            progress: 15,
        });
    });

    it('stops before the ready message when the App check cannot be answered', async () => {
        // An undetermined check halts the phase: Phase 2 would otherwise write
        // into a repo the SC asked to preserve, on no evidence at all.
        mockResolve.mockResolvedValue({ kind: 'undetermined', httpStatus: 500 });

        const { context } = await run(typed('acme-corp/storefront-demo'));

        expect(sentPayloads(context).map((p) => p.message)).not.toContain('Repository ready');
    });
});

describe('the reset path', () => {
    const PATCH_FIELDS = {
        codePatches: ['product-link-sku-encoding'],
        codePatchSource: {
            owner: 'skukla',
            repo: 'eds-demo-patches',
            path: 'b2b',
            lkgFile: 'b2b/last-known-good',
        },
    };

    it('reaches the final ready message once the after-reset gate passes', async () => {
        const { context } = await run(
            config({
                repoMode: 'existing',
                existingRepo: 'acme/store',
                resetToTemplate: true,
                ...PATCH_FIELDS,
            }),
        );

        expect(sentPayloads(context).at(-1)).toMatchObject({
            message: 'Repository ready',
            progress: 15,
        });
    });

    it('announces the reset before performing it', async () => {
        const { context } = await run(
            config({
                repoMode: 'existing',
                existingRepo: 'acme/store',
                resetToTemplate: true,
                ...PATCH_FIELDS,
            }),
        );

        expect(sentPayloads(context)[1]).toEqual({
            phase: 'repository',
            message: 'Resetting repository to template...',
            subMessage: 'acme/store',
            progress: 6,
        });
    });

    it('pins a thin-layer storefront INSTEAD of resetting against template main', async () => {
        // The two are alternatives, not a sequence. A plain template reset would
        // land the repo on canonical HEAD with no canonical patches applied,
        // which is the half-patched state ADR-006 Step 4b exists to prevent.
        const { services } = await run(
            config({
                repoMode: 'existing',
                existingRepo: 'acme/store',
                resetToTemplate: true,
                ...PATCH_FIELDS,
            }),
        );

        expect(mockPin).toHaveBeenCalledTimes(1);
        expect(services.githubRepoOps.resetToTemplate).not.toHaveBeenCalled();
    });

    it('uses the plain template reset for a storefront with no patch source', async () => {
        // Forked storefronts have no canonical patches to apply, so the thin-layer
        // pin would have nothing to pin TO — they reset against template main.
        const { services } = await run(
            config({ repoMode: 'existing', existingRepo: 'acme/store', resetToTemplate: true }),
        );

        expect(services.githubRepoOps.resetToTemplate).toHaveBeenCalledWith(
            'acme',
            'store',
            TEMPLATE.owner,
            TEMPLATE.repo,
            'main',
            'chore: reset to template',
        );
    });
});

describe('creating a brand-new repo', () => {
    const NEW = { repoOwner: '', repoName: 'brand-new', repoUrl: '' };

    it('creates from the template and records what GitHub actually named it', async () => {
        // The requested name is not necessarily the created one — GitHub
        // de-duplicates — so the repo's own fullName is what the rest of the
        // pipeline must carry.
        const services = makeServices('skukla/brand-new-2');
        const { repoInfo } = await run(config({ repoMode: 'new' }), services, { ...NEW });

        expect(repoInfo).toEqual({
            repoOwner: 'skukla',
            repoName: 'brand-new-2',
            repoUrl: 'https://github.com/skukla/brand-new-2',
        });
    });

    it('reports creating, waiting and ready, in that order', async () => {
        const { context } = await run(config({ repoMode: 'new' }), makeServices(), { ...NEW });

        expect(sentPayloads(context).map((p) => p.message)).toEqual([
            'Creating GitHub repository from template...',
            'Waiting for repository content...',
            'Pinning to verified canonical state...',
            'Repository ready',
        ]);
        expect(sentPayloads(context)[0]).toEqual({
            phase: 'repository',
            message: 'Creating GitHub repository from template...',
            subMessage: 'brand-new',
            progress: 5,
        });
        expect(sentPayloads(context)[1]).toMatchObject({
            message: 'Waiting for repository content...',
            progress: 10,
            repoOwner: 'skukla',
            repoName: 'brand-new',
        });
    });

    it('waits for the content of the repo GitHub reported, not the one requested', async () => {
        const services = makeServices('skukla/brand-new-2');
        await run(config({ repoMode: 'new' }), services, { ...NEW });

        expect(services.githubRepoOps.waitForContent).toHaveBeenCalledWith(
            'skukla',
            'brand-new-2',
            expect.any(Object),
        );
    });

    it.each(MALFORMED)('refuses a created fullName with %s', async (_label, fullName) => {
        await expect(
            run(config({ repoMode: 'new' }), makeServices(fullName), { ...NEW }),
        ).rejects.toThrow('Created repo fullName must be in owner/repo format');
    });

    it('creates in the picked namespace, private only when asked', async () => {
        const services = makeServices();
        await run(
            config({ repoMode: 'new', isPrivate: true, daLiveOrg: 'acme-corp' }),
            services,
            { ...NEW },
        );

        expect(services.githubRepoOps.createFromTemplate).toHaveBeenCalledWith(
            TEMPLATE.owner,
            TEMPLATE.repo,
            'brand-new',
            true,
            'acme-corp',
        );
    });

    it('defaults to public, under the authenticated user, when neither was set', async () => {
        // `undefined` for the namespace is the legacy "create under the
        // authenticated user" signal; an empty string is not the same thing to
        // the GitHub API.
        const services = makeServices();
        await run(config({ repoMode: 'new', daLiveOrg: '' }), services, { ...NEW });

        expect(services.githubRepoOps.createFromTemplate).toHaveBeenCalledWith(
            TEMPLATE.owner,
            TEMPLATE.repo,
            'brand-new',
            false,
            undefined,
        );
    });
});
