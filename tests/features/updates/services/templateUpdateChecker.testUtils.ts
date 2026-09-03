/**
 * Shared setup for the templateUpdateChecker family (ADR-016 / PL-14).
 *
 * The mock wall both suites need — the GitHub client and the LKG reader — plus the
 * EDS-project builder both were declaring, and the SHA constants both compare.
 *
 * Import this FIRST in a suite: the jest.mock calls register when this file's body
 * runs, which must happen before the subject binds to the real client.
 */

jest.mock('@/features/updates/services/githubApiClient', () => ({
    getLatestBranchCommit: jest.fn(),
    compareCommits: jest.fn(),
}));

jest.mock('@/features/eds/services/patches/lkgReader', () => ({
    readLkgSha: jest.fn(),
}));

import { COMPONENT_IDS } from '@/core/constants';
import { readLkgSha } from '@/features/eds/services/patches/lkgReader';
import { compareCommits, getLatestBranchCommit } from '@/features/updates/services/githubApiClient';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

export { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';

export const mockGetLatestBranchCommit = getLatestBranchCommit as jest.Mock;
export const mockCompareCommits = compareCommits as jest.Mock;
export const mockReadLkgSha = readLkgSha as jest.Mock;

export const OLD_SHA = 'a'.repeat(40);
export const NEW_SHA = 'b'.repeat(40);

/** A project whose EDS storefront carries `metadata` — or no metadata at all when omitted. */
export function edsProject(metadata?: Record<string, unknown>): Project {
    return createMockProject({
        name: 'test-storefront',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                status: 'ready',
                ...(metadata ? { metadata } : {}),
            },
        },
    });
}
