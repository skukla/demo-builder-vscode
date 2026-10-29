/**
 * The picker's pure half: which rows are pickable, how search matches, the sort
 * tie-break, and the two product-pill lenses. The rendered behaviour of the same
 * rules is covered by the ApiAccessPicker suites; this one pins the functions.
 */

import type { ApiAccessOption } from '@/core/ui/components/selection/ApiAccessPicker';
import {
    byDisplayName,
    familiesOf,
    familyChips,
    isPickable,
    matchesQuery,
    pickableApis,
} from '@/core/ui/components/selection/apiAccessFilters';

function api(overrides: Partial<ApiAccessOption> & { code: string }): ApiAccessOption {
    return { name: overrides.code, locked: false, ...overrides };
}

const EXPERIENCE = { code: 'marketing_cloud', name: 'Experience Cloud' };
const PLATFORM = { code: 'experience_platform', name: 'Adobe Experience Platform' };
const DOCUMENT = { code: 'document_cloud', name: 'Document Cloud' };

describe('isPickable', () => {
    it('accepts a plain free row', () => {
        expect(isPickable(api({ code: 'TargetSDK' }))).toBe(true);
    });

    it('rejects a locked row', () => {
        expect(isPickable(api({ code: 'TargetSDK', locked: true }))).toBe(false);
    });

    it('rejects a profile-bound row', () => {
        expect(isPickable(api({ code: 'TargetSDK', requiresProfile: true }))).toBe(false);
    });

    it('rejects a review-gated row', () => {
        expect(isPickable(api({ code: 'TargetSDK', requiresReview: true }))).toBe(false);
    });
});

describe('pickableApis', () => {
    it('keeps only the pickable rows, in their original order', () => {
        const rows = [
            api({ code: 'B' }),
            api({ code: 'L', locked: true }),
            api({ code: 'A' }),
            api({ code: 'R', requiresReview: true }),
        ];
        expect(pickableApis(rows).map((row) => row.code)).toEqual(['B', 'A']);
    });

    it('returns an empty list when nothing is pickable', () => {
        expect(pickableApis([api({ code: 'L', locked: true })])).toStrictEqual([]);
    });
});

describe('matchesQuery', () => {
    const target = api({ code: 'TargetSDK', name: 'Adobe Target' });

    it('matches on the display name, ignoring its case', () => {
        expect(matchesQuery(target, 'adobe tar')).toBe(true);
    });

    it('matches on the code, ignoring its case', () => {
        expect(matchesQuery(target, 'targetsdk')).toBe(true);
    });

    it('matches across the name and the code together', () => {
        expect(matchesQuery(target, 'target targetsdk')).toBe(true);
    });

    it('rejects a query in neither', () => {
        expect(matchesQuery(target, 'campaign')).toBe(false);
    });
});

describe('byDisplayName', () => {
    it('orders by display name, not by code', () => {
        const rows = [
            api({ code: 'A', name: 'Zeta' }),
            api({ code: 'Z', name: 'Alpha' }),
        ];
        expect([...rows].sort(byDisplayName).map((row) => row.name)).toEqual(['Alpha', 'Zeta']);
    });

    it('answers zero for equal names', () => {
        expect(byDisplayName(api({ code: 'A', name: 'Same' }), api({ code: 'B', name: 'Same' }))).toBe(
            0,
        );
    });
});

describe('familiesOf', () => {
    it('gives an API both its curated pill and its cloud pill', () => {
        const row = api({ code: 'CommerceSDK', name: 'Adobe Commerce', group: EXPERIENCE });
        expect(familiesOf(row)).toEqual(['curated:commerce', 'marketing_cloud']);
    });

    it('gives only the cloud pill when no curated pattern matches', () => {
        expect(familiesOf(api({ code: 'TargetSDK', group: PLATFORM }))).toEqual([
            'experience_platform',
        ]);
    });

    it('gives only the curated pill when the API has no cloud family', () => {
        expect(familiesOf(api({ code: 'RuntimeSDK', name: 'I/O Runtime' }))).toEqual([
            'curated:app-builder',
        ]);
    });

    it('drops an excluded cloud family', () => {
        expect(familiesOf(api({ code: 'SignSDK', group: DOCUMENT }))).toStrictEqual([]);
    });

    it('gives nothing to an ungrouped, unmatched API', () => {
        expect(familiesOf(api({ code: 'TargetSDK' }))).toStrictEqual([]);
    });

    it.each([
        ['App Builder'],
        ['AppBuilder'],
        ['Adobe I/O Events'],
        ['Adobe IO Management'],
        ['I/O Runtime'],
        ['API Mesh'],
        ['GraphQL Service'],
    ])('claims %s for the App Builder pill', (name) => {
        expect(familiesOf(api({ code: 'X', name }))).toEqual(['curated:app-builder']);
    });

    it('matches the curated pills on the code when the name says nothing', () => {
        expect(familiesOf(api({ code: 'commerce_events', name: 'Events' }))).toEqual([
            'curated:commerce',
        ]);
    });
});

describe('familyChips', () => {
    it('lists All, the curated pills in declared order, then clouds alphabetically', () => {
        const rows = [
            api({ code: 'TargetSDK', group: EXPERIENCE }),
            api({ code: 'MeshSDK', name: 'API Mesh' }),
            api({ code: 'CommerceSDK', name: 'Adobe Commerce', group: PLATFORM }),
        ];
        expect(familyChips(rows)).toEqual([
            { code: null, name: 'All' },
            { code: 'curated:commerce', name: 'Adobe Commerce' },
            { code: 'curated:app-builder', name: 'App Builder' },
            { code: 'experience_platform', name: 'Adobe Experience Platform' },
            { code: 'marketing_cloud', name: 'Experience Cloud' },
        ]);
    });

    it('lists a cloud family once however many APIs share it', () => {
        const rows = [
            api({ code: 'TargetSDK', group: EXPERIENCE }),
            api({ code: 'CampaignSDK', group: EXPERIENCE }),
        ];
        expect(familyChips(rows)).toEqual([
            { code: null, name: 'All' },
            { code: 'marketing_cloud', name: 'Experience Cloud' },
        ]);
    });

    it('omits a curated pill nothing matches', () => {
        const rows = [api({ code: 'CommerceSDK', name: 'Adobe Commerce' })];
        expect(familyChips(rows)).toEqual([
            { code: null, name: 'All' },
            { code: 'curated:commerce', name: 'Adobe Commerce' },
        ]);
    });

    it('returns no chips at all when nothing is groupable', () => {
        expect(familyChips([api({ code: 'TargetSDK' })])).toStrictEqual([]);
    });

    it('returns no chips when the only families present are excluded', () => {
        expect(familyChips([api({ code: 'SignSDK', group: DOCUMENT })])).toStrictEqual([]);
    });

    it('returns no chips for an empty list', () => {
        expect(familyChips([])).toStrictEqual([]);
    });
});
