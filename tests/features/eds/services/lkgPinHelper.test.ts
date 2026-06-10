/**
 * Tests for the LKG pin helper — ADR-006 Step 4b. The helper closes the
 * create/reset asymmetry by post-create-pinning a thin-layer storefront
 * repo to canonical@LKG with canonical-phase code patches applied. After
 * Step 4b ships, create produces a byte-identical result to reset.
 */

import { pinRepoToLkg } from '@/features/eds/services/lkgPinHelper';
import { createPatchReport, type PatchReport } from '@/features/eds/services/patchReportHelper';
import type { Logger } from '@/types/logger';
import type { GitHubFileOperations } from '@/features/eds/services/githubFileOperations';

// Mock the LKG reader + canonical patcher dependencies the helper composes.
jest.mock('@/features/eds/services/lkgReader', () => ({
    readLkgSha: jest.fn(),
}));
jest.mock('@/features/eds/services/codePatchPipelineHelpers', () => ({
    applyCanonicalCodePatches: jest.fn(),
}));

import { readLkgSha } from '@/features/eds/services/lkgReader';
import { applyCanonicalCodePatches } from '@/features/eds/services/codePatchPipelineHelpers';

const mockReadLkgSha = readLkgSha as jest.Mock;
const mockApplyCanonicalCodePatches = applyCanonicalCodePatches as jest.Mock;

const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

function makeMockGithubFileOps(): GitHubFileOperations {
    return {
        resetRepoToTemplate: jest.fn().mockResolvedValue({ commitSha: 'newcommit', fileCount: 2261 }),
    } as unknown as GitHubFileOperations;
}

const LKG_SHA = '760601940fa7264ea900c9d4b6bf735a5e78f46b';
const SOURCE = { owner: 'skukla', repo: 'eds-demo-patches', path: 'citisignal' };

beforeEach(() => {
    jest.clearAllMocks();
    mockApplyCanonicalCodePatches.mockResolvedValue([]);
});

// ==========================================================================
// Happy path
// ==========================================================================

describe('pinRepoToLkg — happy path', () => {
    it('reads LKG, applies canonical patches, and calls resetRepoToTemplate with LKG SHA', async () => {
        mockReadLkgSha.mockResolvedValue(LKG_SHA);
        const ops = makeMockGithubFileOps();

        const result = await pinRepoToLkg(
            {
                repoOwner: 'user',
                repoName: 'user-storefront',
                templateOwner: 'hlxsites',
                templateRepo: 'aem-boilerplate-commerce',
                codePatches: ['p1', 'p2'],
                codePatchSource: SOURCE,
            },
            ops,
            mockLogger,
        );

        expect(result).toBe(true);

        // LKG reader called against the patches repo (NOT the template).
        expect(mockReadLkgSha).toHaveBeenCalledWith(
            { owner: 'skukla', repo: 'eds-demo-patches' },
            mockLogger,
        );

        // Canonical patcher invoked with the fileOverrides map + patch list.
        expect(mockApplyCanonicalCodePatches).toHaveBeenCalledWith(
            expect.any(Map),  // fileOverrides
            'hlxsites', 'aem-boilerplate-commerce',
            ['p1', 'p2'],
            SOURCE,
            mockLogger,
        );

        // Bulk Tree reset called with templateRef = LKG SHA, target = user's repo.
        expect(ops.resetRepoToTemplate).toHaveBeenCalledWith(
            'hlxsites', 'aem-boilerplate-commerce',
            'user', 'user-storefront',
            expect.any(Map),  // fileOverrides (canonically patched)
            LKG_SHA,
        );
    });
});

// ==========================================================================
// Patch report aggregation
// ==========================================================================

