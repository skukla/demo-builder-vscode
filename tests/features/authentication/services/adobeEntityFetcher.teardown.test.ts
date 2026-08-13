/**
 * AdobeEntityFetcher — Console-project teardown SDK wrappers (delete-aio-project)
 *
 * The Console-SDK-side support methods for project teardown:
 * - getWorkspaceS2SCredential(orgId, projectId, workspaceId) — list-only S2S lookup
 * - createWorkspaceS2SCredentialFor(orgId, projectId, workspaceId) — explicit-args create
 * - ensureOAuthCredentialId — now delegates to the two methods above (behavior unchanged)
 * - deleteConsoleProject(orgId, projectId) — SDK deleteProject; errors propagate unchanged
 *
 * The SDK is MOCKED via the SDK client's getClient() — no live Adobe calls.
 * Teardown needs BOTH ids of the S2S credential: `client_id` (the apiKey that
 * aio-lib-events init takes) and `id_integration` (what subscribe calls take).
 */

import { AdobeEntityFetcher } from '@/features/authentication/services/adobeEntityFetcher';
import type { CommandExecutor } from '@/core/shell';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { StepLogger } from '@/core/logging';
import type { Logger } from '@/types/logger';

jest.mock('@/core/logging');

import { getLogger } from '@/core/logging';

