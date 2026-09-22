/**
 * componentApiPicks Tests — per-integration API attribution, step 01
 *
 * The wizard already keys API picks per integration (`selectedConsoleApis:
 * Record<componentId, string[]>`), and `wizardHelpers` flattens them into one
 * `project.additionalConsoleApis` at the persist boundary. This module is the
 * keyed store that ends the flattening, plus the read-time union that replaces it.
 *
 * Step 01 is BEHAVIOUR-PRESERVING: the union computed from the migrated keyed
 * map must equal the flat array exactly. If it ever shrinks, the next subscribe
 * PUT — which sets extras to EXACTLY the desired list — unsubscribes a live API
 * on a working project. That is the golden test below.
 */

import { UNATTRIBUTED_PICKS_KEY, applyDesiredApis, migrateApiPicks, resolveDesiredApis } from '@/core/state/componentApiPicks';
import { RESERVED_EXISTING_KEY } from '@/features/project-creation/ui/components/integration-flow/flowStages';
import type { Project } from '@/types/base';
import { createMockProject } from '../../helpers/projectFake';

function project(overrides: Partial<Project> = {}): Project {
    return createMockProject({ name: 'p', path: '/p', ...overrides });
}

describe('resolveDesiredApis — narrowed to ONE component (AB-23)', () => {
    /**
     * A component with a workspace of its own must not have the project's whole
     * union subscribed to that workspace's credential: each extra is a product
     * profile attached to a credential nothing there uses, and the Commerce one
     * is the attach step that has been fragile.
     */
    it("returns only that component's picks", () => {
        const p = project({
            componentApiPicks: {
                'erp-sync': ['AssetsSDK', 'FireflySDK'],
                'starter-kit': ['CloudIntegrationSDK'],
            },
        });

        expect(resolveDesiredApis(p, 'erp-sync').sort()).toEqual(['AssetsSDK', 'FireflySDK']);
    });

    /**
     * Their owner is unrecoverable by construction, so leaving them out of a NEW
     * workspace would silently drop an API an SC added by hand, with no way to
     * tell which component wanted it.
     */
    it('carries the UNATTRIBUTED picks along with every component', () => {
        const p = project({
            componentApiPicks: {
                'erp-sync': ['AssetsSDK'],
                [UNATTRIBUTED_PICKS_KEY]: ['LegacyPickSDK'],
            },
        });

        expect(resolveDesiredApis(p, 'erp-sync').sort()).toEqual(['AssetsSDK', 'LegacyPickSDK']);
    });

    it('answers just the unattributed ones for a component with no picks', () => {
        const p = project({
            componentApiPicks: {
                'erp-sync': ['AssetsSDK'],
                [UNATTRIBUTED_PICKS_KEY]: ['LegacyPickSDK'],
            },
        });

        expect(resolveDesiredApis(p, 'starter-kit')).toEqual(['LegacyPickSDK']);
    });

    it('answers empty for an unknown component when nothing is unattributed', () => {
        const p = project({ componentApiPicks: { 'erp-sync': ['AssetsSDK'] } });

        expect(resolveDesiredApis(p, 'never-heard-of-it')).toStrictEqual([]);
    });

    /**
     * Narrowing ADDS fewer, it never removes: `buildSubscriptionList` carries every
     * current subscription forward with its profiles since 2026-09-19, and a code
     * leaves only when a caller names it in `removing`. The empty answer above is
     * therefore safe — which was NOT true before that merge landed.
     */
    it('CONTROL: without a component id the union is unchanged', () => {
        const p = project({
            componentApiPicks: {
                'erp-sync': ['AssetsSDK'],
                'starter-kit': ['CloudIntegrationSDK'],
            },
        });

        expect(resolveDesiredApis(p).sort()).toEqual(['AssetsSDK', 'CloudIntegrationSDK']);
    });

    // The keyed map wins over the legacy field, so a migrated project narrows too;
    // one that has NOT migrated has no attribution to narrow by and reports its
    // whole flat list, which is the only honest answer.
    it('falls back to the whole legacy list when no keyed map exists', () => {
        const p = project({ additionalConsoleApis: ['AssetsSDK', 'FireflySDK'] });

        expect(resolveDesiredApis(p, 'erp-sync').sort()).toEqual(['AssetsSDK', 'FireflySDK']);
    });
});

