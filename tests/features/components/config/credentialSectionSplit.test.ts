/**
 * Credentials are their own section, and nothing loses them in the split.
 *
 * They used to trail the ACCS endpoint inside Connection. Since the served state
 * renders one line saying nothing needs entering, and "Use my own instead" reveals
 * two inputs, those inputs had no heading to belong to — they appeared under a
 * field they have nothing to do with.
 *
 * The risk in slicing them out is the opposite failure: a field that no section
 * claims renders NOWHERE. That is not hypothetical here — the header comment on
 * `commerceSectionValidity` records a shipped deadlock caused by exactly that, so
 * the last test walks every field and asserts each is claimed exactly once.
 */

import {
    filterGroupsForSection,
    type ConnectStoreSection,
} from '@/features/components/config/storeFieldHelpers';

/** One ACCS group carrying a field from each section. */
const groups = [
    {
        id: 'accs',
        fields: [
            { key: 'ACCS_GRAPHQL_ENDPOINT' },
            { key: 'ACCS_OAUTH_CLIENT_ID' },
            { key: 'ACCS_OAUTH_CLIENT_SECRET' },
            { key: 'ACCS_WEBSITE_CODE' },
            { key: 'ACCS_STORE_CODE' },
            { key: 'ACCS_STORE_VIEW_CODE' },
        ],
    },
];

const keysIn = (section: ConnectStoreSection): string[] =>
    filterGroupsForSection(groups, section).flatMap((g) => g.fields.map((f) => f.key));

describe('the credentials slice', () => {
    it('holds exactly the OAuth pair', () => {
        expect(keysIn('credentials').sort()).toEqual([
            'ACCS_OAUTH_CLIENT_ID',
            'ACCS_OAUTH_CLIENT_SECRET',
        ]);
    });

    it('is gone from connection, which keeps the endpoint', () => {
        const connection = keysIn('connection');

        expect(connection).toContain('ACCS_GRAPHQL_ENDPOINT');
        expect(connection).not.toContain('ACCS_OAUTH_CLIENT_ID');
        expect(connection).not.toContain('ACCS_OAUTH_CLIENT_SECRET');
    });

    it('does not disturb the store cascade', () => {
        expect(keysIn('business-structure').sort()).toEqual([
            'ACCS_STORE_CODE',
            'ACCS_STORE_VIEW_CODE',
            'ACCS_WEBSITE_CODE',
        ]);
    });
});

describe('nothing is lost or duplicated', () => {
    it('claims every field exactly once across the sections', () => {
        // The guard that matters. A field claimed by NO section renders nowhere —
        // the shipped deadlock this split risks repeating — and one claimed twice
        // renders twice.
        const claimed = [
            ...keysIn('connection'),
            ...keysIn('credentials'),
            ...keysIn('business-structure'),
        ];

        const counts = new Map<string, number>();
        for (const key of claimed) counts.set(key, (counts.get(key) ?? 0) + 1);

        expect([...counts.values()].every((n) => n === 1)).toBe(true);
        expect(claimed.sort()).toEqual(groups[0].fields.map((f) => f.key).sort());
    });

    it('the wizard renders connection AND credentials together', () => {
        // The wizard rail has no Credentials tab, so its Connection view must carry
        // both — otherwise creation offers no way to supply your own pair.
        const wizardConnection = [...keysIn('connection'), ...keysIn('credentials')];

        expect(wizardConnection).toContain('ACCS_GRAPHQL_ENDPOINT');
        expect(wizardConnection).toContain('ACCS_OAUTH_CLIENT_ID');
    });
});
