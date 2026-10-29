/**
 * componentConfigWrites tests
 *
 * The shared read/write over `componentConfigs`, used by both commerce config surfaces
 * (the wizard's `useComponentConfig` and Configure's `useConfigureFieldValues`).
 *
 * The non-mutation cases are why this module exists: both surfaces used to clone the
 * outer object only and then write through into the per-component object they were
 * handed — which, on the Configure screen, is the `existingEnvValues` prop.
 */

import {
    applyFieldUpdate,
    findFieldValue,
    removeKeysFromComponents,
    resolveWriteTargets,
    writeFieldValue,
    writeToComponents,
} from '@/features/components/services/componentConfigWrites';

const field = { key: 'ADOBE_COMMERCE_URL', componentIds: ['headless'] };
const sharedField = { key: 'ADOBE_COMMERCE_URL', componentIds: ['headless', 'backend'] };

describe('findFieldValue', () => {
    it('returns the value from the declaring component', () => {
        const configs = { headless: { ADOBE_COMMERCE_URL: 'https://a.test' } };
        expect(findFieldValue(configs, field)).toBe('https://a.test');
    });

    it('takes the FIRST declaring component that holds a value', () => {
        const configs = {
            headless: { ADOBE_COMMERCE_URL: '' },
            backend: { ADOBE_COMMERCE_URL: 'https://b.test' },
        };
        expect(findFieldValue(configs, sharedField)).toBe('https://b.test');
    });

    it('ignores a component that does not declare the field', () => {
        const configs = { other: { ADOBE_COMMERCE_URL: 'https://elsewhere.test' } };
        expect(findFieldValue(configs, field)).toBeUndefined();
    });

    it('skips a declaring component that holds no value for the field at all', () => {
        // Absent is not the same case as empty: the loop has to step over BOTH, or a
        // component that simply never had the key answers for the ones that do.
        const configs = { headless: {}, backend: { ADOBE_COMMERCE_URL: 'https://b.test' } };
        expect(findFieldValue(configs, sharedField)).toBe('https://b.test');
    });

    it('treats an empty string as absent', () => {
        expect(findFieldValue({ headless: { ADOBE_COMMERCE_URL: '' } }, field)).toBeUndefined();
    });

    it('returns undefined for empty configs', () => {
        expect(findFieldValue({}, field)).toBeUndefined();
    });
});

describe('writeToComponents', () => {
    it('sets the values on every listed component', () => {
        const next = writeToComponents({}, ['headless', 'backend'], { A: '1', B: '2' });
        expect(next).toEqual({ headless: { A: '1', B: '2' }, backend: { A: '1', B: '2' } });
    });

    it('keeps the other keys a component already had', () => {
        const configs = { headless: { EXISTING: 'keep' } };
        expect(writeToComponents(configs, ['headless'], { A: '1' })).toEqual({
            headless: { EXISTING: 'keep', A: '1' },
        });
    });

    it('leaves components it was not asked to touch alone', () => {
        const configs = { headless: { A: '1' }, untouched: { B: '2' } };
        const next = writeToComponents(configs, ['headless'], { A: '9' });
        expect(next.untouched).toBe(configs.untouched);
    });

    it('does NOT mutate the configs it was given (the reason this module exists)', () => {
        const configs = { headless: { A: 'original' } };
        writeToComponents(configs, ['headless'], { A: 'edited' });
        expect(configs).toEqual({ headless: { A: 'original' } });
    });

    it('replaces the per-component object rather than editing it (the mechanism)', () => {
        const configs = { headless: { A: 'original' } };
        const next = writeToComponents(configs, ['headless'], { A: 'edited' });
        expect(next.headless).not.toBe(configs.headless);
        expect(next).not.toBe(configs);
    });
});

describe('writeFieldValue', () => {
    it('writes one field to every component that declares it', () => {
        const next = writeFieldValue({}, sharedField, 'https://edited.test');
        expect(next.headless.ADOBE_COMMERCE_URL).toBe('https://edited.test');
        expect(next.backend.ADOBE_COMMERCE_URL).toBe('https://edited.test');
    });

    it('does not mutate its input either', () => {
        const configs = { headless: { ADOBE_COMMERCE_URL: 'https://original.test' } };
        writeFieldValue(configs, field, 'https://edited.test');
        expect(configs.headless.ADOBE_COMMERCE_URL).toBe('https://original.test');
    });
});