describe('resolveDesiredApis', () => {
    it("unions every component's picks, deduped and stable", () => {
        const p = project({
            componentApiPicks: {
                'erp-sync': ['AssetsSDK', 'FireflySDK'],
                loyalty: ['AssetsSDK', 'EventsSDK'],
            },
        });

        expect(resolveDesiredApis(p).sort()).toEqual(['AssetsSDK', 'EventsSDK', 'FireflySDK']);
    });

    it('returns an empty list when nothing is picked', () => {
        expect(resolveDesiredApis(project())).toStrictEqual([]);
        expect(resolveDesiredApis(project({ componentApiPicks: {} }))).toStrictEqual([]);
    });

    it('reads the LEGACY flat field when the keyed map is absent', () => {
        // Un-migrated project (older manifest, or one loaded by a path that does
        // not migrate). The union must still be correct, not empty — an empty
        // desired set would unsubscribe everything on the next PUT.
        const p = project({ additionalConsoleApis: ['AssetsSDK'] });

        expect(resolveDesiredApis(p)).toEqual(['AssetsSDK']);
    });

    it('IGNORES the legacy field once a keyed map exists (keyed is authoritative)', () => {
        const p = project({
            componentApiPicks: { 'erp-sync': ['FireflySDK'] },
            additionalConsoleApis: ['AssetsSDK'],
        });

        expect(resolveDesiredApis(p)).toEqual(['FireflySDK']);
    });

    it('drops empty entries so a cleared component contributes nothing', () => {
        const p = project({
            componentApiPicks: { 'erp-sync': [], loyalty: ['AssetsSDK'] },
        });

        expect(resolveDesiredApis(p)).toEqual(['AssetsSDK']);
    });
});

