/**
 * useConfigureFieldValues — what the Configure form READS back.
 *
 * Three accessors sit between the stored map and the rendered field, and they do
 * not agree on purpose:
 *
 *   getValueFromConfigs  the raw stored value, defaults ignored — what validation
 *                        judges, so a required field with only a default is still
 *                        incomplete to the validator
 *   getFieldValue        what the input DISPLAYS, defaults included, except for a
 *                        field the user has touched: clearing one has to stay
 *                        cleared instead of resurfacing another component's value
 *   isFieldComplete      the display value, non-empty
 *
 * The second sweep in `getValueFromConfigs` is the subtle one. Some env vars are
 * declared by one component and written by another, so after the field's own
 * components come up empty it searches every OTHER component too — which is why
 * the tests below say which component a value came from, not just that one did.
 */

import { act } from '@testing-library/react';
import {
    render,
    sharedField,
    textField,
    urlField,
    type UniqueField,
} from './useConfigureFieldValues.testUtils';
import { createMockProject } from '../../../../../helpers/projectFake';

/** The same key, declared by a component that holds no value for it. */
const orphanField: UniqueField = { ...textField, componentIds: ['not-in-configs'] };

describe('useConfigureFieldValues - reading values back', () => {
    describe('seeding', () => {
        it('seeds from the extension-resolved values when it has any', () => {
            const { result } = render({ headless: { STORE_CODE: 'from-env' } });

            expect(result.current.componentConfigs).toEqual({
                headless: { STORE_CODE: 'from-env' },
            });
        });

        it('falls back to the project manifest when the resolved values are EMPTY', () => {
            const { result } = render(
                {},
                createMockProject({
                    componentConfigs: { headless: { STORE_CODE: 'from-manifest' } },
                })
            );

            expect(result.current.componentConfigs).toEqual({
                headless: { STORE_CODE: 'from-manifest' },
            });
        });

        it('falls back to the manifest when no resolved values arrive at all', () => {
            const { result } = render(
                undefined,
                createMockProject({
                    componentConfigs: { headless: { STORE_CODE: 'from-manifest' } },
                })
            );

            expect(result.current.componentConfigs.headless.STORE_CODE).toBe('from-manifest');
        });

        it('starts empty when neither source has anything', () => {
            const { result } = render(
                undefined,
                createMockProject({ componentConfigs: undefined })
            );

            expect(result.current.componentConfigs).toEqual({});
        });

        it('RE-SEEDS when Configure is reopened and sends fresh values', () => {
            const { result, rerender } = render({ headless: { STORE_CODE: 'first' } });

            // Reopening re-sends `init` without remounting React; the effect has to
            // notice, or the form shows the previous project's values.
            rerender({ existingEnvValues: { headless: { STORE_CODE: 'second' } } });

            expect(result.current.componentConfigs.headless.STORE_CODE).toBe('second');
        });
    });

    describe('getValueFromConfigs — the raw stored value', () => {
        it('reads a value from a component the field declares', () => {
            const { result } = render({ headless: { STORE_CODE: 'main' } });

            expect(result.current.getValueFromConfigs(textField)).toBe('main');
        });

        it('finds a SHARED env var stored under a component the field does not declare', () => {
            const { result } = render({ 'some-other-component': { STORE_CODE: 'from-elsewhere' } });

            expect(result.current.getValueFromConfigs(textField)).toBe('from-elsewhere');
        });

        it('prefers the field own component over the foreign sweep', () => {
            const { result } = render({
                headless: { STORE_CODE: 'own' },
                'some-other-component': { STORE_CODE: 'foreign' },
            });

            expect(result.current.getValueFromConfigs(textField)).toBe('own');
        });

        it('skips a foreign component that stores the key EMPTY', () => {
            const { result } = render({
                'empty-holder': { STORE_CODE: '' },
                'real-holder': { STORE_CODE: 'from-elsewhere' },
            });

            expect(result.current.getValueFromConfigs(textField)).toBe('from-elsewhere');
        });

        it('never searches a declaring component twice in the foreign sweep', () => {
            // 'headless' declares the field and holds it EMPTY. The sweep must skip
            // it — reading it again would return '' and mask the real value.
            const { result } = render({
                headless: { STORE_CODE: '' },
                other: { STORE_CODE: 'from-elsewhere' },
            });

            expect(result.current.getValueFromConfigs(textField)).toBe('from-elsewhere');
        });

        it('keeps sweeping past a foreign component that does not hold the key at all', () => {
            const { result } = render({
                'holds-nothing': { SOMETHING_ELSE: 'x' },
                'holds-it': { STORE_CODE: 'found' },
            });

            // Stopping at the first foreign component would answer undefined here,
            // and a shared env var written by a later component would read blank.
            expect(result.current.getValueFromConfigs(textField)).toBe('found');
        });

        it('returns undefined when nothing anywhere holds the key', () => {
            const { result } = render({ headless: { SOMETHING_ELSE: 'x' } });

            expect(result.current.getValueFromConfigs(textField)).toBeUndefined();
        });

        it('IGNORES the default — that is the difference from getFieldValue', () => {
            const { result } = render({});

            expect(
                result.current.getValueFromConfigs({ ...textField, default: 'main' })
            ).toBeUndefined();
        });
    });

    describe('getFieldValue — what the input displays', () => {
        it('shows the stored value when there is one', () => {
            const { result } = render({ headless: { STORE_CODE: 'main' } });

            expect(result.current.getFieldValue(textField)).toBe('main');
        });

        it('shows a shared value found on another component', () => {
            const { result } = render({ elsewhere: { STORE_CODE: 'shared' } });

            expect(result.current.getFieldValue(textField)).toBe('shared');
        });

        it('shows the field default when nothing is stored', () => {
            const { result } = render({});

            expect(result.current.getFieldValue({ ...textField, default: 'main' })).toBe('main');
        });

        it('prefers a stored value over the default', () => {
            const { result } = render({ headless: { STORE_CODE: 'stored' } });

            expect(result.current.getFieldValue({ ...textField, default: 'main' })).toBe('stored');
        });

        it('shows empty — not the default — for a field whose default is an empty string', () => {
            const { result } = render({});

            expect(result.current.getFieldValue({ ...textField, default: '' })).toBe('');
        });

        it('shows empty for a field with neither a value nor a default', () => {
            const { result } = render({});

            expect(result.current.getFieldValue(textField)).toBe('');
        });

        it('renders an UNTOUCHED numeric stored value as a string', () => {
            const { result } = render(
                undefined,
                createMockProject({ componentConfigs: { headless: { STORE_CODE: 7 } } })
            );

            // The input is a text field; handing it a number renders nothing.
            expect(result.current.getFieldValue(textField)).toBe('7');
        });

        it('leaves an UNTOUCHED boolean stored value as a boolean', () => {
            const { result } = render(
                undefined,
                createMockProject({ componentConfigs: { headless: { STORE_CODE: true } } })
            );

            // A checkbox reads `true`; stringifying it would check the box for 'false' too.
            expect(result.current.getFieldValue(textField)).toBe(true);
        });

        it('leaves a BOOLEAN default as a boolean', () => {
            const { result } = render({});

            expect(result.current.getFieldValue({ ...textField, default: true })).toBe(true);
        });

        it('renders a numeric stored value as a string', () => {
            const { result } = render();
            act(() => result.current.stageAppBuilderComponentValue('headless', 'STORE_CODE', '7'));

            expect(result.current.getFieldValue(textField)).toBe('7');
        });

        it('renders a numeric DEFAULT as a string', () => {
            const { result } = render({});

            expect(result.current.getFieldValue({ ...textField, default: 42 })).toBe('42');
        });

        it('reads a boolean stored value through unchanged', () => {
            const { result } = render();
            act(() => result.current.updateField(textField, true));

            expect(result.current.getFieldValue(textField)).toBe(true);
        });

        it('does not crash on a field declared by a component that has no configs', () => {
            const { result } = render({ headless: { STORE_CODE: 'main' } });

            expect(result.current.getFieldValue(orphanField)).toBe('main');
        });

        describe('once the user has touched the field', () => {
            it('shows the value from the field OWN components only', () => {
                const { result } = render({ elsewhere: { STORE_CODE: 'shared' } });

                act(() => result.current.updateField(textField, 'typed'));

                expect(result.current.getFieldValue(textField)).toBe('typed');
            });

            it('stays CLEARED instead of resurfacing another component value', () => {
                const { result } = render({ elsewhere: { STORE_CODE: 'shared' } });

                act(() => result.current.updateField(textField, ''));

                expect(result.current.getFieldValue(textField)).toBe('');
            });

            it('stays cleared instead of falling back to the default', () => {
                const { result } = render({});
                const withDefault = { ...textField, default: 'main' };

                act(() => result.current.updateField(withDefault, ''));

                expect(result.current.getFieldValue(withDefault)).toBe('');
            });

            it('reads the SECOND declaring component when the first is empty', () => {
                const { result } = render({
                    headless: { ADOBE_COMMERCE_URL: '' },
                    backend: { ADOBE_COMMERCE_URL: 'https://backend.test' },
                });

                // Touch through a field that declares only 'headless', so the two
                // components keep their different values.
                act(() => result.current.updateField(urlField, ''));

                expect(result.current.getFieldValue(sharedField)).toBe('https://backend.test');
            });

            it('renders a numeric value from a declaring component as a string', () => {
                const { result } = render(
                    undefined,
                    createMockProject({ componentConfigs: { other: { STORE_CODE: 7 } } })
                );

                // Touching marks the KEY, so this second field over the same key
                // reads through the touched branch on its own component.
                act(() => result.current.updateField(textField, ''));

                expect(
                    result.current.getFieldValue({ ...textField, componentIds: ['other'] })
                ).toBe('7');
            });

            it('does not crash when a declaring component has no configs at all', () => {
                const { result } = render({});

                act(() => result.current.updateField(textField, 'typed'));

                expect(
                    result.current.getFieldValue({ ...textField, componentIds: ['ghost'] })
                ).toBe('');
            });
        });
    });

    describe('isFieldComplete', () => {
        it('is true for a field holding a value', () => {
            const { result } = render({ headless: { STORE_CODE: 'main' } });

            expect(result.current.isFieldComplete(textField)).toBe(true);
        });

        it('is false for a field holding nothing', () => {
            const { result } = render({});

            expect(result.current.isFieldComplete(textField)).toBe(false);
        });

        it('counts a DEFAULT as complete — it is the displayed value that matters', () => {
            const { result } = render({});

            expect(result.current.isFieldComplete({ ...textField, default: 'main' })).toBe(true);
        });

        it('is false again once the user clears a field that had a default', () => {
            const { result } = render({});
            const withDefault = { ...textField, default: 'main' };

            act(() => result.current.updateField(withDefault, ''));

            expect(result.current.isFieldComplete(withDefault)).toBe(false);
        });
    });

    describe('the accessors see the CURRENT configs, not the ones they closed over', () => {
        it('getValueFromConfigs reflects an edit made after it was created', () => {
            const { result } = render({});

            act(() => result.current.updateField(textField, 'typed'));

            expect(result.current.getValueFromConfigs(textField)).toBe('typed');
        });

        it('isFieldComplete reflects an edit made after it was created', () => {
            const { result } = render({});

            act(() => result.current.updateField(textField, 'typed'));

            expect(result.current.isFieldComplete(textField)).toBe(true);
        });
    });
});
