/**
 * Tests for TemplateUpdateChecker — focused on the LKG branching introduced
 * by ADR-006 Step 3 (thin-layer storefront workstream).
 *
 * Branching contract:
 *   - Thin-layer storefront (`metadata.lkgSource` is set): compare
 *     `lastSyncedCommit` against the CURRENT LKG SHA read from the patches
 *     repo's `last-known-good` file. NOT the template repo's `main` HEAD.
 *     Up-to-date when LKG matches; updates offered when LKG has advanced.
 *   - Forked storefront (`lkgSource` absent): unchanged. Fetch template
 *     `main` HEAD and compare directly (legacy path).
 *   - Unreachable LKG → returns null (no update offered, no false positives).
 */

import { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types';
import type { Logger } from '@/types/logger';

// Mock the GitHub API client used for the forked path
jest.mock('@/features/updates/services/githubApiClient', () => ({
    getLatestBranchCommit: jest.fn(),
    compareCommits: jest.fn(),
}));

import {
    getLatestBranchCommit,
    compareCommits,
} from '@/features/updates/services/githubApiClient';

const mockGetLatestBranchCommit = getLatestBranchCommit as jest.Mock;
const mockCompareCommits = compareCommits as jest.Mock;

// Mock the LKG reader (path-dependent dynamic import inside checker)
jest.mock('@/features/eds/services/lkgReader', () => ({
    readLkgSha: jest.fn(),
}));

import { readLkgSha } from '@/features/eds/services/lkgReader';
const mockReadLkgSha = readLkgSha as jest.Mock;

const mockLogger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

const mockSecrets = {} as never;

const OLD_SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);

function makeProject(metadata: Record<string, unknown>): Project {
    return {
        name: 'test-storefront',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                metadata,
            },
        },
    } as unknown as Project;
}

beforeEach(() => {
    jest.clearAllMocks();
});

// ==========================================================================
// Thin-layer path (lkgSource is set)
// ==========================================================================

describe('checkForUpdates — thin-layer path', () => {
    const baseMetadata = {
        templateOwner: 'hlxsites',
        templateRepo: 'aem-boilerplate-commerce',
        lastSyncedCommit: OLD_SHA,
        lkgSource: { owner: 'skukla', repo: 'eds-demo-patches' },
    };

    it('reads LKG from the patches repo (NOT template main)', async () => {
        mockReadLkgSha.mockResolvedValue(OLD_SHA);
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);

        await checker.checkForUpdates(makeProject(baseMetadata));

        expect(mockReadLkgSha).toHaveBeenCalledWith(
            { owner: 'skukla', repo: 'eds-demo-patches' },
            mockLogger,
        );
        // Forked-path API must not have been called
        expect(mockGetLatestBranchCommit).not.toHaveBeenCalled();
    });

    it('reports up-to-date when LKG matches lastSyncedCommit', async () => {
        mockReadLkgSha.mockResolvedValue(OLD_SHA);
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);

        const result = await checker.checkForUpdates(makeProject(baseMetadata));

        expect(result).toEqual({
            hasUpdates: false,
            currentCommit: OLD_SHA,
            latestCommit: OLD_SHA,
            commitsBehind: 0,
            templateOwner: 'hlxsites',
            templateRepo: 'aem-boilerplate-commerce',
        });
        expect(mockCompareCommits).not.toHaveBeenCalled();
    });

    it('reports update available when LKG has advanced past lastSyncedCommit', async () => {
        mockReadLkgSha.mockResolvedValue(NEW_SHA);
        mockCompareCommits.mockResolvedValue({ ahead_by: 3 });
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);

        const result = await checker.checkForUpdates(makeProject(baseMetadata));

        expect(result).toEqual({
            hasUpdates: true,
            currentCommit: OLD_SHA,
            latestCommit: NEW_SHA,
            commitsBehind: 3,
            templateOwner: 'hlxsites',
            templateRepo: 'aem-boilerplate-commerce',
        });
        // Comparison is against the LKG SHA, not main HEAD
        expect(mockCompareCommits).toHaveBeenCalledWith(
            mockSecrets, 'hlxsites', 'aem-boilerplate-commerce',
            OLD_SHA, NEW_SHA,
        );
    });

    it('does NOT offer update when canonical main is ahead of LKG (the load-bearing assertion)', async () => {
        // Scenario: canonical main is at NEW_SHA, but the drift-gate hasn't
        // verified it yet, so LKG is still at OLD_SHA. Storefront is up-to-date.
        mockReadLkgSha.mockResolvedValue(OLD_SHA);  // LKG still at OLD
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);

        const result = await checker.checkForUpdates(makeProject(baseMetadata));

        expect(result?.hasUpdates).toBe(false);
        // CRITICAL: we did NOT consult template main HEAD; if we had, we'd
        // see NEW_SHA there and falsely offer an update for an unverified state.
        expect(mockGetLatestBranchCommit).not.toHaveBeenCalled();
    });

    it('returns null when LKG fetch fails (no false-positive "up to date" or "update available")', async () => {
        mockReadLkgSha.mockResolvedValue(undefined);
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);

        const result = await checker.checkForUpdates(makeProject(baseMetadata));

        expect(result).toBeNull();
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('LKG unreachable'),
        );
    });
});

