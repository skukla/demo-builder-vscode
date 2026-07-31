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

import {
    migrateApiPicks,
    resolveDesiredApis,
    UNATTRIBUTED_PICKS_KEY,
} from '@/core/state/componentApiPicks';
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
