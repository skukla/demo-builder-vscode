/**
 * Phase 1 LKG-pin coverage — ADR-006 Step 4b enforcement.
 *
 * The Step 4b commit (`4e066fc0`) added a pin step to two of the three
 * branches inside `executePhaseGitHubRepo`:
 *
 *   - `executePhaseNewRepo` (fresh-create inside Phase 1) — pinned. OK.
 *   - `executePhaseExistingRepo` with `resetToTemplate: true` — pinned. OK.
 *   - `usePreCreatedRepo` (wizard's "Create Repository" button created the
 *     repo BEFORE storefront setup runs) — NOT pinned. Step 4b's bug.
 *
 * The pre-created branch is what the b2b smoke test on 2026-06-10 took:
 * the wizard created the repo from `adobe-commerce/boilerplate-b2b-template`
 * at the GitHubRepoSelectionStep, then storefront setup ran and skipped the
 * pin entirely. Only block-phase patches landed (the 2 universal ones); the
 * 3 canonical-phase SKU/slash patches silently did NOT apply, leaving the
 * b2b storefront in a half-patched state.
 *
 * These tests guard against that regression for each branch.
 */

import { executePhaseGitHubRepo } from '@/features/eds/handlers/storefrontSetupPhase1';
import type { HandlerContext } from '@/types/handlers';
import type { RepoInfo, SetupServices } from '@/features/eds/handlers/storefrontSetupTypes';
import type { StorefrontSetupStartPayload } from '@/features/eds/handlers/storefrontSetupHandlers';

// Mock the pin helper at the lkg module boundary — the helper is the
// observable side-effect we care about; everything below it is covered by
// `lkgPinHelper.test.ts`.
jest.mock('@/features/eds/services/lkgPinHelper', () => ({
    pinRepoToLkg: jest.fn().mockResolvedValue(true),
}));
import { pinRepoToLkg } from '@/features/eds/services/lkgPinHelper';
const mockPinRepoToLkg = pinRepoToLkg as jest.Mock;

function makeContext(): HandlerContext {
    return {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        sendMessage: jest.fn().mockResolvedValue(undefined),
        context: { secrets: {}, globalState: { get: jest.fn(), update: jest.fn() } },
    } as unknown as HandlerContext;
}

function makeServices(): SetupServices {
    return {
        githubFileOps: {} as unknown,
        githubRepoOps: {
            createFromTemplate: jest.fn(),
            waitForContent: jest.fn(),
            resetToTemplate: jest.fn(),
        },
    } as unknown as SetupServices;
}

const THIN_LAYER_CONFIG_PATCH_FIELDS = {
    codePatches: ['header-nav-tools-defensive', 'product-link-sku-encoding'],
    codePatchSource: {
        owner: 'skukla',
        repo: 'eds-demo-patches',
        path: 'b2b',
        lkgFile: 'b2b/last-known-good',
    },
};

const FRESH_REPO_INFO: RepoInfo = { repoOwner: '', repoName: '', repoUrl: '' };
const TEMPLATE = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };

beforeEach(() => {
    jest.clearAllMocks();
});

describe('executePhaseGitHubRepo — Step 4b pin coverage', () => {
    describe('usePreCreatedRepo branch (wizard "Create Repository" button)', () => {
        it('pins to LKG when codePatchSource is configured (the b2b regression)', async () => {
            // The wizard already created the repo from template; Phase 1 now
            // runs and must NOT skip the pin step just because the repo exists.
            const edsConfig = {
                repoMode: 'new',
                createdRepo: { owner: 'skukla', name: 'b2b-tester', url: 'https://github.com/skukla/b2b-tester' },
                ...THIN_LAYER_CONFIG_PATCH_FIELDS,
            } as unknown as StorefrontSetupStartPayload['edsConfig'];

            await executePhaseGitHubRepo(
                makeContext(),
                edsConfig,
                makeServices(),
                { ...FRESH_REPO_INFO },
                new AbortController().signal,
                TEMPLATE.owner,
                TEMPLATE.repo,
                undefined,
            );

            expect(mockPinRepoToLkg).toHaveBeenCalledTimes(1);
            const callArgs = mockPinRepoToLkg.mock.calls[0][0];
            expect(callArgs).toMatchObject({
                repoOwner: 'skukla',
                repoName: 'b2b-tester',
                templateOwner: 'adobe-commerce',
                templateRepo: 'boilerplate-b2b-template',
                codePatches: THIN_LAYER_CONFIG_PATCH_FIELDS.codePatches,
                codePatchSource: THIN_LAYER_CONFIG_PATCH_FIELDS.codePatchSource,
            });
        });

        it('does NOT pin for forked storefronts (no codePatchSource)', async () => {
            // Legacy/forked storefronts should keep their template HEAD; no
            // pin step. `pinIfThinLayer` guards on codePatchSource presence
            // — verify the branch wiring honors that.
            const edsConfig = {
                repoMode: 'new',
                createdRepo: { owner: 'skukla', name: 'legacy-fork', url: 'https://github.com/skukla/legacy-fork' },
                // codePatches / codePatchSource intentionally absent
            } as unknown as StorefrontSetupStartPayload['edsConfig'];

            await executePhaseGitHubRepo(
                makeContext(),
                edsConfig,
                makeServices(),
                { ...FRESH_REPO_INFO },
                new AbortController().signal,
                TEMPLATE.owner,
                TEMPLATE.repo,
                undefined,
            );

            expect(mockPinRepoToLkg).not.toHaveBeenCalled();
        });

        it('emits the "Pinning to verified canonical state..." progress message', async () => {
            // Locks down the UX signal — without this message users see no
            // hint that a pin is happening; failures look like silent stalls.
            const ctx = makeContext();
            const edsConfig = {
                repoMode: 'new',
                createdRepo: { owner: 'skukla', name: 'b2b-tester', url: 'https://github.com/skukla/b2b-tester' },
                ...THIN_LAYER_CONFIG_PATCH_FIELDS,
            } as unknown as StorefrontSetupStartPayload['edsConfig'];

            await executePhaseGitHubRepo(
                ctx, edsConfig, makeServices(), { ...FRESH_REPO_INFO },
                new AbortController().signal, TEMPLATE.owner, TEMPLATE.repo, undefined,
            );

            const sendMessage = ctx.sendMessage as jest.Mock;
            const pinMessage = sendMessage.mock.calls.find(
                ([type, payload]) => type === 'storefront-setup-progress'
                    && payload?.message === 'Pinning to verified canonical state...',
            );
            expect(pinMessage).toBeDefined();
            expect(pinMessage?.[1]).toMatchObject({ progress: 12 });
        });
    });
});