/**
 * `resolveWriteTargets` — the write side of the backend-owned scope rule.
 *
 * Store scope is a project-level fact. Storing a copy per component is what let
 * one copy go stale on 2026-08-10 while another was updated, so the mesh deployed
 * against the previous website and every PDP returned 200 with an empty product
 * block. `backendOwnedScope` made the READS agree; this makes the WRITE single, so
 * there is no second copy to disagree with.
 */
describe('resolveWriteTargets', () => {
    const BACKEND = 'adobe-commerce-accs';

    it('narrows a backend-owned scope key to the backend alone', () => {
        const scopeField = {
            key: 'ACCS_WEBSITE_CODE',
            componentIds: [BACKEND, 'eds-accs-mesh', 'headless'],
        };

        expect(resolveWriteTargets(scopeField, BACKEND)).toEqual([BACKEND]);
    });

    it('leaves a non-scope key writing to every declaring component', () => {
        // Each component renders its own .env; three consumers of one setting is
        // not duplication. Only the SOURCE has to be single.
        const urlField = { key: 'ADOBE_COMMERCE_URL', componentIds: [BACKEND, 'headless'] };

        expect(resolveWriteTargets(urlField, BACKEND)).toEqual([BACKEND, 'headless']);
    });

    it('falls back to the declared list when the backend does not declare the field', () => {
        // Better a duplicate than a value written nowhere.
        const orphan = { key: 'ACCS_WEBSITE_CODE', componentIds: ['eds-accs-mesh'] };

        expect(resolveWriteTargets(orphan, BACKEND)).toEqual(['eds-accs-mesh']);
    });

    it('falls back to the declared list when no backend is known', () => {
        const scopeField = { key: 'ACCS_WEBSITE_CODE', componentIds: [BACKEND, 'eds-accs-mesh'] };

        expect(resolveWriteTargets(scopeField, undefined)).toEqual([BACKEND, 'eds-accs-mesh']);
    });

    it('routes writeFieldValue through the same narrowing', () => {
        const scopeField = {
            key: 'ACCS_WEBSITE_CODE',
            componentIds: [BACKEND, 'eds-accs-mesh'],
        };

        const next = writeFieldValue({}, scopeField, 'citisignal', BACKEND);

        expect(next[BACKEND].ACCS_WEBSITE_CODE).toBe('citisignal');
        expect(next['eds-accs-mesh']).toBeUndefined();
    });
});

/**
 * `applyFieldUpdate` — the edit both config surfaces apply (PL-69 pairs 11 and 12).
 *
 * The wizard's `useComponentConfig` and Configure's `useConfigureFieldValues` carried
 * this block verbatim: write the value where `resolveWriteTargets` says, and when the
 * PaaS Commerce URL changes, fill the GraphQL endpoint from it unless the user has
 * already typed one. The hook suites still drive it through `updateField`; these cases
 * pin the pure function on its own.
 */
