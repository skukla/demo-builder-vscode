/**
 * Shared setup for the adobeWorkspaceCredentials suites.
 *
 * One SDK-client fake with live-shaped responses (keys read from a real
 * credential, 2026-08-27) and one cache-manager fake that answers the three
 * reads the cache-driven pair (`getWorkspaceCredential` /
 * `createWorkspaceCredential`) depends on. Every suite for this module builds
 * its subject from here so the fakes cannot drift between them.
 */

import { AdobeWorkspaceCredentials } from '@/features/authentication/services/adobeWorkspaceCredentials';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
} from '@/features/authentication/services/types';

export const ORG = '285361';
export const PROJ = '4566206088345738527';
export const WS = '4566206088345780697';

/** The three cache reads the cache-driven credential pair depends on. */
export type CacheReads = Pick<
    AuthCacheManager,
    'getCachedOrganization' | 'getCachedProject' | 'getCachedWorkspace'
>;

export interface SdkClientFake {
    client: Record<string, jest.Mock>;
    sdkClient: AdobeSDKClient;
    /** The `isInitialized` answer — flip it to send a call down the not-ready path. */
    isInitialized: jest.Mock;
    ensureInitialized: jest.Mock;
}

/** Live-shaped SDK responses (keys read from a real credential, 2026-08-27). */
export function makeSdkClient(overrides: Record<string, jest.Mock> = {}): SdkClientFake {
    const client = {
        getCredentials: jest.fn().mockResolvedValue({ body: [] }),
        createOAuthServerToServerCredential: jest
            .fn()
            .mockResolvedValue({ body: { id: '1099001', apiKey: 'client-id-abc' } }),
        createAdobeIdCredential: jest.fn().mockResolvedValue({ body: { id: 'created-int' } }),
        getIntegration: jest.fn().mockResolvedValue({
            body: {
                apiKey: 'client-id-abc',
                technicalAccountId: 'ta-id-1',
                technicalAccountEmail: 'ta@techacct.adobe.com',
                orgCode: '8EBB33FE5E43BA110A495EF8@AdobeOrg',
            },
        }),
        getIntegrationSecrets: jest.fn().mockResolvedValue({
            body: {
                client_id: 'client-id-abc',
                client_secrets: [{ client_secret: 'fake-test-pw-not-a-secret' }],
            },
        }),
        ...overrides,
    };
    const isInitialized = jest.fn().mockReturnValue(true);
    const ensureInitialized = jest.fn().mockResolvedValue(true);
    const sdkClient = {
        isInitialized,
        ensureInitialized,
        getClient: () => client,
    } as unknown as AdobeSDKClient;
    return { client, sdkClient, isInitialized, ensureInitialized };
}

const CACHED_ORG: AdobeOrg = { id: ORG, code: 'ORGCODE@AdobeOrg', name: 'Org' };
const CACHED_PROJECT: AdobeProject = { id: PROJ, name: 'proj' };
const CACHED_WORKSPACE: AdobeWorkspace = { id: WS, name: 'Stage' };

/**
 * A cache manager holding a complete org/project/workspace selection unless a
 * read is overridden — `{ org: undefined }` empties that one read.
 */
export function makeCacheManager(
    overrides: {
        org?: AdobeOrg | undefined;
        project?: AdobeProject | undefined;
        workspace?: AdobeWorkspace | undefined;
    } = {},
): AuthCacheManager {
    const reads: jest.Mocked<CacheReads> = {
        getCachedOrganization: jest.fn().mockReturnValue('org' in overrides ? overrides.org : CACHED_ORG),
        getCachedProject: jest.fn().mockReturnValue('project' in overrides ? overrides.project : CACHED_PROJECT),
        getCachedWorkspace: jest.fn().mockReturnValue('workspace' in overrides ? overrides.workspace : CACHED_WORKSPACE),
    };
    return reads as unknown as AuthCacheManager;
}

export function makeCredentials(
    sdkClient: AdobeSDKClient,
    cacheManager: AuthCacheManager = makeCacheManager(),
): AdobeWorkspaceCredentials {
    return new AdobeWorkspaceCredentials(sdkClient, cacheManager);
}
