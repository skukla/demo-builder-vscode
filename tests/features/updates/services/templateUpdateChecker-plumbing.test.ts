/**
 * TemplateUpdateChecker — the metadata gate and what each path hands its collaborators.
 *
 * The sibling suite pins the ADR-006 branching contract (LKG vs template main). This
 * one pins the edges around it: which metadata shapes are refused before any request
 * is made (each required field on its own, every malformed lkgSource shape), the exact
 * lkgSource object handed to the LKG reader, the compare arguments, the shape returned
 * when the comparison cannot be made, and a throwing collaborator answering null.
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
import { TemplateUpdateChecker } from '@/features/updates/services/templateUpdateChecker';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';

const mockGetLatestBranchCommit = getLatestBranchCommit as jest.Mock;
const mockCompareCommits = compareCommits as jest.Mock;
const mockReadLkgSha = readLkgSha as jest.Mock;

const OLD_SHA = 'a'.repeat(40);
const NEW_SHA = 'b'.repeat(40);
const OWNER = 'hlxsites';
const REPO = 'aem-boilerplate-commerce';
const LKG = { owner: 'skukla', repo: 'eds-demo-patches' };

let logger: ReturnType<typeof createMockLogger>;
let secrets: ReturnType<typeof createMockSecretStorage>['secrets'];
let checker: TemplateUpdateChecker;

function projectWith(metadata: Record<string, unknown> | undefined): Project {
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

const complete = { templateOwner: OWNER, templateRepo: REPO, lastSyncedCommit: OLD_SHA };

beforeEach(() => {
    jest.clearAllMocks();
    logger = createMockLogger();
    secrets = createMockSecretStorage().secrets;
    checker = new TemplateUpdateChecker(secrets, logger);
    mockGetLatestBranchCommit.mockResolvedValue(NEW_SHA);
    mockReadLkgSha.mockResolvedValue(NEW_SHA);
    mockCompareCommits.mockResolvedValue({ ahead_by: 2 });
});

function expectNothingAsked(): void {
    expect(mockReadLkgSha).not.toHaveBeenCalled();
    expect(mockGetLatestBranchCommit).not.toHaveBeenCalled();
    expect(mockCompareCommits).not.toHaveBeenCalled();
}

describe('the metadata gate — refused before any request', () => {
    it('a project with no component instances at all', async () => {
        const project = createMockProject({ name: 'bare', componentInstances: undefined });

        await expect(checker.checkForUpdates(project)).resolves.toBeNull();
        expectNothingAsked();
    });

    it('an EDS instance that carries no metadata', async () => {
        await expect(checker.checkForUpdates(projectWith(undefined))).resolves.toBeNull();
        expectNothingAsked();
    });

    it.each([
        ['templateOwner', { ...complete, templateOwner: undefined }],
        ['templateRepo', { ...complete, templateRepo: undefined }],
        ['lastSyncedCommit', { ...complete, lastSyncedCommit: undefined }],
        ['an empty lastSyncedCommit', { ...complete, lastSyncedCommit: '' }],
    ])('missing %s, with the other fields present', async (_label, metadata) => {
        await expect(checker.checkForUpdates(projectWith(metadata))).resolves.toBeNull();
        expectNothingAsked();
    });
});

describe('the lkgSource shape decides the path', () => {
    it.each([
        ['a string', 'skukla/eds-demo-patches'],
        ['null', null],
        ['a non-string owner', { owner: 1, repo: 'eds-demo-patches' }],
        ['a non-string repo', { owner: 'skukla', repo: 2 }],
        ['a non-string lkgFile', { ...LKG, lkgFile: 5 }],
    ])(
        '%s is not an lkgSource: the forked path runs and the LKG reader is never asked',
        async (_label, lkgSource) => {
            await checker.checkForUpdates(projectWith({ ...complete, lkgSource }));

            expect(mockReadLkgSha).not.toHaveBeenCalled();
            expect(mockGetLatestBranchCommit).toHaveBeenCalledWith(secrets, OWNER, REPO, 'main');
        }
    );

    it('owner and repo alone are enough: handed to the reader as-is with the logger', async () => {
        await checker.checkForUpdates(projectWith({ ...complete, lkgSource: LKG }));

        expect(mockReadLkgSha).toHaveBeenCalledWith(LKG, logger);
        expect(mockGetLatestBranchCommit).not.toHaveBeenCalled();
    });

    it('a string lkgFile travels with them', async () => {
        const withFile = { ...LKG, lkgFile: 'b2b/last-known-good' };

        await checker.checkForUpdates(projectWith({ ...complete, lkgSource: withFile }));

        expect(mockReadLkgSha).toHaveBeenCalledWith(withFile, logger);
    });
});

describe('thin-layer path', () => {
    const metadata = { ...complete, lkgSource: LKG };

    it('LKG advanced: compares lastSyncedCommit against the LKG SHA on the template repo', async () => {
        mockCompareCommits.mockResolvedValue({ ahead_by: 4 });

        const result = await checker.checkForUpdates(projectWith(metadata));

        expect(mockCompareCommits).toHaveBeenCalledWith(secrets, OWNER, REPO, OLD_SHA, NEW_SHA);
        expect(result).toEqual({
            hasUpdates: true,
            currentCommit: OLD_SHA,
            latestCommit: NEW_SHA,
            commitsBehind: 4,
            templateOwner: OWNER,
            templateRepo: REPO,
        });
    });

    it.each([
        ['the comparison fails', null],
        ['the comparison counts nothing', { ahead_by: 0 }],
    ])(
        'LKG advanced but %s: no update, zero behind, the LKG SHA still reported',
        async (_label, comparison) => {
            mockCompareCommits.mockResolvedValue(comparison);

            const result = await checker.checkForUpdates(projectWith(metadata));

            expect(result).toEqual({
                hasUpdates: false,
                currentCommit: OLD_SHA,
                latestCommit: NEW_SHA,
                commitsBehind: 0,
                templateOwner: OWNER,
                templateRepo: REPO,
            });
        }
    );

    it('a throwing LKG reader answers null rather than rejecting', async () => {
        mockReadLkgSha.mockRejectedValue(new Error('patches repo unreachable'));

        await expect(checker.checkForUpdates(projectWith(metadata))).resolves.toBeNull();
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});

describe('forked path', () => {
    it('up to date: the full shape, with no comparison made', async () => {
        mockGetLatestBranchCommit.mockResolvedValue(OLD_SHA);

        const result = await checker.checkForUpdates(projectWith(complete));

        expect(result).toEqual({
            hasUpdates: false,
            currentCommit: OLD_SHA,
            latestCommit: OLD_SHA,
            commitsBehind: 0,
            templateOwner: OWNER,
            templateRepo: REPO,
        });
        expect(mockCompareCommits).not.toHaveBeenCalled();
    });

    it('main advanced: compares lastSyncedCommit against main HEAD', async () => {
        mockCompareCommits.mockResolvedValue({ ahead_by: 5 });

        const result = await checker.checkForUpdates(projectWith(complete));

        expect(mockCompareCommits).toHaveBeenCalledWith(secrets, OWNER, REPO, OLD_SHA, NEW_SHA);
        expect(result).toEqual({
            hasUpdates: true,
            currentCommit: OLD_SHA,
            latestCommit: NEW_SHA,
            commitsBehind: 5,
            templateOwner: OWNER,
            templateRepo: REPO,
        });
    });

    it.each([
        ['the comparison fails', null],
        ['the comparison counts nothing', { ahead_by: 0 }],
    ])(
        'main advanced but %s: no update, zero behind, main HEAD still reported',
        async (_label, comparison) => {
            mockCompareCommits.mockResolvedValue(comparison);

            const result = await checker.checkForUpdates(projectWith(complete));

            expect(result).toEqual({
                hasUpdates: false,
                currentCommit: OLD_SHA,
                latestCommit: NEW_SHA,
                commitsBehind: 0,
                templateOwner: OWNER,
                templateRepo: REPO,
            });
        }
    );

    it('main HEAD unavailable: null, with no comparison made', async () => {
        mockGetLatestBranchCommit.mockResolvedValue(null);

        await expect(checker.checkForUpdates(projectWith(complete))).resolves.toBeNull();
        expect(mockCompareCommits).not.toHaveBeenCalled();
    });

    it('a throwing branch lookup answers null rather than rejecting', async () => {
        mockGetLatestBranchCommit.mockRejectedValue(new Error('boom'));

        await expect(checker.checkForUpdates(projectWith(complete))).resolves.toBeNull();
        expect(logger.error).toHaveBeenCalledTimes(1);
    });
});
