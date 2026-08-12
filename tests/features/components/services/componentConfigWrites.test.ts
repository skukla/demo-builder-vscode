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
    findFieldValue,
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
