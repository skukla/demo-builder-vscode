/**
 * erpListId — an ERP's id in its integration's list is named for the ERP (AB-51).
 *
 * Pure: the slug, its uniqueness, the once-only record, and which system its
 * integration brings. The shapes are the real `AppBuilderComponentState` and catalog
 * entry types, so an invented field fails to compile.
 */

import {
    broughtByItsIntegration,
    ensureListId,
    erpListIdFor,
    listIdOf,
} from '@/features/app-builder/services/erpListId';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    nameFromEnvVar: 'ERP_DISPLAY_NAME',
    listedAs: { envVar: 'ERP_ID', adapter: 'demo-erp' },
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const deployed = (name?: string, listId?: string): AppBuilderComponentState => ({
    kind: 'system',
    status: 'deployed',
    source: { owner: 'skukla', repo: 'demo-erp' },
    ...(name ? { name } : {}),
    ...(listId ? { listId } : {}),
});

describe('erpListIdFor', () => {
    it.each([
        ['Northwind ERP', 'northwind'],
        ['Contoso ERP', 'contoso'],
        ['Justrite ERP', 'justrite'],
        ['AccuformNMC', 'accuformnmc'],
        ['Brand B (EMEA) ERP', 'brand-b-emea'],
        ['  ERP  ', 'erp'],
        ['ERP', 'erp'],
        ['2nd Line ERP', 'erp-2nd-line'],
    ])('%s → %s', (name, id) => {
        expect(erpListIdFor(name, [])).toBe(id);
    });

    it('answers an id the integration accepts, for any name', () => {
        // The integration's own rule (erps.js): a letter, then letters, digits, hyphens, ≤ 63.
        for (const name of ['Ünïcode ERP', '!!!', 'a'.repeat(120), '---', '']) {
            expect(erpListIdFor(name, [])).toMatch(/^[a-z][a-z0-9-]{0,62}$/u);
        }
    });

    it('numbers an id another ERP here already carries', () => {
        expect(erpListIdFor('Northwind ERP', ['northwind'])).toBe('northwind-2');
        expect(erpListIdFor('Northwind ERP', ['northwind', 'northwind-2'])).toBe('northwind-3');
    });
});

describe('listIdOf', () => {
    it('answers the recorded id first', () => {
        const project = createMockProject({
            appBuilderComponents: { 'demo-erp': deployed('Renamed Since', 'northwind') },
        });
        expect(listIdOf(project, SYSTEM)).toBe('northwind');
    });

    it('derives from the recorded name when nothing is recorded', () => {
        const project = createMockProject({
            appBuilderComponents: { 'demo-erp': deployed('Northwind ERP') },
        });
        expect(listIdOf(project, SYSTEM)).toBe('northwind');
    });

    it("derives from the name set on the integration's tile, then the system's own, then the catalog", () => {
        const onIntegration = createMockProject({
            componentConfigs: {
                'erp-integration': { ERP_DISPLAY_NAME: 'Northwind ERP' },
                'demo-erp': { ERP_DISPLAY_NAME: 'Other' },
            },
        });
        expect(listIdOf(onIntegration, SYSTEM)).toBe('northwind');

        const onSystem = createMockProject({
            componentConfigs: { 'demo-erp': { ERP_DISPLAY_NAME: 'Contoso ERP' } },
        });
        expect(listIdOf(onSystem, SYSTEM)).toBe('contoso');

        expect(listIdOf(createMockProject(), SYSTEM)).toBe('erp');
    });

    it("avoids the ids the project's other systems carry", () => {
        const project = createMockProject({
            appBuilderComponents: {
                'demo-erp': deployed('Northwind ERP', 'northwind'),
                'demo-erp-2': deployed('Northwind ERP'),
            },
        });
        expect(listIdOf(project, { ...SYSTEM, id: 'demo-erp-2', catalogId: 'demo-erp' })).toBe(
            'northwind-2'
        );
    });
});

describe('ensureListId', () => {
    it('records the derived id once, and never rewrites it', () => {
        const project = createMockProject({
            appBuilderComponents: { 'demo-erp': deployed('Northwind ERP') },
        });

        expect(ensureListId(project, SYSTEM)).toBe(true);
        expect(project.appBuilderComponents?.['demo-erp']?.listId).toBe('northwind');

        project.appBuilderComponents!['demo-erp']!.name = 'Justrite ERP';
        expect(ensureListId(project, SYSTEM)).toBe(false);
        expect(project.appBuilderComponents?.['demo-erp']?.listId).toBe('northwind');
    });

    it('records nothing for an entry with no listing, or with no record to write on', () => {
        const project = createMockProject({
            appBuilderComponents: { 'demo-erp': deployed('Northwind ERP') },
        });
        expect(ensureListId(project, { ...SYSTEM, listedAs: undefined })).toBe(false);
        expect(ensureListId(createMockProject(), SYSTEM)).toBe(false);
    });
});

describe('broughtByItsIntegration', () => {
    const integration = (): AppBuilderComponentState => ({
        kind: 'integration',
        status: 'deployed',
        source: { owner: 'skukla', repo: 'commerce-erp-integration' },
    });

    it("the catalog's own entry is the integration's", () => {
        expect(broughtByItsIntegration(createMockProject(), SYSTEM)).toBe(true);
    });

    it('a numbered copy is, only when its numbered integration is in the project', () => {
        const copy = { ...SYSTEM, id: 'demo-erp-2', catalogId: 'demo-erp' };
        const legacyPair = createMockProject({
            appBuilderComponents: { 'erp-integration-2': integration() },
        });
        expect(broughtByItsIntegration(legacyPair, copy)).toBe(true);
        expect(broughtByItsIntegration(createMockProject(), copy)).toBe(false);
    });
});
