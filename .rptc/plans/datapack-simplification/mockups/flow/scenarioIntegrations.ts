/**
 * The scripted host's data for the Integrations click-through prototype, typed against the
 * extension's own interfaces so no shape here is invented (ADR-016). Compiled to
 * `scenarioIntegrations.js` (global SCENARIO_INTEGRATIONS) with esbuild;
 * `scenario-integrations.js` reads it.
 *
 * The catalog is the real one (`app-builder-components.json` through its loader), filtered to the
 * ACCS + Edge Delivery stack. The preview's step labels and titles are the ERP integration's own
 * declared setup steps; which state each is in, and the one-line summaries, are made up for the
 * prototype.
 */

import { getAvailableAppBuilderComponents } from '../../../../../src/features/components/services/appBuilderComponentCatalogLoader';
import { asDisplayName } from '../../../../../src/core/utils/projectDisplayName';
import type { AppBuilderComponentState } from '../../../../../src/types/base';
import type { ComponentSettings, SetupStep } from '../../../../../src/types/appBuilderComponents';
import type { AddPreparationAnswer, PreparationStepReport } from '../../../../../src/types/storePreparation';
import type { IntegrationsInitialData } from '../../../../../src/types/webviewPayloads';
import type { SaveIntegrationSettingsResult } from '../../../../../src/types/webviewRequests';

const CATALOG = getAvailableAppBuilderComponents('adobe-commerce-accs', 'eds-storefront');

/** One custom integration the project already has, deployed, with settings to edit. */
const STORE_LOCATOR: AppBuilderComponentState = {
    kind: 'integration',
    status: 'deployed',
    name: 'Store Locator',
    source: { owner: 'acme-demos', repo: 'store-locator' },
    url: 'https://store-locator.example.com',
};

export const SETTINGS: ComponentSettings = {
    fields: [
        { name: 'MAP_PROVIDER', label: 'Map Provider', type: 'text', required: true, value: 'OpenStreetMap' },
        { name: 'SEARCH_RADIUS_KM', label: 'Search Radius (km)', type: 'text', required: false, value: '25' },
        { name: 'MAP_API_KEY', label: 'Map API Key', type: 'secret', required: true, isSet: true },
    ],
    connected: [],
};

export const INIT: IntegrationsInitialData = {
    theme: 'dark',
    projectName: asDisplayName('Bodea'),
    // No status push: false skips the screen's "Loading integrations" gate.
    hasAdobeContext: false,
    appBuilderComponents: { 'store-locator': STORE_LOCATOR },
    appBuilderComponentCatalog: CATALOG,
    meshNeededByDemo: false,
    componentSettings: { 'store-locator': SETTINGS },
    integrationsViewMode: 'cards',
    destination: { projectTitle: 'Bodea Demo', workspaceTitle: 'Stage' },
    adobeProjectId: '4566206088345050000',
    adobeWorkspaceId: '4566206088345050001',
    adobeOrgId: 'EF0A1B2C3D4E5F6A7B8C9D0E@AdobeOrg',
};

/** The save as it lands: what was typed, now held. */
export function savedSettings(values: Record<string, string>): ComponentSettings {
    return {
        ...SETTINGS,
        fields: SETTINGS.fields.map((field) =>
            field.type === 'text' && field.name in values ? { ...field, value: values[field.name] } : field,
        ),
    };
}

export const SAVE_FAILED: SaveIntegrationSettingsResult = {
    success: false,
    saved: false,
    error: 'The settings file is locked by another process. Close it and try again.',
};

export function saveSucceeded(values: Record<string, string>): SaveIntegrationSettingsResult {
    return { success: true, saved: true, settings: savedSettings(values) };
}

const ERP = CATALOG.find((entry) => entry.id === 'erp-integration');
const STEPS: readonly SetupStep[] = ERP?.setupSteps ?? [];

/** Which state each declared step is in, and the line under it: the prototype's own choice. */
const STATE: Record<string, Pick<PreparationStepReport, 'state' | 'summary' | 'note' | 'manual' | 'changes'>> = {
    'confirmed-status': { state: 'manual', changes: [], manual: 'Create it in Stores > Order Status.' },
    'company-catalogs': { state: 'applicable', changes: [], summary: 'Give Harbor Supply and Northwind Tools a shared catalog each' },
    'price-scope-website': { state: 'applicable', changes: [], summary: 'Set the catalog price scope to Website' },
    'second-source': { state: 'applicable', changes: [], summary: 'Add Acme Warehouse to Bodea Stock' },
    'erp-attributes': { state: 'done', changes: [] },
    'partially-held-status': { state: 'manual', changes: [], manual: 'Create it in Stores > Order Status.' },
    'payment-on-account': { state: 'applicable', changes: [], summary: 'Switch on Payment on Account for Bodea B2B' },
    'storefront-returns': { state: 'done', changes: [] },
    'card-payments': { state: 'applicable', changes: [], summary: 'Switch on card payments for the storefront' },
    'app-management-listing': { state: 'manual', changes: [], manual: 'Associate the app in Apps > App Management.' },
};

export function addPreview(name: string): AddPreparationAnswer {
    return {
        confirmed: false,
        adding: { id: 'erp-integration', name },
        preparation: {
            steps: STEPS.map((step) => ({
                id: step.id,
                label: step.label ?? step.title,
                title: step.title,
                rejected: [],
                ...(STATE[step.id] ?? { state: 'manual', changes: [] }),
            })),
            everyWebsite: ['Price Scope'],
        },
        next: 'Send the add again with confirm: true to add it and prepare the store.',
    };
}

export const ADD_REFUSED = 'ERP Integration is already in another project on this Commerce: Harbor Demo.';