describe('applyFieldUpdate', () => {
    const BACKEND = 'adobe-commerce-paas';
    const untouched: ReadonlySet<string> = new Set();
    const paasUrlField = { key: 'ADOBE_COMMERCE_URL', componentIds: ['headless', BACKEND] };
    const graphqlKey = 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT';

    it('writes the value to every component that declares the field', () => {
        const next = applyFieldUpdate({}, sharedField, 'https://edited.test', {
            backendId: undefined,
            touchedFields: untouched,
        });

        expect(next.headless.ADOBE_COMMERCE_URL).toBe('https://edited.test');
        expect(next.backend.ADOBE_COMMERCE_URL).toBe('https://edited.test');
    });

    it('derives the GraphQL endpoint from a PaaS URL edit, trailing slash dropped', () => {
        const next = applyFieldUpdate({}, paasUrlField, 'https://commerce.test/', {
            backendId: BACKEND,
            touchedFields: untouched,
        });

        expect(next.headless[graphqlKey]).toBe('https://commerce.test/graphql');
        expect(next[BACKEND][graphqlKey]).toBe('https://commerce.test/graphql');
    });

    it('leaves a GraphQL endpoint the user has already touched alone', () => {
        const configs = { headless: { [graphqlKey]: 'https://custom.test/gql' } };

        const next = applyFieldUpdate(configs, paasUrlField, 'https://commerce.test', {
            backendId: BACKEND,
            touchedFields: new Set([graphqlKey]),
        });

        expect(next.headless[graphqlKey]).toBe('https://custom.test/gql');
        expect(next.headless.ADOBE_COMMERCE_URL).toBe('https://commerce.test');
    });

    it('derives nothing for a field that is not the PaaS URL', () => {
        const other = { key: 'NOTES', componentIds: ['headless'] };

        const next = applyFieldUpdate({}, other, 'https://commerce.test', {
            backendId: BACKEND,
            touchedFields: untouched,
        });

        expect(next.headless).toEqual({ NOTES: 'https://commerce.test' });
    });

    it('derives nothing when the PaaS URL is set to a boolean', () => {
        // The type allows it (ConfigFieldRenderer writes real booleans), and a
        // boolean has no URL to derive from.
        const next = applyFieldUpdate({}, paasUrlField, true, {
            backendId: BACKEND,
            touchedFields: untouched,
        });

        expect(next.headless).toEqual({ ADOBE_COMMERCE_URL: true });
    });

    it('narrows a backend-owned scope key to the backend alone', () => {
        const scopeField = { key: 'ACCS_WEBSITE_CODE', componentIds: ['eds-accs-mesh', BACKEND] };

        const next = applyFieldUpdate({}, scopeField, 'citisignal', {
            backendId: BACKEND,
            touchedFields: untouched,
        });

        expect(next[BACKEND].ACCS_WEBSITE_CODE).toBe('citisignal');
        expect(next['eds-accs-mesh']).toBeUndefined();
    });

    it('does not mutate the configs it was given', () => {
        const configs = { headless: { ADOBE_COMMERCE_URL: 'https://original.test' } };

        applyFieldUpdate(configs, paasUrlField, 'https://edited.test', {
            backendId: undefined,
            touchedFields: untouched,
        });

        expect(configs).toEqual({ headless: { ADOBE_COMMERCE_URL: 'https://original.test' } });
    });
});

describe('removeKeysFromComponents', () => {
    it('removes the named keys from every component, keeping the rest', () => {
        const configs = {
            backend: { ACCS_WEBSITE_CODE: 'citisignal', COMMERCE_URL: 'https://a.test' },
            headless: { ACCS_WEBSITE_CODE: 'citisignal' },
        };

        const next = removeKeysFromComponents(configs, ['ACCS_WEBSITE_CODE']);

        expect(next).toEqual({
            backend: { COMMERCE_URL: 'https://a.test' },
            headless: {},
        });
    });

    it('strips a key a component holds even when it holds none of the others', () => {
        // Package switching passes the outgoing AND incoming packages' keys together,
        // so most components hold only some of them. Requiring all of them would
        // leave the stale value in place and let the fill skip it.
        const configs = { backend: { ACCS_WEBSITE_CODE: 'citisignal' } };

        expect(removeKeysFromComponents(configs, ['ACCS_WEBSITE_CODE', 'ACCS_STORE_CODE'])).toEqual({
            backend: {},
        });
    });

    it('carries forward the components it did not have to strip', () => {
        // The copy is of the WHOLE configs object; building a fresh one from the
        // stripped components alone would silently drop everything else.
        const configs = { backend: { ACCS_WEBSITE_CODE: 'citisignal' }, untouched: { A: '1' } };

        const next = removeKeysFromComponents(configs, ['ACCS_WEBSITE_CODE']);

        expect(next.untouched).toBe(configs.untouched);
    });

    it('returns the SAME object when nothing matches (no spurious re-renders)', () => {
        const configs = { backend: { COMMERCE_URL: 'https://a.test' } };

        expect(removeKeysFromComponents(configs, ['ACCS_WEBSITE_CODE'])).toBe(configs);
    });

    it('does not mutate the input configs', () => {
        const configs = { backend: { ACCS_WEBSITE_CODE: 'citisignal' } };

        removeKeysFromComponents(configs, ['ACCS_WEBSITE_CODE']);

        expect(configs.backend.ACCS_WEBSITE_CODE).toBe('citisignal');
    });
});
