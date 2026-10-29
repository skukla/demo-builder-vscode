/**
 * pendingUpdateRows — what the Updates modal draws from one check, and what a set of
 * ticked ids applies (PL-80).
 *
 * The rows are the SC's whole view of the check: under which heading each update sits,
 * what it is called, what it changes, and whether it starts ticked. The ids are the only
 * thing that comes back, so they must lead to exactly the entries they were made from.
 */

import {
    rowIdsOf,
    selectionsForIds,
    toPendingUpdateRows,
} from '@/features/updates/services/pendingUpdateRows';
import type { BoilerplateBase } from '@/features/updates/services/boilerplateBase';
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
        boilerplate: [],
        finish: [],
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

/** A row that commits to the storefront repository, which the live site serves. */
const LIVE = 'Updates the live site';

/** A storefront whose template is followed through our patches repo's tested pointer. */
function storefront(metadata: Record<string, unknown>): Project {
    return createMockProject({
        name: 'justrite',
        title: 'JustRite',
        path: '/p/justrite',
        componentInstances: {
            'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', type: 'frontend', status: 'ready', metadata },
        },
    });
}

describe('toPendingUpdateRows', () => {
    // Owner, 2026-10-20: two different updates read "EDS template". On a storefront that
    // follows our tested pointer it IS Adobe's template; on one added from a colleague's
    // repository it is that colleague's changes, and says whose.
    it.each([
        ['follows our tested template', { lkgSource: { owner: 'skukla', repo: 'eds-demo-patches' }, templateOwner: 'adobe-commerce', templateRepo: 'boilerplate-b2b-template' }, 'EDS template'],
        ["follows a colleague's repository", { templateOwner: 'kmanns', templateRepo: 'justrite' }, 'Changes from kmanns/justrite'],
    ])('names the template row by where it comes from: a storefront that %s', (_label, metadata, expected) => {
        const [row] = toPendingUpdateRows({ ...empty(), template: [{ project: storefront(metadata) }] }, undefined, undefined);

        expect(row).toMatchObject({ label: expected, detail: LIVE });
    });

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
            ['Bodea', 'EDS template', LIVE, true],
            ['Bodea', 'eds-storefront', '6.0.0 → 6.1.0', true],
            ['Bodea', 'Adobe MCP', '1.0.0 → 1.1.0', true],
            ['Bodea', 'Demo Builder Blocks', LIVE, true],
            ['Bodea', 'Demo Inspector SDK', 'Newer version', true],
            ['Bodea', 'Bodea Blocks', 'install, updates the live site', true],
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

    // The order they apply (owner, 2026-10-21): the repositories a template update reads
    // from first, Demo Builder last since it ends by offering a reload.
    it('puts the template repositories first, the open project next, the others by name, and Demo Builder last', () => {
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
            'Template repositories',
            'JustRite',
            'Bodea',
            'patch-canary-b2b',
            'Demo Builder',
        ]);
        expect([rows[0].label, rows[0].detail]).toEqual([
            'skukla/citisignal',
            'Newer version from adobe/citisignal',
        ]);
        expect([rows[4].label, rows[4].detail]).toEqual([
            'Demo Builder extension',
            '1.0.0-beta.149 → 1.0.0-beta.150',
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

describe('a colleague\'s storefront that follows both (EDS-56)', () => {
    const base: BoilerplateBase = {
        template: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
        commit: '71a67e027b4b288a67f5cda1fc106d2df9a34805',
        lkgSource: { owner: 'skukla', repo: 'eds-demo-patches', lkgFile: 'b2b/last-known-good' },
        found: 'first-commit',
    };
    const colleague = storefront({ templateOwner: 'kmanns', templateRepo: 'justrite' });
    const sel = (): UpdateSelections => ({
        ...empty(),
        template: [{ project: colleague }],
        boilerplate: [{ project: colleague, base, tested: '48bed04d072fff094b49a46709b351bd719b287a' }],
    });

    it("lists the colleague's changes, then Adobe's tested boilerplate, both ticked", () => {
        const rows = toPendingUpdateRows(sel(), undefined, undefined);

        expect(rows.map((r) => [r.group.title, r.label, r.detail, r.ticked])).toEqual([
            ['JustRite', 'Changes from kmanns/justrite', LIVE, true],
            ['JustRite', 'Adobe boilerplate', 'Tested version, updates the live site', true],
        ]);
    });

    it('applies the Adobe boilerplate row on its own', () => {
        const boilerplateRow = toPendingUpdateRows(sel(), undefined, undefined).find((r) => r.kind === 'boilerplate');

        const picked = selectionsForIds(sel(), [boilerplateRow?.id ?? '']).selections;

        expect(picked.boilerplate).toHaveLength(1);
        expect(picked.template).toStrictEqual([]);
    });
});

describe('a storefront update kept to fix with AI (EDS-57)', () => {
    const colleague = storefront({ templateOwner: 'kmanns', templateRepo: 'justrite' });
    const clash = (track: 'template' | 'boilerplate') => ({
        track,
        source: { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' },
        base: 'a'.repeat(40),
        target: 'b'.repeat(40),
        files: ['blocks/header/header.js'],
        fixes: false,
        keptAt: '2026-10-21T00:00:00.000Z',
    });

    it('lists a Finish row in the words of the update it belongs to, ticked', () => {
        const rows = toPendingUpdateRows(
            { ...empty(), finish: [{ project: colleague, clash: clash('boilerplate') }, { project: colleague, clash: clash('template') }] },
            undefined,
            undefined,
        );

        expect(rows.map((r) => [r.kind, r.label, r.detail, r.ticked])).toEqual([
            ['finish', 'Finish the Adobe boilerplate update', 'Kept to fix with AI, updates the live site', true],
            ['finish', 'Finish: Changes from kmanns/justrite', 'Kept to fix with AI, updates the live site', true],
        ]);
    });

    it('applies the Finish row it came from', () => {
        const sel = { ...empty(), finish: [{ project: colleague, clash: clash('boilerplate') }] };
        const [row] = toPendingUpdateRows(sel, undefined, undefined);

        expect(selectionsForIds(sel, [row.id]).selections.finish).toHaveLength(1);
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

describe('rowIdsOf', () => {
    // A run reports the entry it is working on; this is how the modal finds its row.
    it("names each entry by its row's id, the same entry object as the check holds", () => {
        const sel: UpdateSelections = {
            ...empty(),
            template: [{ project: bodea }],
            blockLibrary: [justrite, bodea].map((project) => ({ project, library, latestCommit: 'b' })),
        };
        const rows = toPendingUpdateRows(sel, undefined, undefined);

        const ids = rowIdsOf(sel);

        expect(ids.get(sel.blockLibrary[1])).toBe('blockLibrary:1');
        expect(ids.get(sel.template[0])).toBe('template:0');
        expect([...ids.values()].sort()).toEqual(rows.map((r) => r.id).sort());
    });
});
