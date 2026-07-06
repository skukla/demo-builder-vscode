/**
 * appBuilderIntegrationList Tests
 *
 * `resolveSelectedIntegrations` turns the wizard's selected App Builder component ids
 * into render descriptors for the Integrations "Services" screen. Catalog integrations
 * resolve from the config entry; custom-URL adds resolve from the persisted source map;
 * mesh ids and unknown ids are excluded. Pure — the catalog loader is mocked.
 */

jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: jest.fn(),
}));

import { getAppBuilderComponentEntry } from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import { resolveSelectedIntegrations } from '@/features/project-creation/ui/components/appBuilderIntegrationList';
import type { WizardState } from '@/types/webview';

const mockGetEntry = getAppBuilderComponentEntry as jest.Mock;

function state(overrides: Partial<WizardState> = {}): WizardState {
    return overrides as WizardState;
}

describe('resolveSelectedIntegrations', () => {
    beforeEach(() => mockGetEntry.mockReset());

    it('resolves a catalog integration id to a descriptor from its entry', () => {
        mockGetEntry.mockImplementation((id: string) =>
            id === 'erp-sync'
                ? {
                      id: 'erp-sync',
                      name: 'ERP Sync',
                      kind: 'integration',
                      source: { owner: 'skukla', repo: 'erp-sync', branch: 'main' },
                  }
                : undefined,
        );

        const result = resolveSelectedIntegrations(
            state({ selectedAppBuilderComponents: ['erp-sync'] }),
        );

        expect(result).toEqual([
            { id: 'erp-sync', name: 'ERP Sync', owner: 'skukla', repo: 'erp-sync' },
        ]);
    });

    it('resolves a custom-source id to a descriptor (name = repo)', () => {
        mockGetEntry.mockReturnValue(undefined);

        const result = resolveSelectedIntegrations(
            state({
                selectedAppBuilderComponents: ['acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            }),
        );

        expect(result).toEqual([
            { id: 'acme-widget', name: 'widget', owner: 'acme', repo: 'widget' },
        ]);
    });

    it('excludes a mesh id (kind: "mesh")', () => {
        mockGetEntry.mockReturnValue({
            id: 'commerce-paas-mesh',
            name: 'API Mesh',
            kind: 'mesh',
            source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
        });

        const result = resolveSelectedIntegrations(
            state({ selectedAppBuilderComponents: ['commerce-paas-mesh'] }),
        );

        expect(result).toEqual([]);
    });

    it('excludes an unknown id with no source', () => {
        mockGetEntry.mockReturnValue(undefined);

        const result = resolveSelectedIntegrations(
            state({ selectedAppBuilderComponents: ['mystery'] }),
        );

        expect(result).toEqual([]);
    });

    it('returns [] for empty state', () => {
        expect(resolveSelectedIntegrations(state())).toEqual([]);
    });

    it('resolves a mix of catalog + custom, excluding a mesh id', () => {
        mockGetEntry.mockImplementation((id: string) => {
            if (id === 'erp-sync') {
                return {
                    id,
                    name: 'ERP Sync',
                    kind: 'integration',
                    source: { owner: 'skukla', repo: 'erp-sync' },
                };
            }
            if (id === 'commerce-paas-mesh') {
                return { id, name: 'API Mesh', kind: 'mesh', source: { owner: 'skukla', repo: id } };
            }
            return undefined;
        });

        const result = resolveSelectedIntegrations(
            state({
                selectedAppBuilderComponents: ['erp-sync', 'commerce-paas-mesh', 'acme-widget'],
                appBuilderComponentSources: { 'acme-widget': { owner: 'acme', repo: 'widget' } },
            }),
        );

        expect(result).toEqual([
            { id: 'erp-sync', name: 'ERP Sync', owner: 'skukla', repo: 'erp-sync' },
            { id: 'acme-widget', name: 'widget', owner: 'acme', repo: 'widget' },
        ]);
    });
});
