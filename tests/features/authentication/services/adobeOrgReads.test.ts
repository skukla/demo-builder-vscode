/**
 * Organization reads: SDK-first with the CLI fallback, and the SDK-only probe.
 *
 * Split 2026-10-08 from adobeEntityCollaborators.test.ts (EDS-8).
 */

import {
    setupEntityCollaborators,
    type EntityCollaborators,
} from './adobeEntityCollaborators.testUtils';

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';

describe('organization reads', () => {
    let entities: EntityCollaborators;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let onNoOrgsAccessible: jest.Mock;

    beforeEach(() => {
        ({
            entities,
            mockCommandExecutor,
            mockSDKClient,
            mockCacheManager,
            onNoOrgsAccessible,
        } = setupEntityCollaborators());
    });

    describe('getOrganizations()', () => {
        it('should return cached organizations if available', async () => {
            const cachedOrgs = [{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' }];
            mockCacheManager.getCachedOrgList.mockReturnValue(cachedOrgs);

            const result = await entities.orgReads.getOrganizations();

            expect(result).toEqual(cachedOrgs);
            expect(mockSDKClient.isInitialized).not.toHaveBeenCalled();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should fetch via SDK when initialized', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({
                    body: [
                        { id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org 1' },
                        { id: 'org2', code: 'ORG2@AdobeOrg', name: 'Org 2' },
                    ],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.orgReads.getOrganizations();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('org1');
            expect(result[0].name).toBe('Org 1');
            expect(mockCacheManager.setCachedOrgList).toHaveBeenCalledWith(result);
        });

        it('should fallback to CLI when SDK fails', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'CLI Org' }]),
                stderr: '',
                code: 0,
                duration: 0,
            });

            const result = await entities.orgReads.getOrganizations();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('CLI Org');
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console org list --json',
                expect.any(Object)
            );
        });

        it('should fall back to CLI when the SDK call exceeds the deadline', async () => {
            // A stalled Adobe endpoint must not hang the wizard: cap the SDK attempt
            // and fall back to the (fast) CLI instead of riding the ~60s remote ceiling.
            jest.useFakeTimers();
            try {
                mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
                mockSDKClient.isInitialized.mockReturnValue(true);
                mockSDKClient.getClient.mockReturnValue({
                    // Never resolves — simulates the stalled org-list endpoint.
                    getOrganizations: jest.fn().mockReturnValue(new Promise(() => {})),
                } as ReturnType<typeof mockSDKClient.getClient>);

                mockCommandExecutor.execute.mockResolvedValue({
                    stdout: JSON.stringify([
                        { id: 'org1', code: 'ORG1@AdobeOrg', name: 'CLI Org' },
                    ]),
                    stderr: '',
                    code: 0,
                    duration: 0,
                });

                const resultPromise = entities.orgReads.getOrganizations();
                await jest.advanceTimersByTimeAsync(TIMEOUTS.SDK_ENTITY_FETCH + 1);
                const result = await resultPromise;

                expect(result).toHaveLength(1);
                expect(result[0].name).toBe('CLI Org');
                expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                    'aio console org list --json',
                    expect.any(Object)
                );
            } finally {
                jest.useRealTimers();
            }
        });

        it('should fallback to CLI when SDK not initialized', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'CLI Org' }]),
                stderr: '',
                code: 0,
                duration: 0,
            });

            const result = await entities.orgReads.getOrganizations();

            expect(result).toHaveLength(1);
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
        });

        it('should call onNoOrgsAccessible when no organizations available', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([]),
                stderr: '',
                code: 0,
                duration: 0,
            });

            const result = await entities.orgReads.getOrganizations();

            expect(result).toHaveLength(0);
            expect(onNoOrgsAccessible).toHaveBeenCalled();
        });

        // An empty CLI answer can be a FAILED probe; cached, it would read as "the token
        // reaches no orgs" to the cache-first SDK-only reader until the TTL expired.
        it('does not cache an empty org list', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: JSON.stringify([]),
                stderr: '',
                code: 0,
                duration: 0,
            });

            await entities.orgReads.getOrganizations();

            expect(mockCacheManager.setCachedOrgList).not.toHaveBeenCalled();
        });

        it('should throw on CLI failure', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: '',
                stderr: 'Command failed',
                code: 1,
                duration: 0,
            });

            await expect(entities.orgReads.getOrganizations()).rejects.toThrow('Failed to get organizations');
        });
    });

    describe('getOrganizationsSdkOnly()', () => {
        it('returns the cached org list without touching SDK or CLI', async () => {
            const cachedOrgs = [{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Organization 1' }];
            mockCacheManager.getCachedOrgList.mockReturnValue(cachedOrgs);

            const result = await entities.orgReads.getOrganizationsSdkOnly();

            expect(result).toEqual(cachedOrgs);
            expect(mockSDKClient.isInitialized).not.toHaveBeenCalled();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('fetches via SDK when initialized and caches the non-empty result', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({
                    body: [{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org 1' }],
                }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.orgReads.getOrganizationsSdkOnly();

            expect(result).toHaveLength(1);
            expect(result?.[0]?.id).toBe('org1');
            expect(mockCacheManager.setCachedOrgList).toHaveBeenCalledWith(result);
            // P1: never the CLI fallback.
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('returns [] WITHOUT the CLI fallback when the SDK call fails', async () => {
            // The whole point of the SDK-only path: a failed SDK read must degrade
            // to `undefined` ("could not answer" → "unknown") and must NEVER run
            // `aio console org list` (which can stall ~14.5s and launch a browser
            // on open). P1. NOT [] — an empty array is a real answer (the token
            // reaches no Console orgs) and drives the org-switch recovery instead.
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockRejectedValue(new Error('SDK error')),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.orgReads.getOrganizationsSdkOnly();

            expect(result).toBeUndefined();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            // Must not poison the shared org-list cache with a degraded result.
            expect(mockCacheManager.setCachedOrgList).not.toHaveBeenCalled();
        });

        it('returns undefined WITHOUT the CLI fallback when the SDK is not initialized', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false);

            const result = await entities.orgReads.getOrganizationsSdkOnly();

            expect(result).toBeUndefined();
            expect(mockSDKClient.ensureInitialized).toHaveBeenCalled();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('returns a REAL empty list as [] (distinguishable from a failed read)', async () => {
            // Leah's case (2026-08-13): the SDK answered successfully with zero
            // orgs. That must come back as [], not undefined — the dashboard
            // check maps [] to the org-mismatch warning (forced Switch IMS Org).
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(true);
            mockSDKClient.getClient.mockReturnValue({
                getOrganizations: jest.fn().mockResolvedValue({ body: [] }),
            } as ReturnType<typeof mockSDKClient.getClient>);

            const result = await entities.orgReads.getOrganizationsSdkOnly();

            expect(result).toStrictEqual([]);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(mockCacheManager.setCachedOrgList).not.toHaveBeenCalled();
        });

        it('does not call onNoOrgsAccessible on an empty SDK read', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);
            mockSDKClient.ensureInitialized.mockResolvedValue(false);

            await entities.orgReads.getOrganizationsSdkOnly();

            expect(onNoOrgsAccessible).not.toHaveBeenCalled();
        });
    });

    describe('getOrganizations() - CLI output with warnings', () => {
        it('should parse JSON when CLI stdout has warnings for organizations', async () => {
            mockCacheManager.getCachedOrgList.mockReturnValue(undefined);
            mockSDKClient.isInitialized.mockReturnValue(false);

            const warningLines = ' ›   Warning: update available\n';
            const jsonData = JSON.stringify([{ id: 'org1', code: 'ORG1@AdobeOrg', name: 'Org 1' }]);

            mockCommandExecutor.execute.mockResolvedValue({
                stdout: warningLines + jsonData,
                stderr: '',
                code: 2,
                duration: 0,
            });

            const result = await entities.orgReads.getOrganizations();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Org 1');
        });
    });
});
