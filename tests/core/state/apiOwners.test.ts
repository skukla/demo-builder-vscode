/**
 * resolveApiOwners — the bridge step 04 needs between a project and the step-03 resolver.
 *
 * `resolveApiRowStates` takes `ApiOwner[]`: every integration in the project, its display
 * name, and the APIs its catalog entry declares. Nothing built that list — step 03 shipped
 * the resolver with zero production consumers. This is that list.
 *
 * The name matters as much as the id: a locked row's whole job is to name WHO is holding
 * the code, so an owner that resolves to a blank or missing name produces a lock with no
 * stated reason, which is the thing the four-state model exists to avoid.
 */

import { resolveApiOwners } from '@/core/state/apiOwners';
import type { Project } from '@/types/base';

jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    getAppBuilderComponentEntry: (id: string) =>
        ({
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'Commerce Mesh',
                requiredApis: ['GraphQLServiceSDK'],
            },
            'erp-sync': { id: 'erp-sync', name: 'ERP Sync', requiredApis: ['CommerceEventingSDK'] },
        })[id],
}));

function projectWith(components: Project['appBuilderComponents']): Project {
    return { appBuilderComponents: components } as Project;
}

describe('resolveApiOwners', () => {
    it('names each integration and carries its catalog-declared requiredApis', () => {
        const owners = resolveApiOwners(
            projectWith({
                'commerce-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'o', repo: 'r' },
                },
            })
        );

        expect(owners).toEqual([
            { id: 'commerce-mesh', name: 'Commerce Mesh', requiredApis: ['GraphQLServiceSDK'] },
        ]);
    });

    it('prefers the persisted display name over the catalog name', () => {
        // A user-renamed integration must lock rows under the name they gave it —
        // naming the catalog entry instead would point at something they cannot see.
        const owners = resolveApiOwners(
            projectWith({
                'erp-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'NetSuite',
                    source: { owner: 'o', repo: 'r' },
                },
            })
        );

        expect(owners[0].name).toBe('NetSuite');
        expect(owners[0].requiredApis).toEqual(['CommerceEventingSDK']);
    });

    it('falls back to the id when neither a persisted nor a catalog name exists', () => {
        // A custom/imported integration has no catalog entry. It still owns codes, so
        // it must still be nameable — an empty name renders a lock with no reason.
        const owners = resolveApiOwners(
            projectWith({
                'my-custom-thing': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'o', repo: 'r' },
                },
            })
        );

        expect(owners).toEqual([
            { id: 'my-custom-thing', name: 'my-custom-thing', requiredApis: [] },
        ]);
    });

    it('returns every integration, not just the deployed ones', () => {
        // A not-yet-deployed integration still declares requiredApis, and its claim is
        // why a row is locked. Filtering by status would silently unlock those codes.
        const owners = resolveApiOwners(
            projectWith({
                'commerce-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: 'o', repo: 'r' },
                },
                'erp-sync': {
                    kind: 'integration',
                    status: 'not-deployed',
                    source: { owner: 'o', repo: 'r' },
                },
            })
        );

        expect(owners.map((o) => o.id).sort()).toEqual(['commerce-mesh', 'erp-sync']);
    });

    it('returns an empty list for a project with no integrations', () => {
        expect(resolveApiOwners({} as Project)).toEqual([]);
    });
});
