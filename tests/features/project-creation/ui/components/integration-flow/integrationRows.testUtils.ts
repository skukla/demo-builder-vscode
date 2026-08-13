/**
 * Shared fixtures for the integrationRows suites
 * (integrationRows.test.ts — mesh/catalog/custom/ordering;
 * integrationRows.instances.test.ts — AI-built instance discriminator).
 *
 * `resolveIntegrationRows` is pure — the catalog is an arg, nothing is mocked —
 * so only plain fixtures live here.
 */

import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { WizardState } from '@/types/webview';

export function state(overrides: Partial<WizardState> = {}): WizardState {
    return overrides as WizardState;
}

/** The stack's mesh entry (as meshComponentForStack resolves it). */
export const MESH_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'eds-accs-mesh',
    name: 'Commerce API Mesh',
    description: 'Unified GraphQL endpoint over Commerce services',
    kind: 'mesh',
    requiredApis: ['GraphQLServiceSDK'],
    source: { owner: 'skukla', repo: 'commerce-mesh', branch: 'main' },
};

export const ERP_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'erp-sync',
    name: 'ERP Sync',
    description: 'Syncs orders into an ERP backend',
    kind: 'integration',
    source: { owner: 'skukla', repo: 'erp-sync', branch: 'main' },
};

/** The blank starter ("Build custom") — kind 'integration', blank, NO source. */
export const BLANK_ENTRY: AppBuilderComponentCatalogEntry = {
    id: 'app-builder-shell',
    name: 'App Builder App',
    description: 'A minimal App Builder app to build out with AI',
    kind: 'integration',
    blank: true,
    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
};

export const CATALOG: AppBuilderComponentCatalogEntry[] = [MESH_ENTRY, ERP_ENTRY];
