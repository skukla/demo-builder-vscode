/**
 * The storefront republish that runs inside an add or a deploy has to be HEARD
 * when it does not land.
 *
 * 2026-09-24: an add finished "done" while its republish had pushed config.json
 * to GitHub and the CDN publish had been refused (no DA.live session). Only the
 * Debug Logs said so; the SC saw a green tile over a storefront serving the
 * previous config.json. The runner now carries that as a warning on its result,
 * the way a removal carries its leftovers, and the dashboard shows it.
 *
 * Every assertion here is on the runner's RESULT, given what the republish dep
 * answered — never on a log line.
 */

import { mockWithOrgContext } from './appBuilderComponentRunner.orgContextMock';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockDetectAppLayout = jest.fn().mockResolvedValue('standalone');
jest.mock('@/features/app-builder/services/appConfigPackages', () => ({
    listDeclaredPackageNames: jest.fn().mockResolvedValue([]),
    listDeclaredTriggersAndRules: jest.fn().mockResolvedValue({ triggers: [], rules: [] }),
    detectAppLayout: (...args: unknown[]) => mockDetectAppLayout(...args),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import {
    addAppBuilderComponent,
    deployAppBuilderComponent,
} from '@/features/app-builder/services/appBuilderComponentRunner';
import { MESH_ENTRY, createDeps, createProject } from './appBuilderComponentRunner.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    mockDetectAppLayout.mockResolvedValue('standalone');
    mockWithOrgContext.mockImplementation((_target: unknown, fn: () => Promise<unknown>) => fn());
});

describe('an add whose storefront republish did not land', () => {
    it('stands, and warns that the storefront still serves its previous config.json', async () => {
        const deps = createDeps({
            republishStorefront: jest.fn(async () => ({
                success: true,
                cdnError: 'No DA.live session — sign in to DA.live and republish from the dashboard.',
            })),
        });

        const result = await addAppBuilderComponent(createProject(), MESH_ENTRY, deps);

        expect(result.success).toBe(true);
        expect(result.warnings).toEqual([
            'The storefront still serves its previous config.json: No DA.live session — ' +
                'sign in to DA.live and republish from the dashboard.',
        ]);
    });

    it('a republish that failed outright is a warning too, not a failed add', async () => {
        const deps = createDeps({
            republishStorefront: jest.fn(async () => ({ success: false, error: 'push rejected' })),
        });

        const result = await addAppBuilderComponent(createProject(), MESH_ENTRY, deps);

        expect(result.success).toBe(true);
        expect(result.warnings).toEqual(['The storefront was not republished: push rejected']);
    });

    it('a clean republish carries no warnings key at all', async () => {
        const result = await addAppBuilderComponent(createProject(), MESH_ENTRY, createDeps());

        expect(result).toEqual({ success: true });
    });
});

describe('a deploy whose storefront republish did not land', () => {
    it('stands, and carries the same warning', async () => {
        const deps = createDeps({
            republishStorefront: jest.fn(async () => ({ success: true, cdnError: 'CDN said no' })),
        });
        const project = createProject();
        // The entry has to exist to be deployed: an add puts it there.
        await addAppBuilderComponent(project, MESH_ENTRY, createDeps());

        const result = await deployAppBuilderComponent(project, MESH_ENTRY.id, deps);

        expect(result.success).toBe(true);
        expect(result.warnings).toEqual([
            'The storefront still serves its previous config.json: CDN said no',
        ]);
    });
});
