/**
 * entriesThatNeedApis — the catalog entries whose APIs a project's reconcile covers.
 *
 * It kept catalog rows by id, so a second copy of a kind (`erp-integration-2`,
 * AB-23) had no row and its required APIs were never asked for. A copy is now its
 * catalog entry under its own id, as `catalogEntryFor` answers everywhere else.
 */

import { entriesThatNeedApis } from '@/features/app-builder/services/apiSubscriber';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

const entry = (
    id: string,
    kind: AppBuilderComponentCatalogEntry['kind'],
    requiredApis: string[] = [],
): AppBuilderComponentCatalogEntry => ({
    id,
    name: id,
    description: id,
    kind,
    requiredApis,
    source: { owner: 'o', repo: id, branch: 'main' },
});

const CATALOG = [entry('commerce-mesh', 'mesh'), entry('erp-integration', 'integration', ['ACCS-REST-API']), entry('unused', 'integration')];

const record = (catalogId?: string): AppBuilderComponentState => ({
    kind: 'integration',
    status: 'deployed',
    source: { owner: 'o', repo: 'r' },
    ...(catalogId ? { catalogId } : {}),
});

describe('entriesThatNeedApis', () => {
    it('keeps the meshes and the kinds the project has, as before', () => {
        const ids = entriesThatNeedApis(CATALOG, { appBuilderComponents: { 'erp-integration': record() } }).map((e) => e.id);

        expect(ids).toEqual(['commerce-mesh', 'erp-integration']);
    });

    it('answers a second copy as its catalog entry under its own id', () => {
        const entries = entriesThatNeedApis(CATALOG, {
            appBuilderComponents: { 'erp-integration': record(), 'erp-integration-2': record('erp-integration') },
        });

        const copy = entries.find((e) => e.id === 'erp-integration-2');
        expect(copy).toMatchObject({ catalogId: 'erp-integration', requiredApis: ['ACCS-REST-API'] });
        expect(entries.map((e) => e.id)).toEqual(['commerce-mesh', 'erp-integration', 'erp-integration-2']);
    });
});