// ==========================================================================
// Forked path (lkgSource absent — legacy / pre-ADR-006 storefronts)
// ==========================================================================

describe('checkForUpdates — forked path (legacy)', () => {
    const baseMetadata = {
        templateOwner: 'skukla',
        templateRepo: 'isle5',
        lastSyncedCommit: OLD_SHA,
        // No lkgSource — this is a forked, non-thin-layer storefront
    };

    it('falls through to template main HEAD when lkgSource is absent (unchanged behavior)', async () => {
        mockGetLatestBranchCommit.mockResolvedValue(OLD_SHA);
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);

        await checker.checkForUpdates(makeProject(baseMetadata));

        expect(mockGetLatestBranchCommit).toHaveBeenCalledWith(
            mockSecrets, 'skukla', 'isle5', 'main',
        );
        // LKG reader must NOT have been called for forked path
        expect(mockReadLkgSha).not.toHaveBeenCalled();
    });

    it('reports up-to-date when template main matches lastSyncedCommit', async () => {
        mockGetLatestBranchCommit.mockResolvedValue(OLD_SHA);
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);

        const result = await checker.checkForUpdates(makeProject(baseMetadata));

        expect(result?.hasUpdates).toBe(false);
        expect(result?.currentCommit).toBe(OLD_SHA);
        expect(result?.latestCommit).toBe(OLD_SHA);
    });

    it('reports update available when template main has advanced', async () => {
        mockGetLatestBranchCommit.mockResolvedValue(NEW_SHA);
        mockCompareCommits.mockResolvedValue({ ahead_by: 5 });
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);

        const result = await checker.checkForUpdates(makeProject(baseMetadata));

        expect(result?.hasUpdates).toBe(true);
        expect(result?.commitsBehind).toBe(5);
    });
});

// ==========================================================================
// Common preconditions (apply to both paths)
// ==========================================================================

describe('checkForUpdates — preconditions', () => {
    it('returns null when no EDS instance is present', async () => {
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);
        const result = await checker.checkForUpdates({
            name: 'no-eds',
            componentInstances: {},
        } as unknown as Project);
        expect(result).toBeNull();
    });

    it('returns null when templateOwner/templateRepo are missing', async () => {
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);
        const result = await checker.checkForUpdates(makeProject({
            lastSyncedCommit: OLD_SHA,
        }));
        expect(result).toBeNull();
    });

    it('returns null when lastSyncedCommit is missing', async () => {
        const checker = new TemplateUpdateChecker(mockSecrets, mockLogger);
        const result = await checker.checkForUpdates(makeProject({
            templateOwner: 'a',
            templateRepo: 'b',
        }));
        expect(result).toBeNull();
    });
});
