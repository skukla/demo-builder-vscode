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
import type { Project } from '@/types/base';

function project(overrides: Partial<Project> = {}): Project {
    return { name: 'p', path: '/p', ...overrides } as unknown as Project;
}

describe('resolveDesiredApis', () => {
    it("unions every component's picks, deduped and stable", () => {
        const p = project({
            componentApiPicks: {
                'erp-sync': ['AssetsSDK', 'FireflySDK'],
                loyalty: ['AssetsSDK', 'EventsSDK'],
            },
        } as Partial<Project>);

        expect(resolveDesiredApis(p).sort()).toEqual(['AssetsSDK', 'EventsSDK', 'FireflySDK']);
    });

    it('returns an empty list when nothing is picked', () => {
        expect(resolveDesiredApis(project())).toEqual([]);
        expect(resolveDesiredApis(project({ componentApiPicks: {} } as Partial<Project>))).toEqual(
            []
        );
    });

    it('reads the LEGACY flat field when the keyed map is absent', () => {
        // Un-migrated project (older manifest, or one loaded by a path that does
        // not migrate). The union must still be correct, not empty — an empty
        // desired set would unsubscribe everything on the next PUT.
        const p = project({ additionalConsoleApis: ['AssetsSDK'] } as Partial<Project>);

        expect(resolveDesiredApis(p)).toEqual(['AssetsSDK']);
    });

    it('IGNORES the legacy field once a keyed map exists (keyed is authoritative)', () => {
        const p = project({
            componentApiPicks: { 'erp-sync': ['FireflySDK'] },
            additionalConsoleApis: ['AssetsSDK'],
        } as Partial<Project>);

        expect(resolveDesiredApis(p)).toEqual(['FireflySDK']);
    });

    it('drops empty entries so a cleared component contributes nothing', () => {
        const p = project({
            componentApiPicks: { 'erp-sync': [], loyalty: ['AssetsSDK'] },
        } as Partial<Project>);

        expect(resolveDesiredApis(p)).toEqual(['AssetsSDK']);
    });
});

describe('migrateApiPicks', () => {
    it('moves the flat array under the unattributed key', () => {
        // The picks predate attribution and CANNOT be assigned an owner —
        // no owner is guessed. `__existing__` is the shape the wizard already
        // models (RESERVED_EXISTING_KEY) for exactly this case.
        const p = project({
            additionalConsoleApis: ['AssetsSDK', 'FireflySDK'],
        } as Partial<Project>);

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
        } as Partial<Project>);

        expect(migrateApiPicks(p).componentApiPicks).toBe(picks);
    });

    it('writes NO key for a project that never had picks', () => {
        // An empty `{}` and an absent map both mean "nothing picked", but an
        // empty object would persist a meaningless field into every manifest.
        expect(migrateApiPicks(project()).componentApiPicks).toBeUndefined();
        expect(
            migrateApiPicks(project({ additionalConsoleApis: [] } as Partial<Project>))
                .componentApiPicks
        ).toBeUndefined();
    });

    it('does not mutate the input project', () => {
        const p = project({ additionalConsoleApis: ['AssetsSDK'] } as Partial<Project>);

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
        const before = project({ additionalConsoleApis: flat } as Partial<Project>);

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
});