describe('AdobeEntityFetcher — teardown SDK wrappers', () => {
    let fetcher: AdobeEntityFetcher;
    let mockSDKClient: jest.Mocked<AdobeSDKClient>;
    let sdk: {
        getCredentials: jest.Mock;
        createOAuthServerToServerCredential: jest.Mock;
        deleteProject: jest.Mock;
    };

    beforeEach(() => {
        (getLogger as jest.Mock).mockReturnValue({
            trace: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        });

        sdk = {
            getCredentials: jest.fn(),
            createOAuthServerToServerCredential: jest.fn(),
            deleteProject: jest.fn(),
        };

        mockSDKClient = {
            isInitialized: jest.fn().mockReturnValue(true),
            getClient: jest.fn().mockReturnValue(sdk),
            ensureInitialized: jest.fn().mockResolvedValue(true),
        } as unknown as jest.Mocked<AdobeSDKClient>;

        // A cacheManager that would return DIFFERENT ids than the explicit args,
        // to prove the teardown methods use the args passed in, not the cache.
        const mockCacheManager = {
            getCachedOrganization: jest.fn().mockReturnValue({ id: 'cache-org' }),
            getCachedProject: jest.fn().mockReturnValue({ id: 'cache-proj' }),
            getCachedWorkspace: jest.fn().mockReturnValue({ id: 'cache-ws' }),
        } as unknown as jest.Mocked<AuthCacheManager>;

        fetcher = new AdobeEntityFetcher(
            { execute: jest.fn() } as unknown as jest.Mocked<CommandExecutor>,
            mockSDKClient,
            mockCacheManager,
            { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as jest.Mocked<Logger>,
            { logTemplate: jest.fn() } as unknown as jest.Mocked<StepLogger>,
        );
    });

    describe('getWorkspaceS2SCredential', () => {
        it('should return both ids when an S2S credential exists', async () => {
            sdk.getCredentials.mockResolvedValue({
                body: [
                    { integration_type: 'apikey', client_id: 'apikey-client', id_integration: 'apikey-int' },
                    { integration_type: 'oauth_server_to_server', client_id: 'client-abc', id_integration: 'int-123' },
                ],
            });

            const result = await fetcher.getWorkspaceS2SCredential('o', 'p', 'w');

            expect(result).toEqual({ clientId: 'client-abc', idIntegration: 'int-123' });
        });

        it('should return undefined when only apiKey/AdobeID credentials exist', async () => {
            sdk.getCredentials.mockResolvedValue({
                body: [
                    { integration_type: 'apikey', client_id: 'apikey-client', id_integration: 'apikey-int' },
                    { integration_type: 'adobeid', client_id: 'adobeid-client', id_integration: 'adobeid-int' },
                ],
            });

            const result = await fetcher.getWorkspaceS2SCredential('o', 'p', 'w');

            expect(result).toBeUndefined();
            expect(sdk.createOAuthServerToServerCredential).not.toHaveBeenCalled();
        });

        it('should return undefined when the credential list is empty', async () => {
            sdk.getCredentials.mockResolvedValue({ body: [] });

            const result = await fetcher.getWorkspaceS2SCredential('o', 'p', 'w');

            expect(result).toBeUndefined();
        });

        it('should return undefined when the response has no body', async () => {
            sdk.getCredentials.mockResolvedValue({});

            const result = await fetcher.getWorkspaceS2SCredential('o', 'p', 'w');

            expect(result).toBeUndefined();
        });

        it('should call getCredentials with the explicit args, not cacheManager values', async () => {
            sdk.getCredentials.mockResolvedValue({ body: [] });

            await fetcher.getWorkspaceS2SCredential('arg-org', 'arg-proj', 'arg-ws');

            expect(sdk.getCredentials).toHaveBeenCalledWith('arg-org', 'arg-proj', 'arg-ws');
        });

        it('should propagate SDK errors from getCredentials unchanged', async () => {
            const sdkError = new Error('getCredentials failed: 500');
            sdk.getCredentials.mockRejectedValue(sdkError);

            await expect(fetcher.getWorkspaceS2SCredential('o', 'p', 'w')).rejects.toBe(sdkError);
        });

        it('should throw when required args are missing', async () => {
            await expect(fetcher.getWorkspaceS2SCredential('', 'p', 'w')).rejects.toThrow();
            expect(sdk.getCredentials).not.toHaveBeenCalled();
        });

        it('should throw when the SDK is not initialized', async () => {
            (mockSDKClient.isInitialized as jest.Mock).mockReturnValue(false);

            await expect(fetcher.getWorkspaceS2SCredential('o', 'p', 'w')).rejects.toThrow();
        });
    });

    describe('createWorkspaceS2SCredentialFor', () => {
        it('should create the shared S2S credential and return the mapped ids', async () => {
            sdk.createOAuthServerToServerCredential.mockResolvedValue({
                body: { id: 'int-new', apiKey: 'client-new' },
            });

            const result = await fetcher.createWorkspaceS2SCredentialFor('arg-org', 'arg-proj', 'arg-ws');

            expect(sdk.createOAuthServerToServerCredential).toHaveBeenCalledWith(
                'arg-org', 'arg-proj', 'arg-ws', expect.any(String), expect.any(String),
            );
            expect(result).toEqual({ clientId: 'client-new', idIntegration: 'int-new' });
        });

        it('should throw when the create response is missing apiKey', async () => {
            sdk.createOAuthServerToServerCredential.mockResolvedValue({
                body: { id: 'int-new' },
            });

            await expect(fetcher.createWorkspaceS2SCredentialFor('o', 'p', 'w')).rejects.toThrow();
        });

        it('should throw when the create response is missing id', async () => {
            sdk.createOAuthServerToServerCredential.mockResolvedValue({
                body: { apiKey: 'client-new' },
            });

            await expect(fetcher.createWorkspaceS2SCredentialFor('o', 'p', 'w')).rejects.toThrow();
        });

        it('should propagate SDK errors from the create call unchanged', async () => {
            const sdkError = new Error('createOAuthServerToServerCredential failed: 403');
            sdk.createOAuthServerToServerCredential.mockRejectedValue(sdkError);

            await expect(fetcher.createWorkspaceS2SCredentialFor('o', 'p', 'w')).rejects.toBe(sdkError);
        });

        it('should throw when required args are missing', async () => {
            await expect(fetcher.createWorkspaceS2SCredentialFor('o', '', 'w')).rejects.toThrow();
            expect(sdk.createOAuthServerToServerCredential).not.toHaveBeenCalled();
        });

        it('should throw when the SDK is not initialized', async () => {
            (mockSDKClient.isInitialized as jest.Mock).mockReturnValue(false);

            await expect(fetcher.createWorkspaceS2SCredentialFor('o', 'p', 'w')).rejects.toThrow();
        });
    });

    describe('ensureOAuthCredentialId — delegation to the split methods', () => {
        it('should return the existing S2S id_integration WITHOUT calling create', async () => {
            sdk.getCredentials.mockResolvedValue({
                body: [{ integration_type: 'oauth_server_to_server', client_id: 'client-abc', id_integration: 'int-existing' }],
            });

            const id = await fetcher.ensureOAuthCredentialId('o', 'p', 'w');

            expect(id).toBe('int-existing');
            expect(sdk.createOAuthServerToServerCredential).not.toHaveBeenCalled();
        });

        it('should create and return the new id when no S2S credential exists', async () => {
            sdk.getCredentials.mockResolvedValue({ body: [] });
            sdk.createOAuthServerToServerCredential.mockResolvedValue({
                body: { id: 'int-created', apiKey: 'client-created' },
            });

            const id = await fetcher.ensureOAuthCredentialId('o', 'p', 'w');

            expect(id).toBe('int-created');
        });
    });

    describe('deleteConsoleProject', () => {
        it('should call the SDK deleteProject with orgId and projectId and resolve', async () => {
            sdk.deleteProject.mockResolvedValue({ body: {} });

            await expect(fetcher.deleteConsoleProject('arg-org', 'arg-proj')).resolves.toBeUndefined();

            expect(sdk.deleteProject).toHaveBeenCalledWith('arg-org', 'arg-proj');
        });

        it('should propagate the SDK 409 delete-forbidden error unchanged', async () => {
            // Spike-validated: with an event provider attached, deleteProject → 409
            // Conflict ERR_MSG_PROJECT_DELETE_FORBIDDEN. Callers map it; the fetcher must not.
            const sdkError = Object.assign(new Error('409 Conflict'), {
                code: 'ERR_MSG_PROJECT_DELETE_FORBIDDEN',
            });
            sdk.deleteProject.mockRejectedValue(sdkError);

            await expect(fetcher.deleteConsoleProject('o', 'p')).rejects.toBe(sdkError);
        });

        it('should throw when required args are missing', async () => {
            await expect(fetcher.deleteConsoleProject('o', '')).rejects.toThrow();
            expect(sdk.deleteProject).not.toHaveBeenCalled();
        });

        it('should throw when the SDK is not initialized', async () => {
            (mockSDKClient.isInitialized as jest.Mock).mockReturnValue(false);

            await expect(fetcher.deleteConsoleProject('o', 'p')).rejects.toThrow();
        });
    });
});
