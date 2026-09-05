/**
 * useConfigureFieldValues Tests
 *
 * The Configure screen's field values, lifted so an edit survives switching sections.
 *
 * The mutation cases are the point of this file. `updateField` and `normalizeUrlField`
 * used to copy `componentConfigs` one level deep and then write INTO the per-component
 * object they were handed — so editing a field rewrote the caller's `existingEnvValues`
 * in place. It surfaced on 2026-08-10 as a Configure test that passed alone and failed in
 * sequence, because the shared fixture arrived at the second test already carrying the
 * first test's typing.
 */

import { act } from '@testing-library/react';
import { render, sharedField, textField, urlField } from './useConfigureFieldValues.testUtils';
import type { UniqueField } from './useConfigureFieldValues.testUtils';
import { createMockProject } from '../../../../../helpers/projectFake';

const GRAPHQL_KEY = 'ADOBE_COMMERCE_GRAPHQL_ENDPOINT';

/** The linked GraphQL endpoint field, declared by the same component. */
const graphqlField: UniqueField = { ...urlField, key: GRAPHQL_KEY };

describe('useConfigureFieldValues', () => {
    describe('does not mutate the values it was handed', () => {
        it('leaves existingEnvValues untouched when a field is edited', () => {
            const existing = { headless: { ADOBE_COMMERCE_URL: 'https://original.test' } };
            const { result } = render(existing);

            act(() => result.current.updateField(urlField, 'https://edited.test'));

            expect(existing.headless.ADOBE_COMMERCE_URL).toBe('https://original.test');
            expect(result.current.componentConfigs.headless.ADOBE_COMMERCE_URL).toBe(
                'https://edited.test'
            );
        });

        it('leaves it untouched across every component the field belongs to', () => {
            const existing = {
                headless: { ADOBE_COMMERCE_URL: 'https://original.test' },
                backend: { ADOBE_COMMERCE_URL: 'https://original.test' },
            };
            const { result } = render(existing);

            act(() => result.current.updateField(sharedField, 'https://edited.test'));

            expect(existing.headless.ADOBE_COMMERCE_URL).toBe('https://original.test');
            expect(existing.backend.ADOBE_COMMERCE_URL).toBe('https://original.test');
        });

        it('leaves it untouched when a URL is normalized on blur', () => {
            const existing = { headless: { ADOBE_COMMERCE_URL: 'https://original.test/' } };
            const { result } = render(existing);

            act(() => result.current.normalizeUrlField(urlField));

            expect(existing.headless.ADOBE_COMMERCE_URL).toBe('https://original.test/');
            expect(result.current.componentConfigs.headless.ADOBE_COMMERCE_URL).toBe(
                'https://original.test'
            );
        });

        it('leaves it untouched when an App Builder value is staged', () => {
            const existing = { 'erp-integration': { ERP_HOST: 'original.test' } };
            const { result } = render(existing);

            act(() =>
                result.current.stageAppBuilderComponentValue(
                    'erp-integration',
                    'ERP_HOST',
                    'edited.test'
                )
            );

            expect(existing['erp-integration'].ERP_HOST).toBe('original.test');
        });

        it('replaces the per-component object rather than editing it (the mechanism)', () => {
            const existing = { headless: { ADOBE_COMMERCE_URL: 'https://original.test' } };
            const { result } = render(existing);
            const before = result.current.componentConfigs.headless;

            act(() => result.current.updateField(urlField, 'https://edited.test'));

            expect(result.current.componentConfigs.headless).not.toBe(before);
        });
    });

    describe('the edits themselves still work', () => {
        it('writes the value to every component that declares the field', () => {
            const { result } = render();

            act(() => result.current.updateField(sharedField, 'https://edited.test'));

            expect(result.current.componentConfigs.headless.ADOBE_COMMERCE_URL).toBe(
                'https://edited.test'
            );
            expect(result.current.componentConfigs.backend.ADOBE_COMMERCE_URL).toBe(
                'https://edited.test'
            );
        });

        it('marks an edited field touched', () => {
            const { result } = render();

            act(() => result.current.updateField(urlField, 'https://edited.test'));

            expect(result.current.touchedFields.has('ADOBE_COMMERCE_URL')).toBe(true);
        });

        it('derives the GraphQL endpoint from a PAAS URL edit', () => {
            const { result } = render();

            act(() => result.current.updateField(urlField, 'https://commerce.test/'));

            // The linked write rides the SAME setState, so both land together.
            expect(result.current.componentConfigs.headless[GRAPHQL_KEY]).toBe(
                'https://commerce.test/graphql'
            );
        });

        it('does NOT derive over a GraphQL endpoint the user has already typed', () => {
            const { result } = render();

            act(() => result.current.updateField(graphqlField, 'https://custom.test/gql'));
            act(() => result.current.updateField(urlField, 'https://commerce.test'));

            expect(result.current.componentConfigs.headless[GRAPHQL_KEY]).toBe(
                'https://custom.test/gql'
            );
        });

        it('derives nothing for a field that is not the PAAS URL', () => {
            const { result } = render();

            act(() => result.current.updateField(textField, 'default'));

            expect(result.current.componentConfigs.headless[GRAPHQL_KEY]).toBeUndefined();
        });

        it('derives nothing when the PAAS URL is set to a boolean', () => {
            const { result } = render();

            act(() => result.current.updateField(urlField, true));

            expect(result.current.componentConfigs.headless[GRAPHQL_KEY]).toBeUndefined();
        });

        it('writes without a backend selection on the project', () => {
            const { result } = render(undefined, createMockProject({ componentSelections: undefined }));

            act(() => result.current.updateField(urlField, 'https://commerce.test'));

            expect(result.current.componentConfigs.headless.ADOBE_COMMERCE_URL).toBe(
                'https://commerce.test'
            );
        });
    });

    describe('staging an App Builder component value', () => {
        it('adds the value under the component own id', () => {
            const { result } = render();

            act(() => result.current.stageAppBuilderComponentValue('erp', 'ERP_HOST', 'erp.test'));

            expect(result.current.componentConfigs.erp).toEqual({ ERP_HOST: 'erp.test' });
        });

        it('KEEPS the values already staged for that component', () => {
            const { result } = render({ erp: { ERP_HOST: 'erp.test' } });

            act(() => result.current.stageAppBuilderComponentValue('erp', 'ERP_KEY', 'k'));

            expect(result.current.componentConfigs.erp).toEqual({
                ERP_HOST: 'erp.test',
                ERP_KEY: 'k',
            });
        });

        it('keeps every OTHER component untouched', () => {
            const { result } = render({ headless: { ADOBE_COMMERCE_URL: 'https://a.test' } });

            act(() => result.current.stageAppBuilderComponentValue('erp', 'ERP_KEY', 'k'));

            expect(result.current.componentConfigs.headless).toEqual({
                ADOBE_COMMERCE_URL: 'https://a.test',
            });
        });

        it('is referentially stable, so a memoised field does not re-render on every keystroke', () => {
            const { result, rerender } = render();
            const before = result.current.stageAppBuilderComponentValue;

            rerender({ existingEnvValues: undefined });

            expect(result.current.stageAppBuilderComponentValue).toBe(before);
        });
    });

    describe('normalizeUrlField', () => {
        it('leaves a NON-url field alone even when it ends in a slash', () => {
            const { result } = render({ headless: { STORE_CODE: 'main/' } });

            act(() => result.current.normalizeUrlField(textField));

            expect(result.current.componentConfigs.headless.STORE_CODE).toBe('main/');
        });

        it('leaves an empty url field alone', () => {
            const { result } = render({ headless: { ADOBE_COMMERCE_URL: '' } });
            const before = result.current.componentConfigs;

            act(() => result.current.normalizeUrlField(urlField));

            expect(result.current.componentConfigs).toBe(before);
        });

        it('leaves a url field alone when it holds a non-string value', () => {
            const { result } = render();
            act(() => result.current.updateField(urlField, true));
            const before = result.current.componentConfigs;

            act(() => result.current.normalizeUrlField(urlField));

            expect(result.current.componentConfigs).toBe(before);
        });

        it('writes only to the components the field declares', () => {
            const { result } = render({
                headless: { ADOBE_COMMERCE_URL: 'https://a.test/' },
                unrelated: { ADOBE_COMMERCE_URL: 'https://b.test/' },
            });

            act(() => result.current.normalizeUrlField(urlField));

            expect(result.current.componentConfigs.headless.ADOBE_COMMERCE_URL).toBe(
                'https://a.test'
            );
            expect(result.current.componentConfigs.unrelated.ADOBE_COMMERCE_URL).toBe(
                'https://b.test/'
            );
        });

        it('leaves a URL without a trailing slash alone', () => {
            const existing = { headless: { ADOBE_COMMERCE_URL: 'https://original.test' } };
            const { result } = render(existing);
            const before = result.current.componentConfigs;

            act(() => result.current.normalizeUrlField(urlField));

            // Nothing to change — and therefore no new state object either.
            expect(result.current.componentConfigs).toBe(before);
        });
    });
});
