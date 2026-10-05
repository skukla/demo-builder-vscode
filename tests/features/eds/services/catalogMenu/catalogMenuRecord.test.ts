/**
 * Where the catalog menu's record lives: the storefront instance's free-form metadata,
 * `componentInstances['eds-storefront'].metadata.catalogMenu` (EDS-24, owner-approved
 * 2026-10-04). The manifest schema declares that `metadata` as an object with
 * `additionalProperties: {}`, so the key needs no schema change.
 *
 * The record is the proof of authorship the undo relies on, so a value that does not
 * read as one is treated as NO record: removing nothing is the safe failure.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    readCatalogMenuRecord,
    writeCatalogMenuRecord,
} from '@/features/eds/services/catalogMenu/catalogMenuRecord';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../helpers/projectFake';

function withMetadata(metadata: Record<string, unknown> | undefined): Project {
    return createMockProject({
        selectedStack: 'eds-accs',
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: {
                id: COMPONENT_IDS.EDS_STOREFRONT,
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                ...(metadata ? { metadata } : {}),
            },
        },
    });
}

const RECORD = {
    pages: [{ path: '/safety-signs', hash: 'abc' }],
    links: [{ urlPath: 'signs', path: '/safety-signage' }],
    navSwitch: true,
};

describe('readCatalogMenuRecord', () => {
    it('reads the record kept on the storefront instance', () => {
        const project = withMetadata({ githubRepo: 'steve/kukla-justrite', catalogMenu: RECORD });
        expect(readCatalogMenuRecord(project)).toEqual(RECORD);
    });

    it('is the empty record when there is none', () => {
        expect(readCatalogMenuRecord(withMetadata({ githubRepo: 'a/b' }))).toEqual({ pages: [], links: [], navSwitch: false });
        expect(readCatalogMenuRecord(withMetadata(undefined))).toEqual({ pages: [], links: [], navSwitch: false });
    });

    it('drops page entries that do not read as a path and a hash, and a non-boolean switch', () => {
        const project = withMetadata({
            catalogMenu: { pages: [{ path: '/a' }, { path: '/b', hash: 'h' }, 'x'], navSwitch: 'yes' },
        });
        expect(readCatalogMenuRecord(project)).toEqual({ pages: [{ path: '/b', hash: 'h' }], links: [], navSwitch: false });
    });
});

describe('writeCatalogMenuRecord', () => {
    it('keeps the record beside the instance metadata already there', () => {
        const project = withMetadata({ githubRepo: 'steve/kukla-justrite', daLiveOrg: 'skukla' });

        writeCatalogMenuRecord(project, RECORD);

        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).toEqual({
            githubRepo: 'steve/kukla-justrite',
            daLiveOrg: 'skukla',
            catalogMenu: RECORD,
        });
    });

    it('deletes the key once nothing is claimed, so an undone project carries no trace', () => {
        const project = withMetadata({ githubRepo: 'a/b', catalogMenu: RECORD });

        writeCatalogMenuRecord(project, { pages: [], links: [], navSwitch: false });

        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).toEqual({ githubRepo: 'a/b' });
    });

    it('refuses a project with no storefront instance rather than inventing one', () => {
        const project = createMockProject({ componentInstances: {} });
        expect(() => writeCatalogMenuRecord(project, RECORD)).toThrow('no storefront');
    });
});
