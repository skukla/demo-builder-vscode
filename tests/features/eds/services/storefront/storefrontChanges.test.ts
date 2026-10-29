/**
 * The storefront changes and the "Needs reset" status they decide.
 *
 * A storefront is behind when it was built before a change to how Demo Builder builds
 * storefronts that an existing storefront does not pick up by itself. When it was built is
 * the stamp creation and reset write; a project without one falls back to its creation date,
 * and one with neither is older than every change. No GitHub read is involved: the projects
 * list computes it for every card.
 */

import { COMPONENT_IDS } from '@/core/constants';
import {
    NEEDS_RESET_LABEL,
    NEEDS_RESET_LINE,
    recordStorefrontBuilt,
    STOREFRONT_CHANGES,
    storefrontNeedsReset,
    type StorefrontChange,
} from '@/features/eds/services/storefront/storefrontChanges';
import type { Project } from '@/types/base';

const CHANGES: StorefrontChange[] = [
    { id: 'old', since: '2026-09-15', what: 'An old change.', evidence: 'test' },
    { id: 'new', since: '2026-10-22', what: 'A new change.', evidence: 'test' },
];

/** An EDS project, created on `created`, with the storefront metadata given. */
function eds(created: Date | string | undefined, metadata: Record<string, unknown> = {}): Project {
    return {
        name: 'justrite',
        path: '/p/justrite',
        status: 'ready',
        created: created as Date,
        lastModified: new Date('2026-10-23T00:00:00Z'),
        componentInstances: {
            [COMPONENT_IDS.EDS_STOREFRONT]: { id: COMPONENT_IDS.EDS_STOREFRONT, name: 'Storefront', status: 'ready', metadata },
        },
    };
}

describe('storefrontNeedsReset', () => {
    it('is false for a storefront built after every change', () => {
        expect(storefrontNeedsReset(eds(undefined, { storefrontBuiltThrough: '2026-10-22' }), CHANGES)).toBe(false);
    });

    it('is true for a storefront built before a change, whatever its creation date says', () => {
        const project = eds(new Date('2026-10-23T00:00:00Z'), { storefrontBuiltThrough: '2026-10-21' });

        expect(storefrontNeedsReset(project, CHANGES)).toBe(true);
    });

    it('is true for a storefront whose build step could not finish, even when stamped after every change', () => {
        const project = eds(undefined, { storefrontBuiltThrough: '2026-10-22', storefrontBuildIncomplete: true });

        expect(storefrontNeedsReset(project, CHANGES)).toBe(true);
    });

    it('falls back to the creation date when there is no stamp: same day is not behind', () => {
        expect(storefrontNeedsReset(eds(new Date('2026-10-22T15:00:00Z')), CHANGES)).toBe(false);
        expect(storefrontNeedsReset(eds(new Date('2026-10-21T15:00:00Z')), CHANGES)).toBe(true);
    });

    it('reads a creation date stored as a string, as a project file loaded from disk holds it', () => {
        expect(storefrontNeedsReset(eds('2026-10-23T09:00:00.000Z'), CHANGES)).toBe(false);
    });

    it('treats a storefront with neither a stamp nor a readable creation date as older than every change', () => {
        expect(storefrontNeedsReset(eds(undefined), CHANGES)).toBe(true);
        expect(storefrontNeedsReset(eds('not a date'), CHANGES)).toBe(true);
    });

    it('is false for a project with no storefront, and when no change is listed', () => {
        const noStorefront = { ...eds(undefined), componentInstances: {} };

        expect(storefrontNeedsReset(noStorefront, CHANGES)).toBe(false);
        expect(storefrontNeedsReset(eds(undefined), [])).toBe(false);
    });
});

describe('recordStorefrontBuilt', () => {
    it("stamps the newest change this version knows, not today's date", () => {
        const project = eds(undefined);

        recordStorefrontBuilt(project, true, CHANGES);

        const metadata = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata;
        expect(metadata).toStrictEqual({ storefrontBuiltThrough: '2026-10-22' });
        expect(storefrontNeedsReset(project, CHANGES)).toBe(false);
    });

    it('marks a build that could not finish, so the storefront shows Needs reset', () => {
        const project = eds(new Date('2026-10-23T00:00:00Z'));

        recordStorefrontBuilt(project, false, CHANGES);

        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).toStrictEqual({
            storefrontBuiltThrough: '2026-10-22',
            storefrontBuildIncomplete: true,
        });
        expect(storefrontNeedsReset(project, CHANGES)).toBe(true);
    });

    it('clears the incomplete mark once a reset finishes', () => {
        const project = eds(undefined, { storefrontBuiltThrough: '2026-09-15', storefrontBuildIncomplete: true, githubRepo: 'me/store' });

        recordStorefrontBuilt(project, true, CHANGES);

        expect(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.metadata).toStrictEqual({
            githubRepo: 'me/store',
            storefrontBuiltThrough: '2026-10-22',
        });
    });

    it('leaves a project with no storefront alone', () => {
        const project = { ...eds(undefined), componentInstances: {} };

        recordStorefrontBuilt(project, true, CHANGES);

        expect(project.componentInstances).toStrictEqual({});
    });
});

describe('STOREFRONT_CHANGES', () => {
    it('dates every change as YYYY-MM-DD, oldest first, each with an id, a line and its evidence', () => {
        const days = STOREFRONT_CHANGES.map((c) => c.since);

        expect(days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)))).toBe(true);
        expect([...days].sort()).toStrictEqual(days);
        expect(new Set(STOREFRONT_CHANGES.map((c) => c.id)).size).toBe(STOREFRONT_CHANGES.length);
        expect(STOREFRONT_CHANGES.every((c) => c.what.length > 0 && c.evidence.length > 0)).toBe(true);
    });
});

describe('the words', () => {
    it('are the owner\'s, with no date in them', () => {
        expect(NEEDS_RESET_LABEL).toBe('Needs reset');
        expect(NEEDS_RESET_LINE).toBe(
            "Demo Builder has fixes this storefront doesn't have yet.",
        );
    });
});
