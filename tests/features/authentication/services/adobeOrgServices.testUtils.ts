/**
 * Shared setup for the adobeOrgServices family.
 *
 * One SDK-client fake, built the same way for every suite: `getClient()` answers
 * with four jest.fn methods, and `isInitialized` is a knob so the lazy-init path
 * can be driven from either side.
 */

import { AdobeOrgServices } from '@/features/authentication/services/adobeOrgServices';
import type { OrgServicesStore } from '@/features/authentication/services/orgServicesSavedCatalog';
import type { AdobeSDKClient } from '@/features/authentication/services/adobeSDKClient';

export const SERVICES = [{ code: 'GraphQLServiceSDK', name: 'Mesh', type: 't' }];

export function makeService(initialized = true, store?: OrgServicesStore) {
    const client = {
        getServicesForOrg: jest.fn(),
        getIntegration: jest.fn(),
        getSDKProperties: jest.fn(),
        subscribeAdobeIdIntegrationToServices: jest.fn(),
        subscribeOAuthServerToServerIntegrationToServices: jest.fn(),
    };
    const sdkClient = {
        isInitialized: jest.fn().mockReturnValue(initialized),
        ensureInitialized: jest.fn().mockResolvedValue(undefined),
        getClient: jest.fn().mockReturnValue(client),
    };
    const service = new AdobeOrgServices(sdkClient as unknown as AdobeSDKClient, store);
    return { service, client, sdkClient };
}

/**
 * An in-memory stand-in for `context.globalState`, which is what production passes.
 * `store` is what the service is handed; `get`/`update` are its spies.
 */
export function memoryStore(initial: Record<string, unknown> = {}) {
    const values = new Map(Object.entries(initial));
    const get = jest.fn((key: string): unknown => values.get(key));
    const update = jest.fn(async (key: string, value: unknown) => {
        values.set(key, value);
    });
    const store: OrgServicesStore = { get: <T>(key: string) => get(key) as T | undefined, update };
    return { store, get, update };
}

/** A promise that never settles — the shape of a stalled endpoint. */
export const never = () => new Promise<never>(() => undefined);
