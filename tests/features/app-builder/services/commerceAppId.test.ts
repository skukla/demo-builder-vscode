/**
 * The id a copy of an App Management app declares to Commerce.
 *
 * Commerce knows an app by that id and names its webhooks and events from it, so it
 * must be unique per store — and it is FIXED at first install, which is why the
 * caller records it rather than deriving it again on every deploy.
 *
 * The owner's rule (2026-09-22): the name the SC typed, slugged; the copy number when
 * that name is taken by another copy here; the copy number when no name was typed.
 */

import { deriveCommerceAppId, ensureCommerceAppId } from '@/features/app-builder/services/commerceAppId';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import { createMockProject } from '../../../helpers/projectFake';

describe('deriveCommerceAppId', () => {
    it('is the typed name, slugged', () => {
        expect(deriveCommerceAppId({ typedName: 'Contoso ERP', copyId: 'erp-integration-2', taken: [] })).toBe(
            'contoso-erp',
        );
    });

    it('falls back to the copy id when another copy already uses that name', () => {
        expect(
            deriveCommerceAppId({
                typedName: 'Contoso ERP',
                copyId: 'erp-integration-3',
                taken: ['contoso-erp'],
            }),
        ).toBe('erp-integration-3');
    });

    it('is the copy id when nothing was typed', () => {
        expect(deriveCommerceAppId({ typedName: undefined, copyId: 'erp-integration-2', taken: [] })).toBe(
            'erp-integration-2',
        );
        expect(deriveCommerceAppId({ typedName: '   ', copyId: 'erp-integration-2', taken: [] })).toBe(
            'erp-integration-2',
        );
    });

    // The library counts a webhook as an app's when its name STARTS WITH the app's id,
    // so an id that prefixes another's would let one copy's removal delete the other's
    // webhooks. A name that slugs into that shape takes the copy id instead.
    it('falls back when the slug would prefix, or be prefixed by, an id already in use', () => {
        expect(
            deriveCommerceAppId({
                typedName: 'Commerce ERP',
                copyId: 'erp-integration-2',
                taken: ['commerce-erp-integration'],
            }),
        ).toBe('erp-integration-2');
        expect(
            deriveCommerceAppId({
                typedName: 'Contoso ERP Europe',
                copyId: 'erp-integration-2',
                taken: ['contoso-erp'],
            }),
        ).toBe('erp-integration-2');
    });

    it('keeps only what Adobe accepts in an id: letters, digits and single hyphens', () => {
        expect(deriveCommerceAppId({ typedName: "Nord/Wind's ERP  #2!", copyId: 'erp-integration-2', taken: [] })).toBe(
            'nord-wind-s-erp-2',
        );
    });

    it('falls back when the name has nothing an id can use', () => {
        expect(deriveCommerceAppId({ typedName: '///', copyId: 'erp-integration-2', taken: [] })).toBe(
            'erp-integration-2',
        );
    });

    it('caps a long name well inside Adobe’s 100-character limit', () => {
        const id = deriveCommerceAppId({
            typedName: 'A'.repeat(200),
            copyId: 'erp-integration-2',
            taken: [],
        });

        expect(id.length).toBeLessThanOrEqual(100);
        expect(id).toBe('a'.repeat(60));
    });
});

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    nameFromEnvVar: 'ERP_DISPLAY_NAME',
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const COPY: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration-2',
    catalogId: 'erp-integration',
    name: 'ERP Integration 2',
    description: 'the integration',
    kind: 'integration',
    lifecycle: 'app-management',
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

const projectWith = (configs: Record<string, Record<string, string>>, extra = {}) =>
    createMockProject({
        componentConfigs: configs,
        appBuilderComponents: {
            'erp-integration-2': {
                kind: 'integration',
                status: 'deploying',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                ...extra,
            },
        },
    });

describe('ensureCommerceAppId', () => {
    it('records the typed name, and answers the recorded one ever after', () => {
        const project = projectWith({ 'erp-integration-2': { ERP_DISPLAY_NAME: 'Contoso ERP' } });

        expect(ensureCommerceAppId(project, COPY, [SYSTEM, COPY])).toBe('contoso-erp');
        expect(project.appBuilderComponents?.['erp-integration-2']?.commerceAppId).toBe('contoso-erp');

        // A rename must not move it: Commerce refuses an id change on an upgrade.
        project.componentConfigs!['erp-integration-2']!.ERP_DISPLAY_NAME = 'Renamed ERP';
        expect(ensureCommerceAppId(project, COPY, [SYSTEM, COPY])).toBe('contoso-erp');
    });

    it('reads the name from the ERP when it was set there', () => {
        const project = projectWith({ 'demo-erp-2': { ERP_DISPLAY_NAME: 'Contoso ERP' } });

        expect(ensureCommerceAppId(project, COPY, [SYSTEM, COPY])).toBe('contoso-erp');
    });

    it('falls back to the copy id when no name was typed', () => {
        expect(ensureCommerceAppId(projectWith({}), COPY, [SYSTEM, COPY])).toBe('erp-integration-2');
    });

    // The first of a kind is already installed under the id its app ships with, which
    // is its repository's name — so a copy the SC names the same thing is numbered.
    it('falls back when the typed name is the id the first copy already declares', () => {
        const project = projectWith({
            'erp-integration-2': { ERP_DISPLAY_NAME: 'Commerce ERP Integration' },
        });

        expect(ensureCommerceAppId(project, COPY, [SYSTEM, COPY])).toBe('erp-integration-2');
    });

    it('gives none to the first of a kind, or to anything that is not App Management', () => {
        const first = { ...COPY, id: 'erp-integration', catalogId: undefined };
        const project = projectWith({ 'erp-integration-2': { ERP_DISPLAY_NAME: 'Contoso ERP' } });

        expect(ensureCommerceAppId(project, first, [SYSTEM, first])).toBeUndefined();
        expect(ensureCommerceAppId(project, { ...COPY, lifecycle: undefined }, [SYSTEM, COPY])).toBeUndefined();
    });
});
