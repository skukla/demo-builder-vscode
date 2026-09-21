/**
 * Shared setup for the AdobeConsoleProjectOps suites: the ops built over a fake
 * Console client holding just the methods a suite drives, and the injected
 * workspace list its create and delete read.
 */

import { AdobeConsoleProjectOps } from '@/features/authentication/services/adobeConsoleProjectOps';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { AdobeWorkspace } from '@/features/authentication/services/types';

export const TARGET = { orgId: 'org-1', projectId: 'proj-1' };

/**
 * @param client - the Console client methods the suite drives
 * @param listWorkspaces - the injected read of the project's workspaces
 * @returns the ops under test
 */
export function opsWith(client: Record<string, jest.Mock>, listWorkspaces: jest.Mock) {
    const sdkClient = {
        isInitialized: jest.fn().mockReturnValue(true),
        ensureInitialized: jest.fn().mockResolvedValue(true),
        getClient: jest.fn().mockReturnValue(client),
    } as unknown as AdobeSDKClient;
    const cacheManager = {
        getCachedOrganization: jest.fn(),
        getCachedProject: jest.fn(),
    } as unknown as AuthCacheManager;
    return new AdobeConsoleProjectOps(sdkClient, cacheManager, listWorkspaces);
}

/** A listed workspace whose id, name and title are all `name`. */
export const workspace = (name: string) => ({ id: name, name, title: name }) as AdobeWorkspace;
