/**
 * The two status vocabularies must stay word-for-word in step.
 *
 * One mesh state is rendered on two surfaces by two tables:
 *
 * - the integrations grid's mesh card reads `CARD_STATUS_DISPLAY`
 *   (integrationCardModel), keyed by the CARD status;
 * - the project dashboard's mesh status reads `MESH_STATUS_DISPLAY`
 *   (core/ui/utils, via `useDashboardStatus`), keyed by the PERSISTED status.
 *
 * This used to be driven through `getMeshStatusText`, the projects-list card's
 * accessor, which added a `Mesh · ` prefix. That card no longer names the mesh —
 * it carries one consolidated deployment line — so the test drives the shared
 * table directly. The contract is between the two TABLES; the accessor was only
 * ever how one of them was reached.
 *
 * They were not merged, deliberately. The persisted vocabulary carries a
 * `color`/`variant` the grid has no use for and draws distinctions the grid
 * collapses (`stale` yellow vs `update-declined` orange), so one table would have
 * had to flatten something true. What must never drift is the WORDING: the two
 * cards sit one click apart, and until 2026-08-04 they described the same state
 * differently — "Deployed" vs "Mesh Deployed", "Deploy failed" vs "Mesh Error".
 *
 * So this pins the overlap instead of the implementation. It drives both public
 * derivations and compares what a user would actually read, which means it also
 * catches a divergence introduced through `toMeshCardStatus` rather than through
 * either table.
 */

import { deriveMeshCard, display, meshEntry } from './integrationCardModel.testUtils';
import { getMeshStatusDisplay } from '@/core/ui/utils/meshStatusDisplay';
import type { MeshStatus } from '@/features/dashboard/ui/hooks/useDashboardStatus';

/**
 * The persisted mesh states — every one a project can still be in after a reload.
 * The transient three (checking / needs-auth / deploying) are excluded on purpose:
 * they never reach the projects-list card, and the grid answers them with live
 * text rather than a table, so there is no shared wording to pin.
 *
 * 'config-changed' is absent for a different reason: it is never persisted.
 * `dashboardHandlers` normalizes it to 'stale' on the way in, and
 * `useDashboardStatus` invents it on the way out only to translate it back for
 * the lookup — a round trip from 'stale' to 'stale'.
 */
const SETTLED_MESH_STATUSES = [
    'deployed',
    'stale',
    'config-incomplete',
    'update-declined',
    'error',
    'not-deployed',
] as const;

describe('grid and projects-list describe a mesh state identically', () => {
    it.each(SETTLED_MESH_STATUSES)('%s reads the same on both surfaces', (status) => {
        const gridLabel = deriveMeshCard(
            display({ text: 'live text the settled path must ignore' }),
            status as MeshStatus,
            meshEntry(),
            false
        ).statusLabel;

        expect(getMeshStatusDisplay(status)?.text).toBe(gridLabel);
    });

    it('is not vacuous — a wording change on one surface alone would fail', () => {
        // Guards the assertion above against silently comparing undefined to
        // undefined: both surfaces must actually produce a label.
        const gridLabel = deriveMeshCard(display(), 'deployed', meshEntry(), false).statusLabel;

        expect(gridLabel).toBe('Deployed');
        expect(getMeshStatusDisplay('deployed')?.text).toBe('Deployed');
    });
});
