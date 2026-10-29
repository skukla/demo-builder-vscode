/**
 * The shipped App Builder catalog asks nobody for a value at add time.
 *
 * Adding an integration whose settings have no default is not supported yet: the
 * add refuses it (`handleAddAppBuilderComponent`), and the add that puts it on the
 * grid undeployed and opens its Settings is AB-22. So the day someone authors an
 * entry with such a setting, this fails and says what has to be built first,
 * rather than the entry shipping with an add that can only say no.
 *
 * Read against the REAL catalog, deliberately: a mocked one would pass whatever
 * the file held.
 */

import { getAppBuilderComponentCatalog } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { userSuppliedEnvVars } from '@/features/dashboard/handlers/appBuilderComponentHandlers';

describe('the shipped App Builder catalog', () => {
    const entries = getAppBuilderComponentCatalog();

    it('control: it holds entries, and some declare settings', () => {
        expect(entries.length).toBeGreaterThan(0);
        expect(entries.some((entry) => (entry.envSchema ?? []).length > 0)).toBe(true);
    });

    it('declares no setting a person must type before the add can deploy (AB-22)', () => {
        const needingValues = entries
            .map((entry) => ({ id: entry.id, names: userSuppliedEnvVars(entry).names }))
            .filter((row) => row.names.length > 0);

        expect(needingValues).toStrictEqual([]);
    });
});