describe('migrateApiPicks', () => {
    it('files unattributed picks under the SAME key the wizard reserves for them', () => {
        // Two modules model "we already lost the owner once"; a project written
        // by one and read by the other must agree on the spelling.
        expect(UNATTRIBUTED_PICKS_KEY).toBe(RESERVED_EXISTING_KEY);
    });

    it('moves the flat array under the unattributed key', () => {
        // The picks predate attribution and CANNOT be assigned an owner —
        // no owner is guessed. `__existing__` is the shape the wizard already
        // models (RESERVED_EXISTING_KEY) for exactly this case.
        const p = project({
            additionalConsoleApis: ['AssetsSDK', 'FireflySDK'],
        });

        const migrated = migrateApiPicks(p);

        expect(migrated.componentApiPicks).toEqual({
            [UNATTRIBUTED_PICKS_KEY]: ['AssetsSDK', 'FireflySDK'],
        });
    });

    it('leaves an already-keyed project untouched', () => {
        const picks = { 'erp-sync': ['AssetsSDK'] };
        const p = project({
            componentApiPicks: picks,
            additionalConsoleApis: ['FireflySDK'],
        });

        expect(migrateApiPicks(p).componentApiPicks).toBe(picks);
    });

    it('writes NO key for a project that never had picks', () => {
        // An empty `{}` and an absent map both mean "nothing picked", but an
        // empty object would persist a meaningless field into every manifest.
        expect(migrateApiPicks(project()).componentApiPicks).toBeUndefined();
        expect(
            migrateApiPicks(project({ additionalConsoleApis: [] }))
                .componentApiPicks
        ).toBeUndefined();
    });

    it('does not mutate the input project', () => {
        const p = project({ additionalConsoleApis: ['AssetsSDK'] });

        migrateApiPicks(p);

        expect(p.componentApiPicks).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// THE golden test. See the module header: a shrinking union unsubscribes live
// APIs on a real workspace, which is the one failure mode here that damages
// something outside the extension.
// ---------------------------------------------------------------------------
describe('migration is UNION-PRESERVING', () => {
    it.each([
        [[]],
        [['AssetsSDK']],
        [['AssetsSDK', 'FireflySDK', 'EventsSDK']],
        [['AssetsSDK', 'AssetsSDK']], // a duplicated legacy entry
    ])('resolveDesiredApis(migrate(p)) === the pre-migration set: %j', (flat) => {
        const before = project({ additionalConsoleApis: flat });

        const beforeSet = [...new Set(resolveDesiredApis(before))].sort();
        const afterSet = [...new Set(resolveDesiredApis(migrateApiPicks(before)))].sort();

        expect(afterSet).toEqual(beforeSet);
    });
});

/**
 * Manage APIs edits the UNION of every integration's picks, then Apply persists
 * the result. Persisting it as `{ __existing__: desired }` — which is what the
 * handler did — throws away the attribution this whole module exists to keep:
 * afterwards nothing can tell whose requirement an API is, so nothing can tell
 * whether removing an integration makes it safe to drop.
 *
 * That was latent while nothing attributed picks. Once the dashboard Add flow
 * started recording them (2026-08-04), the first Apply would have erased it.
 */
describe('applyDesiredApis — editing the union without losing attribution', () => {
    const picks = {
        'order-sync': ['EventsSDK', 'SharedSDK'],
        'erp-bridge': ['SharedSDK', 'ErpSDK'],
    };

    it('keeps each surviving code attributed to its owner', () => {
        const next = applyDesiredApis({ componentApiPicks: picks }, [
            'EventsSDK',
            'SharedSDK',
            'ErpSDK',
        ]);

        expect(next).toEqual(picks);
    });

    it('drops a removed code from EVERY owner that claimed it', () => {
        // SharedSDK is wanted by both; unchecking it in the union must clear both,
        // or the next reconcile would re-add what the user just removed.
        const next = applyDesiredApis({ componentApiPicks: picks }, ['EventsSDK', 'ErpSDK']);

        expect(next).toEqual({ 'order-sync': ['EventsSDK'], 'erp-bridge': ['ErpSDK'] });
    });

    it('files a newly added code under the unattributed bucket', () => {
        // Added from the union view, so there is no owner to infer — and guessing
        // one would be worse than admitting we do not know.
        const next = applyDesiredApis({ componentApiPicks: picks }, [
            'EventsSDK',
            'SharedSDK',
            'ErpSDK',
            'NewSDK',
        ]);

        expect(next[UNATTRIBUTED_PICKS_KEY]).toEqual(['NewSDK']);
    });

    it('drops an owner whose every code was removed, rather than leaving an empty key', () => {
        const next = applyDesiredApis({ componentApiPicks: picks }, ['ErpSDK']);

        expect(next).toEqual({ 'erp-bridge': ['ErpSDK'] });
        expect('order-sync' in next).toBe(false);
    });

    it('migrates a legacy flat project instead of silently starting empty', () => {
        const next = applyDesiredApis({ additionalConsoleApis: ['LegacySDK'] }, [
            'LegacySDK',
            'NewSDK',
        ]);

        expect(next[UNATTRIBUTED_PICKS_KEY]).toEqual(['LegacySDK', 'NewSDK']);
    });

    it('keeps surviving legacy picks in their recorded order, ahead of additions', () => {
        // The legacy list is migrated (deduped, order kept) BEFORE the edit is
        // applied, so a surviving pick keeps its place and an addition appends —
        // even when the user's desired list names the addition first.
        const next = applyDesiredApis(
            { additionalConsoleApis: ['SharedSDK', 'LegacySDK', 'LegacySDK'] },
            ['NewSDK', 'LegacySDK', 'SharedSDK'],
        );

        expect(next).toEqual({ [UNATTRIBUTED_PICKS_KEY]: ['SharedSDK', 'LegacySDK', 'NewSDK'] });
    });
});

// Found 2026-09-21 and fixed on the owner's word: the project's workspace was handed
// the picks of integrations living in workspaces of their own, so Production held
// APIs nothing in it uses. The project-wide list is now the project workspace's.
describe('the project-wide list leaves out integrations with a workspace of their own', () => {
    const OWN = { id: 'ws-erp', name: 'Northwind-ERP' };
    const record = (workspace?: typeof OWN) => ({
        kind: 'integration' as const,
        status: 'deployed' as const,
        source: { owner: 'o', repo: 'r' },
        ...(workspace ? { workspace } : {}),
    });
    const bodea = () =>
        project({
            appBuilderComponents: { 'erp-integration': record(OWN), 'firefly-app': record() },
            componentApiPicks: {
                'erp-integration': ['commerceeventing'],
                'firefly-app': ['FireflySDK'],
                [UNATTRIBUTED_PICKS_KEY]: ['CCAPI'],
            },
        });

    it('resolves the project workspace without them', () => {
        expect(resolveDesiredApis(bodea()).sort()).toEqual(['CCAPI', 'FireflySDK']);
    });

    it('CONTROL: asked for that integration, its picks are still there', () => {
        expect(resolveDesiredApis(bodea(), 'erp-integration').sort()).toEqual(['CCAPI', 'commerceeventing']);
    });

    it("keeps their picks untouched when the project's list is edited", () => {
        expect(applyDesiredApis(bodea(), ['FireflySDK'])).toEqual({
            'erp-integration': ['commerceeventing'],
            'firefly-app': ['FireflySDK'],
        });
    });

    it("records a project-workspace pick of the same code as the project's own", () => {
        expect(applyDesiredApis(bodea(), ['FireflySDK', 'commerceeventing'])).toEqual({
            'erp-integration': ['commerceeventing'],
            'firefly-app': ['FireflySDK'],
            [UNATTRIBUTED_PICKS_KEY]: ['commerceeventing'],
        });
    });
});
