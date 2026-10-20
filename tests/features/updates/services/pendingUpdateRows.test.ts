/**
 * pendingUpdateRows — what the Updates modal draws from one check, and what a set of
 * ticked ids applies (PL-80).
 *
 * The rows are the SC's whole view of the check: under which heading each update sits,
 * what it is called, what it changes, and whether it starts ticked. The ids are the only
 * thing that comes back, so they must lead to exactly the entries they were made from.
 */

import {
    selectionsForIds,
    toPendingUpdateRows,
} from '@/features/updates/services/pendingUpdateRows';
import type { UpdateSelections } from '@/features/updates/services/updateSelections';
import type { Project } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import { createMockProject } from '../../../helpers/projectFake';

const justrite = createMockProject({ name: 'justrite', title: 'JustRite', path: '/p/justrite' });
const bodea = createMockProject({ name: 'bodea', title: 'Bodea', path: '/p/bodea' });
const canary = createMockProject({ name: 'patch-canary-b2b', path: '/p/canary' });

const library: InstalledBlockLibrary = {
    name: 'Demo Builder Blocks',
    source: { owner: 'skukla', repo: 'demo-builder-block-library', branch: 'main' },
    commitSha: 'b160c2fc3',
    blockIds: ['catalog-menu'],
    installedAt: '2026-10-09T03:30:00.646Z',
};

function empty(): UpdateSelections {
    return {
        forkSync: [],
        template: [],
        component: [],
        adobeMcp: [],
        blockLibrary: [],
        blockLibraryInstall: [],
        inspector: [],
        integration: [],
    };
}

const pair = (project: Project, otherOrg: boolean) => ({
    project,
    componentId: 'erp-integration',
    members: ['erp-integration', 'demo-erp'],
    label: 'ERP Integration and Justrite ERP',
    otherOrg,
});

