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
