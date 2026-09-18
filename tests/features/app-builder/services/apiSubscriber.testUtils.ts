/**
 * Shared fixtures for the apiSubscriber suites: catalog entries and the org's
 * services list as a live org answers it.
 */

import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

export const MGMT = 'AdobeIOManagementAPISDK';
export const MESH = 'GraphQLServiceSDK';

export function meshAppBuilderComponent(): AppBuilderComponentCatalogEntry {
    return {
        id: 'mesh',
        name: 'API Mesh',
        description: '',
        kind: 'mesh',
        source: { owner: 'o', repo: 'r', branch: 'main' },
        requiredApis: [MESH],
    };
}

export function integrationAppBuilderComponent(apis: string[]): AppBuilderComponentCatalogEntry {
    return {
        id: 'erp',
        name: 'ERP',
        description: '',
        kind: 'integration',
        source: { owner: 'o', repo: 'erp', branch: 'main' },
        requiredApis: apis,
    };
}

// MGMT's platformList is NULL — the MEASURED live row (2026-08-27; only 25 of
// 98 org services declare platforms). The previous fixture invented
// ['oauth_server_to_server'] here, and the code agreed with the invention while
// the live partition silently dropped the baseline from every S2S subscribe.
export const SERVICES_FOR_ORG = [
    { code: MESH, name: 'API Mesh', platformList: ['apiKey'], domainMandatory: true },
    { code: MGMT, name: 'I/O Management API', platformList: null as unknown as string[] },
    { code: 'SomeOtherSDK', platformList: ['oauth_server_to_server'] },
];