describe('pinRepoToLkg — patch report', () => {
    it('routes canonical results into the shared patchReport for the toast surface', async () => {
        mockReadLkgSha.mockResolvedValue(LKG_SHA);
        mockApplyCanonicalCodePatches.mockResolvedValue([
            { patchId: 'p1', target: 'scripts/commerce.js', applied: true },
            { patchId: 'p2', target: 'head.html', applied: false, reason: 'Precondition not found' },
        ]);

        const report: PatchReport = createPatchReport();

        await pinRepoToLkg(
            {
                repoOwner: 'user', repoName: 'user-storefront',
                templateOwner: 'hlxsites', templateRepo: 'aem-boilerplate-commerce',
                codePatches: ['p1', 'p2'],
                codePatchSource: SOURCE,
                patchReport: report,
            },
            makeMockGithubFileOps(),
            mockLogger,
        );

        // Both canonical results land in the shared report — applied AND unapplied.
        // The orchestrator's reportUnapplied filters to unapplied for the toast;
        // we keep applied entries for diagnostics.
        expect(report.results).toHaveLength(2);
        expect(report.results.map(r => r.patchId)).toEqual(['p1', 'p2']);
        expect(report.results.find(r => r.patchId === 'p2')?.applied).toBe(false);
    });

    it('works without a patchReport (logs only, no aggregation)', async () => {
        mockReadLkgSha.mockResolvedValue(LKG_SHA);
        mockApplyCanonicalCodePatches.mockResolvedValue([
            { patchId: 'p', target: 'scripts/commerce.js', applied: false, reason: 'X' },
        ]);

        // No patchReport in params — should not throw.
        await expect(
            pinRepoToLkg(
                {
                    repoOwner: 'user', repoName: 'user-storefront',
                    templateOwner: 'hlxsites', templateRepo: 'aem-boilerplate-commerce',
                    codePatches: ['p'],
                    codePatchSource: SOURCE,
                },
                makeMockGithubFileOps(),
                mockLogger,
            ),
        ).resolves.toBe(true);
    });
});

// ==========================================================================
// Failure modes — ADR-006 D1 proceed-and-warn
// ==========================================================================

describe('pinRepoToLkg — LKG unreachable (D1 proceed-and-warn)', () => {
    it('returns false and skips the bulk reset when LKG fetch fails', async () => {
        mockReadLkgSha.mockResolvedValue(undefined);
        const ops = makeMockGithubFileOps();

        const result = await pinRepoToLkg(
            {
                repoOwner: 'user', repoName: 'user-storefront',
                templateOwner: 'hlxsites', templateRepo: 'aem-boilerplate-commerce',
                codePatches: ['p'],
                codePatchSource: SOURCE,
            },
            ops,
            mockLogger,
        );

        expect(result).toBe(false);
        expect(mockApplyCanonicalCodePatches).not.toHaveBeenCalled();
        expect(ops.resetRepoToTemplate).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('LKG unreachable'),
        );
    });

    it('re-throws if the bulk Tree reset itself fails (can\'t leave repo half-pinned)', async () => {
        mockReadLkgSha.mockResolvedValue(LKG_SHA);
        const ops = {
            resetRepoToTemplate: jest.fn().mockRejectedValue(new Error('GitHub 422 — tree creation failed')),
        } as unknown as GitHubFileOperations;

        await expect(
            pinRepoToLkg(
                {
                    repoOwner: 'user', repoName: 'user-storefront',
                    templateOwner: 'hlxsites', templateRepo: 'aem-boilerplate-commerce',
                    codePatches: ['p'],
                    codePatchSource: SOURCE,
                },
                ops,
                mockLogger,
            ),
        ).rejects.toThrow('GitHub 422 — tree creation failed');
    });
});

// ==========================================================================
// Argument contract — confirms target/template separation (defensive)
// ==========================================================================

describe('pinRepoToLkg — target/template separation', () => {
    it('passes the storefront repo as target and canonical as template (NOT the other way around)', async () => {
        mockReadLkgSha.mockResolvedValue(LKG_SHA);
        const ops = makeMockGithubFileOps();

        await pinRepoToLkg(
            {
                repoOwner: 'storefront-owner', repoName: 'storefront-repo',
                templateOwner: 'canonical-owner', templateRepo: 'canonical-repo',
                codePatches: ['p'],
                codePatchSource: SOURCE,
            },
            ops,
            mockLogger,
        );

        // resetRepoToTemplate signature: (templateOwner, templateRepo, targetOwner, targetRepo, fileOverrides, templateRef)
        // The hot fix on 550ada90 separated target branch from template ref;
        // this test pins the helper's args to the correct slots.
        expect(ops.resetRepoToTemplate).toHaveBeenCalledWith(
            'canonical-owner',   // templateOwner
            'canonical-repo',    // templateRepo
            'storefront-owner',  // targetOwner
            'storefront-repo',   // targetRepo
            expect.any(Map),
            LKG_SHA,             // templateRef = LKG SHA
        );
    });
});
