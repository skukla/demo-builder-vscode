/**
 * Which catalog entry a component instance is (AB-23, two ERPs in one project).
 *
 * A component's id doubled as its catalog id, so a second ERP — minted as
 * `demo-erp-2` — had no catalog row and was rebuilt from its record, which carries
 * no screen, no records wipe and no binding. An instance minted from a catalog entry
 * now records `catalogId`, and this resolver answers with that entry, re-keyed to the
 * instance. Absent, the id IS the catalog id: every existing project, unchanged.
 */

import { catalogEntryFor } from '@/features/app-builder/services/componentEntry';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockProject } from '../../../helpers/projectFake';

const DEMO_ERP: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    providesEnvVars: ['ERP_BASE_URL'],
    nameFromEnvVar: 'ERP_DISPLAY_NAME',
    screen: { action: 'screen', keyEnvVar: 'ERP_SCREEN_KEY' },
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};

const record = (overrides: Partial<AppBuilderComponentState> = {}): AppBuilderComponentState => ({
    kind: 'system',
    status: 'deployed',
    source: { owner: 'skukla', repo: 'demo-erp' },
    ...overrides,
});

const projectWith = (components: Project['appBuilderComponents']) =>
    createMockProject({ appBuilderComponents: components });

describe('catalogEntryFor', () => {
    it('answers the catalog entry for an id that is a catalog id', () => {
        const project = projectWith({ 'demo-erp': record() });

        expect(catalogEntryFor(project, 'demo-erp', [DEMO_ERP])).toBe(DEMO_ERP);
    });

    it('answers the entry an instance was made from, under the instance id', () => {
        const project = projectWith({ 'demo-erp-2': record({ catalogId: 'demo-erp' }) });

        const entry = catalogEntryFor(project, 'demo-erp-2', [DEMO_ERP]);

        expect(entry).toEqual({ ...DEMO_ERP, id: 'demo-erp-2', catalogId: 'demo-erp' });
        // What a record cannot rebuild: the screen and the name rule survive.
        expect(entry?.screen).toEqual(DEMO_ERP.screen);
        expect(entry?.nameFromEnvVar).toBe('ERP_DISPLAY_NAME');
    });

    it('rebuilds an entry from the record when nothing names a catalog entry', () => {
        const project = projectWith({
            'my-app': record({ kind: 'integration', name: 'My App', source: { owner: 'acme', repo: 'my-app' } }),
        });

        const entry = catalogEntryFor(project, 'my-app', [DEMO_ERP]);

        expect(entry).toMatchObject({ id: 'my-app', kind: 'integration', name: 'My App' });
        expect(entry?.source).toMatchObject({ owner: 'acme', repo: 'my-app' });
    });

    it('rebuilds from the record when its catalogId names nothing in the catalog', () => {
        const project = projectWith({ 'gone-2': record({ catalogId: 'gone' }) });

        expect(catalogEntryFor(project, 'gone-2', [DEMO_ERP])).toMatchObject({ id: 'gone-2', kind: 'system' });
    });

    it('answers nothing for an id the project does not have and the catalog does not list', () => {
        expect(catalogEntryFor(projectWith({}), 'nope', [DEMO_ERP])).toBeUndefined();
    });
});