describe('toPendingUpdateRows', () => {
    it('words every kind of update, under its project, everything ticked but the redeploy', () => {
        const sel: UpdateSelections = {
            ...empty(),
            template: [{ project: bodea }],
            component: [
                {
                    project: bodea,
                    componentId: 'eds-storefront',
                    latestVersion: '6.1.0',
                    currentVersion: '6.0.0',
                },
            ],
            adobeMcp: [
                {
                    project: bodea,
                    packageName: '@adobe/mcp',
                    latestVersion: '1.1.0',
                    currentVersion: '1.0.0',
                },
            ],
            blockLibrary: [{ project: bodea, library, latestCommit: 'x' }],
            blockLibraryInstall: [
                { project: bodea, library: { name: 'Bodea Blocks', source: library.source } },
            ],
            inspector: [{ project: bodea, latestCommit: 'y' }],
            integration: [pair(bodea, false)],
        };

        const rows = toPendingUpdateRows(sel, undefined, undefined);

        expect(rows.map((r) => [r.group.title, r.label, r.detail, r.ticked])).toEqual([
            ['Bodea', 'EDS template', 'Newer version', true],
            ['Bodea', 'eds-storefront', '6.0.0 → 6.1.0', true],
            ['Bodea', 'Adobe MCP', '1.0.0 → 1.1.0', true],
            ['Bodea', 'Demo Builder Blocks', 'Newer version', true],
            ['Bodea', 'Bodea Blocks', 'install', true],
            ['Bodea', 'Demo Inspector SDK', 'Newer version', true],
            ['Bodea', 'ERP Integration and Justrite ERP', 'Newer version, redeploys to Adobe', false],
        ]);
    });

    // Applying a pair deploys it to the live Adobe workspace, and nothing asks first: the
    // tick IS the confirmation, so the SC gives it rather than finds it given (owner,
    // 2026-10-20). Unticked is not locked: it can be ticked.
    it('starts an integration pair unticked, saying it redeploys, and leaves it tickable', () => {
        const [row] = toPendingUpdateRows({ ...empty(), integration: [pair(bodea, false)] }, undefined, undefined);

        expect(row).toMatchObject({ ticked: false, detail: 'Newer version, redeploys to Adobe' });
        expect(row.lockedReason).toBeUndefined();
        expect(selectionsForIds({ ...empty(), integration: [pair(bodea, false)] }, [row.id]).selections.integration)
            .toHaveLength(1);
    });

    it("names a component by the project's own name for it", () => {
        const project = createMockProject({
            path: '/p/bodea',
            componentInstances: {
                'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', status: 'ready' },
            },
        });
        const sel = {
            ...empty(),
            component: [{ project, componentId: 'eds-storefront', latestVersion: '6.1.0' }],
        };

        const [row] = toPendingUpdateRows(sel, undefined, undefined);

        expect([row.label, row.detail]).toEqual(['EDS Storefront', 'version 6.1.0']);
    });

    it('puts Demo Builder first, the open project next, the others by name, and the template repositories last', () => {
        const sel: UpdateSelections = {
            ...empty(),
            forkSync: [
                {
                    owner: 'skukla',
                    repo: 'citisignal',
                    branch: 'main',
                    parentFullName: 'adobe/citisignal',
                },
            ],
            blockLibrary: [canary, justrite, bodea].map((project) => ({
                project,
                library,
                latestCommit: 'x',
            })),
        };

        const rows = toPendingUpdateRows(
            sel,
            { current: '1.0.0-beta.149', latest: '1.0.0-beta.150' },
            '/p/justrite'
        );

        expect(rows.map((r) => r.group.title)).toEqual([
            'Demo Builder',
            'JustRite',
            'Bodea',
            'patch-canary-b2b',
            'Template repositories',
        ]);
        expect([rows[0].label, rows[0].detail]).toEqual([
            'Demo Builder extension',
            '1.0.0-beta.149 → 1.0.0-beta.150',
        ]);
        expect([rows[4].label, rows[4].detail]).toEqual([
            'skukla/citisignal',
            'Newer version from adobe/citisignal',
        ]);
    });

    it('shows an integration pair in another Adobe org unticked and locked, saying why', () => {
        const [row] = toPendingUpdateRows(
            { ...empty(), integration: [pair(justrite, true)] },
            undefined,
            undefined
        );

        expect(row.ticked).toBe(false);
        expect(row.lockedReason).toBe(
            'This project uses a different Adobe organization: open that project and update it from its Integrations screen'
        );
    });

    it('gives every row an id no other row has', () => {
        const sel: UpdateSelections = {
            ...empty(),
            blockLibrary: [justrite, bodea].map((project) => ({
                project,
                library,
                latestCommit: 'x',
            })),
            inspector: [{ project: justrite, latestCommit: 'y' }],
        };

        const ids = toPendingUpdateRows(sel, { current: '1', latest: '2' }, undefined).map(
            (r) => r.id
        );

        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('selectionsForIds', () => {
    it('applies exactly the entries whose rows stayed ticked', () => {
        const sel: UpdateSelections = {
            ...empty(),
            blockLibrary: [justrite, bodea].map((project) => ({
                project,
                library,
                latestCommit: 'x',
            })),
            template: [{ project: bodea }],
        };
        const rows = toPendingUpdateRows(sel, { current: '1', latest: '2' }, undefined);
        const justriteLibrary = rows.find(
            (r) => r.kind === 'blockLibrary' && r.group.key === '/p/justrite'
        );

        const picked = selectionsForIds(sel, [justriteLibrary?.id ?? '']);

        expect(picked.extension).toBe(false);
        expect(picked.selections.blockLibrary.map((b) => b.project.path)).toEqual(['/p/justrite']);
        expect(picked.selections.template).toStrictEqual([]);
    });

    it('says when the extension update was ticked', () => {
        const picked = selectionsForIds(empty(), ['extension']);

        expect(picked.extension).toBe(true);
    });

    it('never applies a locked row, even when its id is sent', () => {
        const sel = { ...empty(), integration: [pair(justrite, true)] };
        const [row] = toPendingUpdateRows(sel, undefined, undefined);

        expect(selectionsForIds(sel, [row.id]).selections.integration).toStrictEqual([]);
    });

    it('ignores an id that no row has', () => {
        const picked = selectionsForIds({ ...empty(), template: [{ project: bodea }] }, [
            'template:7',
            'nonsense',
        ]);

        expect(picked.selections.template).toStrictEqual([]);
    });
});
