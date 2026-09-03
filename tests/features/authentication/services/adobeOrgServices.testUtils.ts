/**
 * Shared setup for the adobeOrgServices family.
 *
 * One SDK-client fake, built the same way for every suite: `getClient()` answers
 * with four jest.fn methods, and `isInitialized` is a knob so the lazy-init path
 * can be driven from either side.
 */

import { AdobeOrgServices } from '@/features/authentication/services/adobeOrgServices';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';

export const SERVICES = [{ code: 'GraphQLServiceSDK', name: 'Mesh', type: 't' }];

export function makeService(initialized = true) {
    const client = {
        getServicesForOrg: jest.fn(),
        getIntegration: jest.fn(),
        subscribeAdobeIdIntegrationToServices: jest.fn(),
        subscribeOAuthServerToServerIntegrationToServices: jest.fn(),
    };
    const sdkClient = {
        isInitialized: jest.fn().mockReturnValue(initialized),
        ensureInitialized: jest.fn().mockResolvedValue(undefined),
        getClient: jest.fn().mockReturnValue(client),
    };
    const service = new AdobeOrgServices(sdkClient as unknown as AdobeSDKClient);
    return { service, client, sdkClient };
}

/** A promise that never settles — the shape of a stalled endpoint. */
export const never = () => new Promise<never>(() => undefined);
